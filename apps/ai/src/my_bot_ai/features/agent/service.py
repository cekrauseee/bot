"""Durable LangGraph agent construction and normalized event streaming."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Sequence
from contextlib import suppress
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Literal
from uuid import UUID

from langchain.agents import create_agent
from langchain.agents.middleware import ToolErrorMiddleware
from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool
from langgraph.errors import GraphRecursionError

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.contracts import (
    MODEL_CAPABILITIES,
    AgentRequest,
    GithubMcpConfig,
    ModelName,
    NormalizedEvent,
    PlanStep,
    ProviderName,
    ReasoningEffort,
    Speed,
)
from my_bot_ai.features.agent.errors import (
    AgentServiceError,
    RuntimeCallError,
)
from my_bot_ai.features.agent.models import build_chat_model, provider_builtin_tools
from my_bot_ai.features.agent.runtime import RuntimeClient, RuntimeContext, build_runtime_tools
from my_bot_ai.features.agent.tools import build_child_delegation_tool, build_core_tools
from my_bot_ai.features.skills.capabilities import DEFAULT_TOOL_REGISTRY
from my_bot_ai.features.skills.mcp import github_mcp_tool
from my_bot_ai.features.skills.registry import default_skill_registry
from my_bot_ai.features.skills.resolution import skill_catalog
from my_bot_ai.features.skills.tools import build_load_skill_tool

MAX_TOOL_CALL_ID_LENGTH = 200
MAX_CHILD_AGENT_DEPTH = 4
GRAPH_RECURSION_LIMIT = 64
GRAPH_RECURSION_MARGIN = 4
# A normal tool cycle consumes at least one model step and one tool step. Keep
# two additional steps for the model's final summary and boundary handling.
MAX_TOOL_CALLS_PER_RUN = max(1, (GRAPH_RECURSION_LIMIT - GRAPH_RECURSION_MARGIN - 2) // 2)
MAX_TOOL_FAILURES_PER_RUN = 8
CheckpointPhase = Literal["absent", "runnable", "completed"]
_DEFAULT_INVOCATION = object()


@dataclass(frozen=True, slots=True)
class PreparedAgentRequest:
    graph: Any
    provider: ProviderName
    config: dict[str, Any]
    invocation: Any
    should_invoke: bool
    checkpoint: dict[str, Any]


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
    for source in (metadata, additional):
        summaries.extend(_explicit_summary_values(source.get("reasoning_summary")))

    for block in _blocks(chunk):
        if block.get("type") != "reasoning":
            continue
        summaries.extend(_explicit_summary_values(block.get("summary")))
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


def _tool_activity(
    event: dict[str, Any],
    data: dict[str, Any],
    status: str,
    detail: str | None = None,
) -> dict[str, Any]:
    name = _event_name(event, data)
    target = _tool_target(name, data)
    return {
        "id": _activity_id(event, name),
        "name": name,
        "label": _tool_label(name, status),
        "status": status,
        **({"target": target} if target else {}),
        **({"detail": detail} if detail else {}),
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


def _tool_failure(output: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(output, dict) or output.get("ok") is not False:
        return None
    error = output.get("error")
    if not isinstance(error, dict):
        return None
    code = error.get("code")
    message = error.get("message")
    if not isinstance(code, str) or not isinstance(message, str):
        return None
    return {
        "code": code[:200],
        "message": message[:2_000],
        "retryable": bool(error.get("retryable", True)),
    }


def _output_failure(value: Any) -> dict[str, Any] | None:
    failure = _tool_failure(_object_output(value))
    if failure:
        return failure
    if getattr(value, "status", None) == "error":
        return {
            "code": "tool_execution_failed",
            "message": "The tool could not complete this action.",
            "retryable": True,
        }
    return None


def _safe_tool_error(error: Exception, tool_name: str) -> str:
    if isinstance(error, RuntimeCallError) and tool_name.startswith("browser_"):
        public = error.public_error
        code = public.code if public.code != "runtime_error" else "browser_action_failed"
        message = public.message if public.code != "runtime_error" else (
            "The browser action could not be completed. Inspect the latest page "
            "state and choose another safe interaction."
        )
        payload = {
            "ok": False,
            "error": {
                "code": code,
                "message": message,
                "retryable": public.retryable,
            },
        }
    elif isinstance(error, AgentServiceError):
        public = error.public_error
        payload = {
            "ok": False,
            "error": {
                "code": public.code,
                "message": public.message,
                "retryable": public.retryable,
            },
        }
    elif tool_name.startswith("browser_"):
        payload = {
            "ok": False,
            "error": {
                "code": "browser_action_failed",
                "message": (
                    "The browser action could not be completed. Inspect the latest page "
                    "state and choose another safe interaction."
                ),
                "retryable": True,
            },
        }
    else:
        payload = {
            "ok": False,
            "error": {
                "code": "tool_execution_failed",
                "message": "The tool could not complete this action.",
                "retryable": True,
            },
        }
    return json.dumps(payload, separators=(",", ":"))


def _tool_error_middleware() -> ToolErrorMiddleware:
    failure_count = 0
    tool_call_count = 0

    def on_error(error: Exception, request: Any) -> str:
        nonlocal failure_count
        failure_count += 1
        if failure_count > MAX_TOOL_FAILURES_PER_RUN:
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "code": "tool_failure_budget_exhausted",
                        "message": (
                            "The tool failure budget is exhausted; summarize the blocker and stop."
                        ),
                        "retryable": False,
                    },
                },
                separators=(",", ":"),
            )
        tool = getattr(request, "tool", None)
        tool_name = getattr(tool, "name", None)
        if not isinstance(tool_name, str):
            tool_call = getattr(request, "tool_call", {})
            tool_name = tool_call.get("name") if isinstance(tool_call, dict) else None
        return _safe_tool_error(error, tool_name if isinstance(tool_name, str) else "tool")

    class BudgetedToolErrorMiddleware(ToolErrorMiddleware):
        async def awrap_tool_call(self, request: Any, handler: Any) -> Any:
            nonlocal tool_call_count
            tool_call_count += 1
            if tool_call_count > MAX_TOOL_CALLS_PER_RUN:
                call = getattr(request, "tool_call", {})
                return ToolMessage(
                    content=json.dumps(
                        {
                            "ok": False,
                            "error": {
                                "code": "tool_call_budget_exhausted",
                                "message": (
                                    "The tool-call budget is exhausted; summarize the work "
                                    "completed."
                                ),
                                "retryable": False,
                            },
                        },
                        separators=(",", ":"),
                    ),
                    tool_call_id=str(call.get("id", "unknown")),
                    name=str(call.get("name", "tool")),
                    status="error",
                )
            return await super().awrap_tool_call(request, handler)

    return BudgetedToolErrorMiddleware(on_error=on_error)


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
        tool_input = data.get("input")
        url = tool_input.get("url") if isinstance(tool_input, dict) else None
        return {
            "state": "launching" if name == "browser_open" else "live",
            "control": "agent",
            **({"url": url} if isinstance(url, str) else {}),
        }
    if kind != "on_tool_end":
        return None
    output = data.get("output")
    failure = _output_failure(output)
    if failure:
        return {
            "state": "failed",
            "control": "agent",
            "message": failure["message"],
        }
    parsed = _object_output(output)
    if parsed is None:
        return None
    status = parsed.get("status")
    if not isinstance(status, dict):
        return None
    projection = dict(status)
    url = parsed.get("url")
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
    if kind == "on_custom_event" and event.get("name") in {"skill.started", "skill.completed"}:
        data = event.get("data")
        skill = data.get("skill") if isinstance(data, dict) else None
        if (
            not isinstance(skill, dict)
            or not isinstance(skill.get("id"), str)
            or not isinstance(skill.get("name"), str)
        ):
            return None
        event_type = "skill.started" if event.get("name") == "skill.started" else "skill.completed"
        return NormalizedEvent(
            type=event_type,
            data={
                "skill": {
                    key: skill[key]
                    for key in ("id", "name", "detail", "status")
                    if key in skill
                }
            },
        )
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

    failure = _output_failure(data.get("output"))
    status = {
        "on_tool_start": "in_progress",
        "on_tool_stream": "in_progress",
        "on_tool_end": "completed",
        "on_tool_error": "failed",
    }[kind]
    if failure:
        status = "failed"
    if name == "delegate_to_child_agent":
        event_type = "child.started" if kind == "on_tool_start" else "child.completed"
        if kind == "on_tool_stream":
            return None
        child = _tool_activity(event, data, status, failure["message"] if failure else None)
        child["name"] = "child_agent"
        child["label"] = (
            "Delegating a task"
            if status == "in_progress"
            else "Could not delegate the task"
            if status == "failed"
            else "Delegated a task"
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
            "tool": _tool_activity(event, data, status, failure["message"] if failure else None),
            **({"browser_projection": projection} if projection else {}),
        },
    )


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


def _checkpoint_phase(snapshot: Any) -> CheckpointPhase:
    if not _checkpoint_exists(snapshot):
        return "absent"
    if getattr(snapshot, "next", ()):
        return "runnable"
    return "completed"


async def stream_model(
    graph: Any,
    messages: list[dict[str, str]],
    *,
    config: dict[str, Any] | None = None,
    provider: ProviderName | None = None,
    invocation: Any = _DEFAULT_INVOCATION,
) -> AsyncIterator[dict[str, Any]]:
    """Normalize LangChain v2 events without exposing native events or raw reasoning."""

    if invocation is _DEFAULT_INVOCATION:
        invocation = {"messages": messages}
    searches: dict[str, dict[str, Any]] = {}
    pending_sources: list[dict[str, str]] = []
    emitted_text: list[str] = []
    stream_kwargs: dict[str, Any] = {"version": "v2", "durability": "sync"}
    if config is not None:
        stream_kwargs["config"] = config
    try:
        async for event in graph.astream_events(invocation, **stream_kwargs):
            kind = event.get("event", "")
            data = event.get("data") or {}
            if not isinstance(data, dict):
                data = {}
            chunk = data.get("chunk")
            if kind == "on_chat_model_stream" and chunk is not None:
                blocks = _blocks(chunk)
                chunk_emitted_text = False
                for block in blocks:
                    if block.get("type") == "text" and block.get("text"):
                        chunk_emitted_text = True
                        delta = str(block["text"])
                        emitted_text.append(delta)
                        yield {"type": "text.delta", "data": {"delta": delta}}
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
                if not chunk_emitted_text:
                    plain_text = getattr(chunk, "content", "")
                    if isinstance(plain_text, str) and plain_text:
                        emitted_text.append(plain_text)
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
    except GraphRecursionError:
        # Recursion is an execution boundary, not an upstream provider failure.
        # Read the durable checkpoint and finish with whatever answer was saved.
        partial = ""
        if config is not None and hasattr(graph, "aget_state"):
            with suppress(Exception):
                partial = _checkpoint_content(await graph.aget_state(config))
        already_emitted = "".join(emitted_text)
        if partial and partial.startswith(already_emitted) and len(partial) > len(already_emitted):
            yield {"type": "text.delta", "data": {"delta": partial[len(already_emitted):]}}
        if partial or already_emitted:
            yield {
                "type": "turn.completed",
                "data": {
                    "outcome": "recursion_limit",
                    "partial": True,
                    "message": (
                        "The execution budget was reached; the answer above is the latest "
                        "saved result."
                    ),
                },
            }
        else:
            yield {
                "type": "turn.failed",
                "data": {
                    "error": {
                        "code": "execution_budget_exhausted",
                        "message": (
                            "The execution budget was reached before a useful answer was saved."
                        ),
                        "retryable": False,
                    }
                },
            }
        return
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
    github_mcp: GithubMcpConfig | None = None,
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
        if github_mcp is not None and depth == 0:
            hosted_tools.append(
                github_mcp_tool(
                    github_mcp.server_url,
                    github_mcp.authorization,
                    allowed_tools=github_mcp.allowed_tools,
                    tool_registry=DEFAULT_TOOL_REGISTRY,
                )
            )

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
            child_config = {
                "configurable": {"thread_id": next_thread_id},
                "recursion_limit": GRAPH_RECURSION_LIMIT,
            }
            snapshot = await child.aget_state(child_config)
            if not _checkpoint_exists(snapshot):
                invocation: Any = {"messages": [{"role": "user", "content": task}]}
            elif getattr(snapshot, "next", ()):
                invocation = None
            else:
                return _result_text(getattr(snapshot, "values", {}))
            try:
                result = await child.ainvoke(
                    invocation,
                    config=child_config,
                    durability="sync",
                )
            except GraphRecursionError:
                # Child runs get the same truthful boundary treatment as the root.
                snapshot = await child.aget_state(child_config)
                return _checkpoint_content(snapshot) or (
                    "The child agent reached its execution budget without a final answer."
                )
            return _result_text(result)

        delegation = build_child_delegation_tool(run_child)
        tools: list[BaseTool | dict[str, Any]] = [
            *hosted_tools,
            *runtime_tools,
            delegation,
        ]
        if depth == 0:
            tools = [
                *hosted_tools,
                *build_core_tools(run_child),
                *runtime_tools,
                build_load_skill_tool(default_skill_registry()),
            ]
        system_prompt = (
            "The shared workspace root is /workspace. "
            f"Your working directory is {working_directory}. "
            "Other files in /workspace remain accessible. "
            f"Execution budgets: at most {MAX_TOOL_CALLS_PER_RUN} tool calls and "
            f"{MAX_TOOL_FAILURES_PER_RUN} recoverable tool failures in this run. "
            f"Keep the final {GRAPH_RECURSION_MARGIN} execution steps available to summarize "
            "and finish the response. "
            "A tool failure is returned as JSON with ok:false and a safe error object. "
            "Treat it as a failed action, not a successful result. Choose a safe alternative "
            "when one exists; for a browser failure, inspect the latest page before another "
            "interaction. If you cannot continue, explain the blocker and a useful next step "
            "to the user."
        )
        if depth == 0:
            system_prompt += (
                " Ask only when missing information would materially change the result or "
                "create meaningful risk and no safe assumption allows progress. State any "
                "context the user needs, ask the necessary questions as normal response text, "
                "and then stop. Use paragraphs or bullets only when they improve clarity; do "
                "not force questions into a fixed schema."
            )
        else:
            system_prompt += (
                " If required information is missing, report the smallest concrete blocker "
                "to the parent agent."
            )
        if depth == 0 and current_task_plan:
            serialized_plan = json.dumps(
                [step.model_dump(mode="json") for step in current_task_plan],
                separators=(",", ":"),
            )
            system_prompt += f" Current task plan (context only): {serialized_plan}"
        if depth == 0:
            system_prompt += " " + skill_catalog(default_skill_registry())
        graph = create_agent(
            model=llm,
            tools=tools,
            system_prompt=system_prompt,
            middleware=[_tool_error_middleware()],
            checkpointer=checkpointer,
            name="my-bot-agent" if depth == 0 else f"my-bot-child-{depth}",
        )
        return graph, resolved.provider

    return orchestrator(str(run_id), model, root_effort, speed, 0, task_plan)


def graph_config(run_id: UUID) -> dict[str, Any]:
    """Map the stable application run ID directly to LangGraph's thread ID."""

    return {
        "configurable": {"thread_id": str(run_id)},
        # Reserve a small margin so a recursion boundary can be finalized with
        # the latest durable answer instead of surfacing provider_error.
        "recursion_limit": GRAPH_RECURSION_LIMIT,
    }


async def stream_agent_request(
    body: AgentRequest,
    settings: Settings,
    checkpointer: Any,
    *,
    runtime_tools: Sequence[BaseTool] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Execute one request using its durable LangGraph checkpoint."""

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
            "checkpoint": prepared.checkpoint,
        },
    }
    if not prepared.should_invoke:
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
        github_mcp=body.github_mcp,
    )
    config = graph_config(body.run_id)
    snapshot = await graph.aget_state(config)
    phase = _checkpoint_phase(snapshot)
    checkpoint = {
        "id": _checkpoint_id(snapshot),
        "phase": phase,
        "content": _checkpoint_content(snapshot),
    }
    messages = [message.model_dump(mode="json") for message in body.messages]
    if phase == "absent":
        return PreparedAgentRequest(
            graph,
            provider,
            config,
            {"messages": messages},
            True,
            checkpoint,
        )
    if phase == "runnable":
        return PreparedAgentRequest(graph, provider, config, None, True, checkpoint)
    return PreparedAgentRequest(graph, provider, config, None, False, checkpoint)
