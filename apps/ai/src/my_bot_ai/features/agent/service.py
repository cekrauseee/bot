"""Durable LangGraph agent construction and normalized event streaming."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Literal
from uuid import UUID

from langchain.agents import create_agent
from langchain_core.tools import BaseTool
from langgraph.types import Command

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.contracts import (
    MODEL_CAPABILITIES,
    AgentRequest,
    ModelName,
    NormalizedEvent,
    PlanStep,
    ProviderName,
    ReasoningEffort,
    Speed,
)
from my_bot_ai.features.agent.errors import CheckpointMissingError
from my_bot_ai.features.agent.models import build_chat_model, provider_builtin_tools
from my_bot_ai.features.agent.runtime import RuntimeClient, RuntimeContext, build_runtime_tools
from my_bot_ai.features.agent.tools import (
    AskUserQuestion,
    build_child_delegation_tool,
    build_core_tools,
)

MAX_TOOL_CALL_ID_LENGTH = 200
MAX_CHILD_AGENT_DEPTH = 4
CheckpointPhase = Literal["absent", "runnable", "interrupted", "completed"]
_DEFAULT_INVOCATION = object()


@dataclass(frozen=True, slots=True)
class PreparedAgentRequest:
    graph: Any
    provider: ProviderName
    config: dict[str, Any]
    invocation: Any
    should_invoke: bool
    checkpoint: dict[str, Any]
    error: Exception | None = None


def _content(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        text = value.get("text")
        return text if isinstance(text, str) else ""
    if isinstance(value, list):
        return "".join(_content(item) for item in value)
    return ""


def _blocks(chunk: Any) -> list[dict[str, Any]]:
    blocks = getattr(chunk, "content_blocks", None)
    if blocks is None:
        blocks = getattr(chunk, "content", [])
    return [block for block in blocks or [] if isinstance(block, dict)]


def _explicit_summary_values(value: Any) -> list[str]:
    """Extract text only from fields explicitly labelled as summaries."""

    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, dict):
        text = value.get("text")
        return [text] if isinstance(text, str) and text else []
    if isinstance(value, list):
        summaries: list[str] = []
        for item in value:
            summaries.extend(_explicit_summary_values(item))
        return summaries
    return []


def _reasoning_summaries(chunk: Any, provider: ProviderName | None) -> list[str]:
    """Return explicit provider summaries without exposing raw reasoning."""

    summaries: list[str] = []
    metadata = getattr(chunk, "response_metadata", {}) or {}
    additional = getattr(chunk, "additional_kwargs", {}) or {}
    inferred_provider = provider or metadata.get("model_provider")

    for source in (metadata, additional):
        summaries.extend(_explicit_summary_values(source.get("reasoning_summary")))

    for block in _blocks(chunk):
        if block.get("type") != "reasoning":
            continue
        summaries.extend(_explicit_summary_values(block.get("summary")))
        if inferred_provider in {"xai", "openrouter"}:
            # Compatible adapters can map streamed raw reasoning to a generic
            # reasoning block. Only explicit summary fields are safe to expose.
            continue
        for key in ("reasoning", "text"):
            value = block.get(key)
            if isinstance(value, str) and value:
                summaries.append(value)

    return list(dict.fromkeys(summaries))


def _sources(value: Any) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    if isinstance(value, dict):
        if value.get("url") and (value.get("title") or value.get("id")):
            url = str(value["url"])
            found.append(
                {
                    "id": str(value.get("id") or url),
                    "title": str(value.get("title") or url),
                    "url": url,
                    "domain": str(
                        value.get("domain") or url.split("//", 1)[-1].split("/", 1)[0]
                    ),
                }
            )
        for child in value.values():
            found.extend(_sources(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_sources(child))
    return list({item["url"]: item for item in found}.values())


def _event_name(event: dict[str, Any], data: dict[str, Any]) -> str:
    value = event.get("name") or data.get("name") or "tool"
    return str(value)


def _activity_id(event: dict[str, Any], name: str) -> str:
    return str(event.get("run_id") or event.get("id") or name)


def _tool_label(name: str, status: str) -> str:
    active = status == "in_progress"
    failed = status == "failed"
    labels = {
        "ask_user": ("Asking for input", "Asked for input", "Could not ask for input"),
        "filesystem_list": ("Inspecting files", "Inspected files", "Could not inspect files"),
        "filesystem_read": ("Reading files", "Read files", "Could not read files"),
        "filesystem_write": ("Updating files", "Updated files", "Could not update files"),
        "shell_exec": ("Running a command", "Ran a command", "Could not run a command"),
        "browser_open": ("Opening the browser", "Opened the browser", "Could not open the browser"),
        "browser_snapshot": (
            "Inspecting the page",
            "Inspected the page",
            "Could not inspect the page",
        ),
        "browser_click": (
            "Interacting with the page",
            "Interacted with the page",
            "Could not interact with the page",
        ),
        "browser_type": (
            "Entering text on the page",
            "Entered text on the page",
            "Could not enter text on the page",
        ),
        "browser_close": (
            "Closing the browser",
            "Closed the browser",
            "Could not close the browser",
        ),
    }
    pending, completed, error = labels.get(
        name,
        ("Using a tool", "Used a tool", "Could not use a tool"),
    )
    return error if failed else pending if active else completed


def _tool_target(name: str, data: dict[str, Any]) -> str | None:
    tool_input = data.get("input")
    if not isinstance(tool_input, dict):
        return None
    field = {
        "filesystem_list": "path",
        "filesystem_read": "path",
        "filesystem_write": "path",
        "shell_exec": "command",
        "browser_open": "url",
    }.get(name)
    value = tool_input.get(field) if field else None
    return value[:4_096] if isinstance(value, str) and value else None


def _tool_activity(event: dict[str, Any], data: dict[str, Any], status: str) -> dict[str, Any]:
    name = _event_name(event, data)
    target = _tool_target(name, data)
    return {
        "id": _activity_id(event, name),
        "name": name,
        "label": _tool_label(name, status),
        "status": status,
        **({"target": target} if target else {}),
    }


def _object_output(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    content = getattr(value, "content", value)
    if isinstance(content, dict):
        return content
    if not isinstance(content, str):
        return None
    try:
        parsed = json.loads(content)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _browser_tool_projection(
    name: str,
    kind: str,
    data: dict[str, Any],
) -> dict[str, Any] | None:
    if not name.startswith("browser_"):
        return None
    if kind == "on_tool_error":
        return {
            "state": "failed",
            "control": "agent",
            "message": "The browser operation failed.",
        }
    if kind == "on_tool_start":
        if name != "browser_open":
            return None
        tool_input = data.get("input")
        url = tool_input.get("url") if isinstance(tool_input, dict) else None
        return {
            "state": "launching",
            "control": "agent",
            **({"url": url} if isinstance(url, str) else {}),
        }
    if kind != "on_tool_end":
        return None
    output = _object_output(data.get("output"))
    if output is None:
        return None
    status = output.get("status")
    if not isinstance(status, dict):
        return None
    projection = dict(status)
    url = output.get("url")
    if isinstance(url, str):
        projection["url"] = url
    if name == "browser_request_user_control":
        projection["message"] = "The agent needs you to continue in the browser."
    elif name == "browser_close":
        projection["message"] = "Browser preview closed."
    return projection


def _normalized_plan(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    plan: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id")
        title = item.get("title")
        status = item.get("status")
        if (
            isinstance(item_id, str)
            and isinstance(title, str)
            and status in {"pending", "in_progress", "completed"}
        ):
            plan.append({"id": item_id, "title": title, "status": str(status)})
    return plan


def _tool_event(event: dict[str, Any]) -> NormalizedEvent | None:
    kind = event.get("event")
    if kind == "on_custom_event" and event.get("name") == "browser.frame":
        frame = event.get("data")
        if not isinstance(frame, dict):
            return None
        base64 = frame.get("base64")
        mime_type = frame.get("mime_type")
        captured_at = frame.get("captured_at")
        if (
            not isinstance(base64, str)
            or not 0 < len(base64) <= 2_000_000
            or mime_type not in {"image/png", "image/jpeg"}
            or not isinstance(captured_at, str)
            or not 0 < len(captured_at) <= 100
        ):
            return None
        return NormalizedEvent(
            type="browser.frame",
            data={
                "frame": {
                    "base64": base64,
                    "mime_type": mime_type,
                    "captured_at": captured_at,
                }
            },
        )
    if kind == "on_custom_event" and event.get("name") == "plan.updated":
        data = event.get("data") or {}
        plan = _normalized_plan(data.get("plan") if isinstance(data, dict) else None)
        if plan:
            return NormalizedEvent(type="plan.updated", data={"plan": plan})
        return None
    if kind not in {"on_tool_start", "on_tool_stream", "on_tool_end", "on_tool_error"}:
        return None
    data = event.get("data") or {}
    if not isinstance(data, dict):
        data = {}
    name = _event_name(event, data)
    if name == "update_plan":
        tool_input = data.get("input")
        plan = _normalized_plan(tool_input.get("plan") if isinstance(tool_input, dict) else None)
        if kind == "on_tool_start" and plan:
            return NormalizedEvent(type="plan.updated", data={"plan": plan})
        return None

    status = {
        "on_tool_start": "in_progress",
        "on_tool_stream": "in_progress",
        "on_tool_end": "completed",
        "on_tool_error": "failed",
    }[kind]
    if name == "delegate_to_child_agent":
        event_type = "child.started" if kind == "on_tool_start" else "child.completed"
        if kind == "on_tool_stream":
            return None
        child = _tool_activity(event, data, status)
        child["name"] = "child_agent"
        child["label"] = (
            "Delegating a task" if status == "in_progress" else "Delegated a task"
        )
        return NormalizedEvent(type=event_type, data={"child": child})

    event_type = {
        "on_tool_start": "tool.started",
        "on_tool_stream": "tool.updated",
        "on_tool_end": "tool.completed",
        "on_tool_error": "tool.completed",
    }[kind]
    projection = _browser_tool_projection(name, kind, data)
    return NormalizedEvent(
        type=event_type,
        data={
            "tool": _tool_activity(event, data, status),
            **({"browser_projection": projection} if projection else {}),
        },
    )


def _interrupt_payloads(snapshot: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for task in getattr(snapshot, "tasks", ()) or ():
        for item in getattr(task, "interrupts", ()) or ():
            value = getattr(item, "value", None)
            if not isinstance(value, dict):
                continue
            question_id = value.get("question_id")
            if not isinstance(question_id, str):
                continue
            candidate = {**value, "id": question_id}
            candidate.pop("question_id", None)
            try:
                question = AskUserQuestion.model_validate(candidate)
            except ValueError:
                continue
            payload = question.model_dump(mode="json")
            payload["question_id"] = question.id
            found.append(payload)
    return found


async def pending_questions(graph: Any, config: dict[str, Any]) -> list[dict[str, Any]]:
    """Read pending durable interrupts without exposing graph-native objects."""

    snapshot = await graph.aget_state(config)
    return _interrupt_payloads(snapshot)


def _checkpoint_id(snapshot: Any) -> str | None:
    config = getattr(snapshot, "config", None)
    if not isinstance(config, dict):
        return None
    configurable = config.get("configurable")
    if not isinstance(configurable, dict):
        return None
    checkpoint_id = configurable.get("checkpoint_id")
    return checkpoint_id if isinstance(checkpoint_id, str) else None


def _checkpoint_exists(snapshot: Any) -> bool:
    return bool(
        _checkpoint_id(snapshot)
        or getattr(snapshot, "created_at", None)
        or getattr(snapshot, "metadata", None)
    )


def _message_role(message: Any) -> str | None:
    if isinstance(message, dict):
        role = message.get("role") or message.get("type")
    else:
        role = getattr(message, "type", None) or getattr(message, "role", None)
    return role if isinstance(role, str) else None


def _checkpoint_content(snapshot: Any) -> str:
    values = getattr(snapshot, "values", None)
    if not isinstance(values, dict):
        return ""
    messages = values.get("messages")
    if not isinstance(messages, (list, tuple)):
        return ""
    current_turn_start = 0
    for index, message in enumerate(messages):
        if _message_role(message) in {"human", "user"}:
            current_turn_start = index + 1
    parts: list[str] = []
    for message in messages[current_turn_start:]:
        if _message_role(message) not in {"ai", "assistant"}:
            continue
        raw_content = (
            message.get("content", "")
            if isinstance(message, dict)
            else getattr(message, "content", "")
        )
        text = _content(raw_content).strip()
        if text:
            parts.append(text)
    return "\n\n".join(parts)


def _checkpoint_phase(snapshot: Any, questions: list[dict[str, Any]]) -> CheckpointPhase:
    if not _checkpoint_exists(snapshot):
        return "absent"
    if questions:
        return "interrupted"
    if getattr(snapshot, "next", ()):
        return "runnable"
    return "completed"


async def stream_model(
    graph: Any,
    messages: list[dict[str, str]],
    *,
    config: dict[str, Any] | None = None,
    resume: dict[str, Any] | None = None,
    provider: ProviderName | None = None,
    invocation: Any = _DEFAULT_INVOCATION,
) -> AsyncIterator[dict[str, Any]]:
    """Normalize LangChain v2 events without exposing native events or raw reasoning."""

    if invocation is _DEFAULT_INVOCATION:
        invocation = Command(resume=resume) if resume is not None else {"messages": messages}
    searches: dict[str, dict[str, Any]] = {}
    pending_sources: list[dict[str, str]] = []
    stream_kwargs: dict[str, Any] = {"version": "v2", "durability": "sync"}
    if config is not None:
        stream_kwargs["config"] = config
    async for event in graph.astream_events(invocation, **stream_kwargs):
        kind = event.get("event", "")
        data = event.get("data") or {}
        if not isinstance(data, dict):
            data = {}
        chunk = data.get("chunk")
        if kind == "on_chat_model_stream" and chunk is not None:
            blocks = _blocks(chunk)
            emitted_text = False
            for block in blocks:
                if block.get("type") == "text" and block.get("text"):
                    emitted_text = True
                    yield {"type": "text.delta", "data": {"delta": str(block["text"])}}
                annotations = block.get("annotations") or []
                if annotations:
                    citations = _sources(annotations)
                    if citations and searches:
                        search_id = next(reversed(searches))
                        searches[search_id]["sources"] = citations
                        yield {
                            "type": "step.updated",
                            "data": {"step": searches[search_id]},
                        }
                    elif citations:
                        pending_sources = citations
            if not emitted_text:
                plain_text = getattr(chunk, "content", "")
                if isinstance(plain_text, str) and plain_text:
                    yield {"type": "text.delta", "data": {"delta": plain_text}}

            for summary in _reasoning_summaries(chunk, provider):
                yield {"type": "reasoning.delta", "data": {"delta": summary}}

            for block in blocks:
                block_type = block.get("type")
                if block_type not in {
                    "server_tool_call",
                    "server_tool_call_chunk",
                    "server_tool_result",
                }:
                    continue
                block_id = str(block.get("id") or block.get("tool_call_id") or "")
                name = str(block.get("name", "")).lower()
                if (
                    "web_search" not in name
                    and block_id not in searches
                    and block_type not in {"server_tool_call", "server_tool_call_chunk"}
                ):
                    continue
                search_id = block_id or "web-search"
                existing = searches.get(search_id)
                step = existing or {
                    "id": search_id,
                    "kind": "web_search",
                    "status": "in_progress",
                    "label": "Web search",
                }
                args = block.get("args") or {}
                if isinstance(args, dict) and args.get("query"):
                    step["query"] = str(args["query"])
                sources = _sources(block.get("output") or block.get("result"))
                if not sources and pending_sources:
                    sources = pending_sources
                    pending_sources = []
                if sources:
                    step["sources"] = sources
                if block_type == "server_tool_result":
                    step["status"] = "completed"
                    event_type = "step.completed"
                else:
                    event_type = "step.updated" if existing else "step.started"
                searches[search_id] = step
                yield {"type": event_type, "data": {"step": step}}
            continue

        normalized_tool = _tool_event(event)
        if normalized_tool is not None:
            yield normalized_tool.model_dump(mode="json")

    if config is not None and hasattr(graph, "aget_state"):
        for question in await pending_questions(graph, config):
            yield {"type": "user.input_required", "data": question}


def _result_text(result: Any) -> str:
    messages = result.get("messages", []) if isinstance(result, dict) else []
    if not messages:
        return "Child agent completed."
    message = messages[-1]
    content = (
        message.get("content", "")
        if isinstance(message, dict)
        else getattr(message, "content", "")
    )
    text = _content(content)
    return text or "Child agent completed."


def child_thread_id(parent_thread_id: UUID | str, tool_call_id: str) -> str:
    """Return a stable bounded checkpoint namespace for one parent tool call."""

    if not tool_call_id or len(tool_call_id) > MAX_TOOL_CALL_ID_LENGTH:
        raise ValueError("child tool call id is outside the supported range")
    parent = str(parent_thread_id)
    root = parent.split(":child:", 1)[0]
    invocation = sha256(f"{parent}\0{tool_call_id}".encode()).hexdigest()[:24]
    return f"{root}:child:{invocation}"


def _child_settings(
    parent_model: ModelName,
    parent_effort: ReasoningEffort,
    parent_speed: Speed,
    model: ModelName | None,
    effort: ReasoningEffort | None,
    speed: Speed | None,
) -> tuple[ModelName, ReasoningEffort, Speed]:
    selected_model = model or parent_model
    capabilities = MODEL_CAPABILITIES[selected_model]
    selected_effort = effort
    if selected_effort is None:
        selected_effort = (
            parent_effort
            if parent_effort in capabilities.reasoning_efforts
            else capabilities.default_reasoning_effort or "medium"
        )
    selected_speed = speed or (
        parent_speed if parent_speed in capabilities.speeds else "standard"
    )
    return selected_model, selected_effort, selected_speed


def build_model(
    settings: Settings,
    model: ModelName,
    reasoning_effort: ReasoningEffort | None,
    speed: Speed,
    *,
    run_id: UUID | None = None,
    checkpointer: Any | None = None,
    runtime_tools: Sequence[BaseTool] = (),
    task_plan: Sequence[PlanStep] = (),
    working_directory: str = "/workspace",
) -> tuple[Any, ProviderName]:
    """Build the sole LangChain/LangGraph orchestrator for one durable run."""

    if run_id is None or checkpointer is None:
        raise ValueError("run_id and checkpointer are required")
    root_effort = reasoning_effort
    if root_effort is None:
        root_effort = MODEL_CAPABILITIES[model].default_reasoning_effort or "medium"

    def orchestrator(
        thread_id: str,
        selected_model: ModelName,
        selected_effort: ReasoningEffort,
        selected_speed: Speed,
        depth: int,
        current_task_plan: Sequence[PlanStep],
    ) -> tuple[Any, ProviderName]:
        llm, resolved = build_chat_model(
            settings, selected_model, selected_effort, selected_speed
        )
        hosted_tools = provider_builtin_tools(resolved)

        async def run_child(
            task: str,
            tool_call_id: str,
            child_model: ModelName | None,
            child_effort: ReasoningEffort | None,
            child_speed: Speed | None,
        ) -> str:
            if depth >= MAX_CHILD_AGENT_DEPTH:
                return "The child-agent delegation depth limit was reached."
            next_model, next_effort, next_speed = _child_settings(
                selected_model,
                selected_effort,
                selected_speed,
                child_model,
                child_effort,
                child_speed,
            )
            next_thread_id = child_thread_id(thread_id, tool_call_id)
            child, _provider = orchestrator(
                next_thread_id,
                next_model,
                next_effort,
                next_speed,
                depth + 1,
                (),
            )
            child_config = {"configurable": {"thread_id": next_thread_id}}
            snapshot = await child.aget_state(child_config)
            if not _checkpoint_exists(snapshot):
                invocation: Any = {"messages": [{"role": "user", "content": task}]}
            elif getattr(snapshot, "next", ()):
                invocation = None
            else:
                return _result_text(getattr(snapshot, "values", {}))
            result = await child.ainvoke(
                invocation,
                config=child_config,
                durability="sync",
            )
            return _result_text(result)

        delegation = build_child_delegation_tool(run_child)
        tools: list[BaseTool | dict[str, Any]] = [
            *hosted_tools,
            *runtime_tools,
            delegation,
        ]
        if depth == 0:
            tools = [*hosted_tools, *build_core_tools(run_child), *runtime_tools]
        system_prompt = (
            "The shared workspace root is /workspace. "
            f"Your working directory is {working_directory}. "
            "Other files in /workspace remain accessible."
        )
        if depth == 0 and current_task_plan:
            serialized_plan = json.dumps(
                [step.model_dump(mode="json") for step in current_task_plan],
                separators=(",", ":"),
            )
            system_prompt += f" Current task plan (context only): {serialized_plan}"
        graph = create_agent(
            model=llm,
            tools=tools,
            system_prompt=system_prompt,
            checkpointer=checkpointer,
            name="my-bot-agent" if depth == 0 else f"my-bot-child-{depth}",
        )
        return graph, resolved.provider

    return orchestrator(str(run_id), model, root_effort, speed, 0, task_plan)


def graph_config(run_id: UUID) -> dict[str, Any]:
    """Map the stable application run ID directly to LangGraph's thread ID."""

    return {"configurable": {"thread_id": str(run_id)}}


async def stream_agent_request(
    body: AgentRequest,
    settings: Settings,
    checkpointer: Any,
    *,
    runtime_tools: Sequence[BaseTool] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Execute or resume one request using its durable LangGraph checkpoint."""

    prepared = await prepare_agent_request(
        body,
        settings,
        checkpointer,
        runtime_tools=runtime_tools,
    )
    yield {
        "type": "turn.started",
        "data": {
            "thread_id": str(body.run_id),
            "model": body.model,
            "reasoning_effort": body.reasoning_effort,
            "speed": body.speed,
            "plan": [step.model_dump(mode="json") for step in body.task_plan],
            "resumed": body.resume is not None,
            "checkpoint": prepared.checkpoint,
        },
    }
    if prepared.error is not None:
        raise prepared.error
    if not prepared.should_invoke:
        pending = prepared.checkpoint.get("pending_question")
        if isinstance(pending, dict):
            yield {"type": "user.input_required", "data": pending}
        return

    messages = [message.model_dump(mode="json") for message in body.messages]
    try:
        async for event in stream_model(
            prepared.graph,
            messages,
            config=prepared.config,
            provider=prepared.provider,
            invocation=prepared.invocation,
        ):
            yield event
    except asyncio.CancelledError:
        raise


async def prepare_agent_request(
    body: AgentRequest,
    settings: Settings,
    checkpointer: Any,
    *,
    runtime_tools: Sequence[BaseTool] | None = None,
) -> PreparedAgentRequest:
    """Choose one checkpoint-led invocation without replaying transcript side effects."""

    if runtime_tools is None:
        runtime_client = RuntimeClient(
            str(settings.runtime_base_url).rstrip("/"),
            token=settings.runtime_service_token,
        )
        runtime_tools = build_runtime_tools(
            runtime_client,
            RuntimeContext(
                run_id=str(body.run_id),
                conversation_id=str(body.conversation_id),
                user_id=str(body.user_id),
                workspace_id=str(body.workspace_id),
                working_directory=body.working_directory,
            ),
        )
    graph, provider = build_model(
        settings,
        body.model,
        body.reasoning_effort,
        body.speed,
        run_id=body.run_id,
        checkpointer=checkpointer,
        runtime_tools=runtime_tools,
        task_plan=body.task_plan,
        working_directory=body.working_directory,
    )
    config = graph_config(body.run_id)
    snapshot = await graph.aget_state(config)
    waiting = _interrupt_payloads(snapshot)
    phase = _checkpoint_phase(snapshot, waiting)
    resume = body.resume
    matching_question = None
    if resume is not None:
        matching_question = next(
            (
                question
                for question in waiting
                if question.get("question_id") == str(resume.question_id)
            ),
            None,
        )
    resume_consumed = resume is not None and phase != "absent" and matching_question is None
    checkpoint = {
        "id": _checkpoint_id(snapshot),
        "phase": phase,
        "content": _checkpoint_content(snapshot),
        "pending_question": waiting[0] if waiting else None,
        "resume_consumed": resume_consumed,
    }
    messages = [message.model_dump(mode="json") for message in body.messages]
    if phase == "absent":
        return PreparedAgentRequest(
            graph,
            provider,
            config,
            {"messages": messages},
            resume is None,
            checkpoint,
            CheckpointMissingError() if resume is not None else None,
        )
    if phase == "interrupted":
        if resume is not None and matching_question is not None:
            invocation = Command(
                resume={"question_id": str(resume.question_id), "answer": resume.answer}
            )
            return PreparedAgentRequest(
                graph, provider, config, invocation, True, checkpoint
            )
        return PreparedAgentRequest(graph, provider, config, None, False, checkpoint)
    if phase == "runnable":
        return PreparedAgentRequest(graph, provider, config, None, True, checkpoint)
    return PreparedAgentRequest(graph, provider, config, None, False, checkpoint)
