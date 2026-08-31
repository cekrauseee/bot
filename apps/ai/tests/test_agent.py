import asyncio
import json
from types import SimpleNamespace
from typing import TypedDict
from unittest.mock import patch
from uuid import uuid4

import anyio
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage
from langchain_xai import ChatXAI
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command
from pydantic import ValidationError

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.checkpoints import create_in_memory_checkpointer
from my_bot_ai.features.agent.contracts import AgentRequest, PlanStep, resolve_model_settings
from my_bot_ai.features.agent.errors import CheckpointMissingError, InvalidResumeError
from my_bot_ai.features.agent.models import build_chat_model, provider_builtin_tools
from my_bot_ai.features.agent.service import (
    MAX_TOOL_CALL_ID_LENGTH,
    build_model,
    child_thread_id,
    prepare_agent_request,
    stream_model,
)
from my_bot_ai.features.agent.tools import build_core_tools
from my_bot_ai.main import create_app

RUN = uuid4()
TURN = uuid4()
PAYLOAD = {
    "version": 2,
    "run_id": str(RUN),
    "turn_id": str(TURN),
    "workspace_id": str(uuid4()),
    "conversation_id": str(uuid4()),
    "user_id": str(uuid4()),
    "messages": [{"role": "user", "content": "hello"}],
    "model": "gpt-5.6-sol",
    "reasoning_effort": "medium",
    "speed": "standard",
}


async def fake_runner(_body, _settings):
    yield {"type": "reasoning.delta", "data": {"delta": "Checking"}}
    yield {"type": "text.delta", "data": {"delta": "Hello"}}


def test_agent_request_validates_task_plan_with_empty_default() -> None:
    body = AgentRequest.model_validate(PAYLOAD)
    assert body.task_plan == []
    with pytest.raises(ValidationError):
        AgentRequest.model_validate({
            **PAYLOAD,
            "task_plan": [{"id": "step", "title": "Step", "status": "blocked"}],
        })
    with pytest.raises(ValidationError):
        AgentRequest.model_validate({
            **PAYLOAD,
            "task_plan": [
                {"id": str(index), "title": "Step", "status": "pending"}
                for index in range(51)
            ],
        })


class Chunk:
    content_blocks = [
        {"type": "reasoning", "reasoning": "Brief plan"},
        {
            "type": "text",
            "text": "Visible answer",
            "annotations": [
                {"type": "url_citation", "title": "Source", "url": "https://example.com"}
            ],
        },
        {
            "type": "server_tool_call",
            "name": "web_search",
            "id": "ws1",
            "args": {"query": "latest news"},
        },
    ]


class ResultChunk:
    content_blocks = [{"type": "server_tool_result", "tool_call_id": "ws1", "status": "completed"}]


class XAIChunk:
    content = ""
    content_blocks = [{"type": "reasoning", "reasoning": "raw secret reasoning"}]
    additional_kwargs = {
        "reasoning_content": "raw secret reasoning",
        "reasoning_summary": [{"text": "Safe xAI summary"}],
    }
    response_metadata = {"model_provider": "xai"}


class FakeGraph:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        assert _kwargs["durability"] == "sync"
        yield {"event": "on_chat_model_stream", "data": {"chunk": Chunk()}}
        yield {"event": "on_chat_model_stream", "data": {"chunk": ResultChunk()}}


class XAIStream:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        yield {"event": "on_chat_model_stream", "data": {"chunk": XAIChunk()}}


class ActivityStream:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        yield {
            "event": "on_tool_start",
            "name": "update_plan",
            "run_id": "plan-1",
            "data": {
                "input": {
                    "plan": [{"id": "one", "title": "First", "status": "in_progress"}]
                }
            },
        }
        yield {"event": "on_tool_start", "name": "runtime_read", "run_id": "tool-1", "data": {}}
        yield {"event": "on_tool_stream", "name": "runtime_read", "run_id": "tool-1", "data": {}}
        yield {"event": "on_tool_end", "name": "runtime_read", "run_id": "tool-1", "data": {}}
        yield {
            "event": "on_tool_start",
            "name": "delegate_to_child_agent",
            "run_id": "child-1",
            "data": {},
        }
        yield {
            "event": "on_tool_end",
            "name": "delegate_to_child_agent",
            "run_id": "child-1",
            "data": {},
        }


class BrowserActivityStream:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        yield {
            "event": "on_tool_start",
            "name": "browser_open",
            "run_id": "browser-1",
            "data": {"input": {"url": "https://example.com"}},
        }
        yield {
            "event": "on_tool_end",
            "name": "browser_open",
            "run_id": "browser-1",
            "data": {
                "output": SimpleNamespace(
                    content=json.dumps(
                        {
                            "url": "https://example.com/",
                            "status": {
                                "state": "live",
                                "control": "agent",
                                "leaseExpiresAt": None,
                            },
                        }
                    )
                )
            },
        }
        yield {
            "event": "on_tool_error",
            "name": "browser_click",
            "run_id": "browser-2",
            "data": {},
        }


class BrowserFrameStream:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        yield {
            "event": "on_custom_event",
            "name": "browser.frame",
            "data": {
                "base64": "cG5n",
                "mime_type": "image/png",
                "captured_at": "2026-08-30T17:00:00Z",
            },
        }


class CancelledGraph:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        raise asyncio.CancelledError
        yield  # pragma: no cover


def collect(stream):
    async def run():
        return [event async for event in stream]

    return anyio.run(run)


def test_stream_normalizes_reasoning_text_and_web_sources() -> None:
    events = collect(stream_model(FakeGraph(), []))
    assert [event["type"] for event in events] == [
        "text.delta",
        "reasoning.delta",
        "step.started",
        "step.completed",
    ]
    assert events[0]["data"]["delta"] == "Visible answer"
    assert events[1]["data"]["delta"] == "Brief plan"
    assert events[-1]["data"]["step"]["status"] == "completed"
    assert events[-1]["data"]["step"]["sources"] == [
        {
            "id": "https://example.com",
            "title": "Source",
            "url": "https://example.com",
            "domain": "example.com",
        }
    ]


def test_xai_stream_exposes_only_explicit_reasoning_summaries() -> None:
    events = collect(stream_model(XAIStream(), [], provider="xai"))
    assert events == [{"type": "reasoning.delta", "data": {"delta": "Safe xAI summary"}}]
    assert "raw secret reasoning" not in json.dumps(events)


def test_plan_tool_and_child_events_are_normalized() -> None:
    events = collect(stream_model(ActivityStream(), []))
    assert [event["type"] for event in events] == [
        "plan.updated",
        "tool.started",
        "tool.updated",
        "tool.completed",
        "child.started",
        "child.completed",
    ]
    assert events[0]["data"]["plan"] == [
        {"id": "one", "title": "First", "status": "in_progress"}
    ]
    assert events[-1]["data"]["child"]["status"] == "completed"


def test_browser_tool_events_project_truthful_durable_status() -> None:
    events = collect(stream_model(BrowserActivityStream(), []))
    assert events[0]["data"]["browser_projection"] == {
        "state": "launching",
        "control": "agent",
        "url": "https://example.com",
    }
    assert events[1]["data"]["browser_projection"] == {
        "state": "live",
        "control": "agent",
        "leaseExpiresAt": None,
        "url": "https://example.com/",
    }
    assert events[2]["data"]["browser_projection"] == {
        "state": "failed",
        "control": "agent",
        "message": "The browser operation failed.",
    }


def test_browser_frames_are_normalized_as_transient_events() -> None:
    assert collect(stream_model(BrowserFrameStream(), [])) == [{
        "type": "browser.frame",
        "data": {
            "frame": {
                "base64": "cG5n",
                "mime_type": "image/png",
                "captured_at": "2026-08-30T17:00:00Z",
            }
        },
    }]


def client(runner=fake_runner) -> TestClient:
    return TestClient(
        create_app(Settings(environment="test", ai_service_token="test-token"), runner=runner)
    )


def test_v2_stream_auth_and_event_framing() -> None:
    response = client().post(
        "/agent/stream", json=PAYLOAD, headers={"Authorization": "Bearer test-token"}
    )
    assert response.status_code == 200
    blocks = [block for block in response.text.split("\n\n") if block]
    events = [json.loads(block.split("data: ", 1)[1]) for block in blocks]
    assert [event["type"] for event in events] == [
        "turn.started",
        "reasoning.delta",
        "text.delta",
        "turn.completed",
    ]
    assert [event["sequence"] for event in events] == [1, 2, 3, 4]
    assert all(event["version"] == 2 for event in events)
    assert all(event["run_id"] == str(RUN) for event in events)
    assert events[0]["data"]["thread_id"] == str(RUN)


def test_user_input_required_pauses_without_turn_completed() -> None:
    async def waiting_runner(_body, _settings):
        yield {
            "type": "user.input_required",
            "data": {
                "question_id": "choice",
                "title": "Choose",
                "description": "Pick one",
                "options": [{"id": "a", "label": "A"}],
                "multiple": False,
                "allow_custom": False,
            },
        }

    response = client(waiting_runner).post(
        "/agent/stream", json=PAYLOAD, headers={"Authorization": "Bearer test-token"}
    )
    event_types = [
        json.loads(block.split("data: ", 1)[1])["type"]
        for block in response.text.split("\n\n")
        if block
    ]
    assert event_types == ["turn.started", "user.input_required"]


def test_checkpoint_led_preparation_never_replays_the_transcript() -> None:
    body = AgentRequest.model_validate(PAYLOAD)
    question = {
        "question_id": "choice",
        "title": "Choose",
        "description": "Pick one",
        "options": [{"id": "a", "label": "A"}],
        "multiple": False,
        "allow_custom": False,
    }

    class SnapshotGraph:
        def __init__(self, snapshot):
            self.snapshot = snapshot

        async def aget_state(self, _config):
            return self.snapshot

    def snapshot(*, checkpoint_id=None, next_nodes=(), interrupts=(), messages=()):
        return SimpleNamespace(
            config={
                "configurable": {
                    "thread_id": str(RUN),
                    **({"checkpoint_id": checkpoint_id} if checkpoint_id else {}),
                }
            },
            created_at="now" if checkpoint_id else None,
            metadata={} if checkpoint_id else None,
            next=next_nodes,
            tasks=tuple(
                SimpleNamespace(interrupts=(SimpleNamespace(value=value),))
                for value in interrupts
            ),
            values={"messages": list(messages)},
        )

    async def prepare(state, request=body):
        graph = SnapshotGraph(state)
        with patch(
            "my_bot_ai.features.agent.service.build_model",
            return_value=(graph, "openai"),
        ):
            return await prepare_agent_request(
                request,
                Settings(environment="test"),
                object(),
                runtime_tools=(),
            )

    absent = anyio.run(prepare, snapshot())
    assert absent.should_invoke is True
    assert absent.invocation == {
        "messages": [message.model_dump(mode="json") for message in body.messages]
    }
    assert absent.checkpoint["phase"] == "absent"

    resumed = AgentRequest.model_validate(
        {**PAYLOAD, "resume": {"question_id": "choice", "answer": "a"}}
    )
    missing = anyio.run(prepare, snapshot(), resumed)
    assert isinstance(missing.error, CheckpointMissingError)
    assert missing.should_invoke is False

    waiting = anyio.run(
        prepare,
        snapshot(checkpoint_id="cp-wait", interrupts=(question,)),
        resumed,
    )
    assert waiting.should_invoke is True
    assert isinstance(waiting.invocation, Command)
    assert waiting.invocation.resume == {"question_id": "choice", "answer": "a"}
    assert waiting.checkpoint["resume_consumed"] is False

    stale = AgentRequest.model_validate(
        {**PAYLOAD, "resume": {"question_id": "prior", "answer": "a"}}
    )
    interrupted = anyio.run(
        prepare,
        snapshot(checkpoint_id="cp-next-question", interrupts=(question,)),
        stale,
    )
    assert interrupted.should_invoke is False
    assert interrupted.checkpoint["pending_question"]["question_id"] == "choice"
    assert interrupted.checkpoint["resume_consumed"] is True

    current_messages = (
        HumanMessage(content="Earlier"),
        AIMessage(content="Earlier answer"),
        HumanMessage(content="Current"),
        AIMessage(content="First current part"),
        AIMessage(content="Second current part"),
    )
    runnable = anyio.run(
        prepare,
        snapshot(
            checkpoint_id="cp-runnable",
            next_nodes=("tools",),
            messages=current_messages,
        ),
    )
    assert runnable.should_invoke is True
    assert runnable.invocation is None
    assert runnable.checkpoint["content"] == "First current part\n\nSecond current part"

    completed = anyio.run(
        prepare,
        snapshot(checkpoint_id="cp-completed", messages=current_messages),
    )
    assert completed.should_invoke is False
    assert completed.checkpoint["phase"] == "completed"


def test_stream_rejects_bad_auth_and_extra_fields() -> None:
    response = client().post(
        "/agent/stream", json=PAYLOAD, headers={"Authorization": "Bearer wrong"}
    )
    assert response.status_code == 401
    response = client().post(
        "/agent/stream",
        json={**PAYLOAD, "extra": True},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422

    missing_workspace = {key: value for key, value in PAYLOAD.items() if key != "workspace_id"}
    response = client().post(
        "/agent/stream",
        json=missing_workspace,
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("model", "effort", "speed"),
    [
        ("grok-4.6", "high", "fast"),
        ("grok-4.3", "xhigh", "standard"),
    ],
)
def test_request_validates_provider_capabilities(model, effort, speed) -> None:
    response = client().post(
        "/agent/stream",
        json={**PAYLOAD, "model": model, "reasoning_effort": effort, "speed": speed},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422


def test_missing_xai_provider_is_safe() -> None:
    application = create_app(Settings(environment="test", ai_service_token="test-token"))
    response = TestClient(application).post(
        "/agent/stream",
        json={**PAYLOAD, "model": "grok-4.6", "reasoning_effort": "high"},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "provider_missing",
            "message": "The selected AI provider is not configured.",
        }
    }


def test_provider_constructors_receive_only_supported_settings() -> None:
    with patch(
        "my_bot_ai.features.agent.models.ChatOpenAI", side_effect=lambda **kwargs: kwargs
    ):
        openai, openai_settings = build_chat_model(
            Settings(openai_api_key="openai-key"), "gpt-5.6-luna", "max", "fast"
        )
    assert openai["use_responses_api"] is True
    assert openai["reasoning"] == {"effort": "max", "summary": "auto"}
    assert openai["service_tier"] == "fast"
    assert openai["store"] is False
    assert provider_builtin_tools(openai_settings) == [{"type": "web_search"}]

    with patch("my_bot_ai.features.agent.models.ChatXAI", side_effect=lambda **kwargs: kwargs):
        xai, xai_settings = build_chat_model(
            Settings(xai_api_key="xai-key"), "grok-4.6", None, "standard"
        )
    assert xai["reasoning_effort"] == "high"
    assert "service_tier" not in xai
    assert "use_responses_api" not in xai
    assert provider_builtin_tools(xai_settings) == []

    assert resolve_model_settings("gpt-5.6-terra", "none", "standard").reasoning_effort == "none"


def test_child_agents_are_recursive_configurable_and_checkpoint_led() -> None:
    created: list[dict[str, object]] = []
    invocations: list[dict[str, object]] = []
    model_calls: list[tuple[str, str | None, str]] = []
    states: dict[str, dict[str, object]] = {}
    saver = object()
    runtime_tool = object()
    root_graph = object()

    class ChildGraph:
        async def aget_state(self, config):
            thread_id = config["configurable"]["thread_id"]
            values = states.get(thread_id)
            return SimpleNamespace(
                config={
                    "configurable": {
                        "thread_id": thread_id,
                        **({"checkpoint_id": "completed"} if values else {}),
                    }
                },
                created_at="now" if values else None,
                metadata={} if values else None,
                next=(),
                tasks=(),
                values=values or {},
            )

        async def ainvoke(self, value, *, config, durability):
            thread_id = config["configurable"]["thread_id"]
            invocations.append(
                {"value": value, "config": config, "durability": durability}
            )
            result = {
                "messages": [
                    {"role": "assistant", "content": f"Completed {value['messages'][0]['content']}"}
                ]
            }
            states[thread_id] = result
            return result

    def create(**kwargs):
        created.append(kwargs)
        return root_graph if kwargs["name"] == "my-bot-agent" else ChildGraph()

    def chat_model(_settings, model, effort, speed):
        model_calls.append((model, effort, speed))
        return object(), resolve_model_settings(model, effort, speed)

    with (
        patch(
            "my_bot_ai.features.agent.service.build_chat_model",
            side_effect=chat_model,
        ),
        patch("my_bot_ai.features.agent.service.provider_builtin_tools", return_value=[]),
        patch("my_bot_ai.features.agent.service.create_agent", side_effect=create),
    ):
        graph, provider = build_model(
            Settings(environment="test"),
            "gpt-5.6-luna",
            "medium",
            "standard",
            run_id=RUN,
            checkpointer=saver,
            runtime_tools=(runtime_tool,),
            task_plan=[PlanStep(id="inspect", title="Inspect the workspace", status="in_progress")],
        )
        assert graph is root_graph
        assert provider == "openai"
        assert "Inspect the workspace" in created[0]["system_prompt"]
        delegate = next(
            tool
            for tool in created[0]["tools"]
            if tool.name == "delegate_to_child_agent"
        )
        assert set(delegate.args) == {"task", "model", "reasoning_effort", "speed"}
        first = anyio.run(
            delegate.ainvoke,
            {
                "type": "tool_call",
                "id": "child-call-1",
                "name": delegate.name,
                "args": {
                    "task": "Inspect the workspace",
                    "model": "gpt-5.6-terra",
                    "reasoning_effort": "high",
                    "speed": "fast",
                },
            },
        )
        replayed = anyio.run(
            delegate.ainvoke,
            {
                "type": "tool_call",
                "id": "child-call-1",
                "name": delegate.name,
                "args": {
                    "task": "Inspect the workspace",
                    "model": "gpt-5.6-terra",
                    "reasoning_effort": "high",
                    "speed": "fast",
                },
            },
        )
        child_delegate = next(
            tool
            for tool in created[1]["tools"]
            if getattr(tool, "name", None) == "delegate_to_child_agent"
        )
        assert created[1]["system_prompt"] is None
        grandchild = anyio.run(
            child_delegate.ainvoke,
            {
                "type": "tool_call",
                "id": "grandchild-call-1",
                "name": child_delegate.name,
                "args": {"task": "Run focused checks"},
            },
        )
        assert first.content == "Completed Inspect the workspace"
        assert replayed.content == first.content
        assert grandchild.content == "Completed Run focused checks"

    assert all(call["checkpointer"] is saver for call in created[1:])
    assert all(runtime_tool in call["tools"] for call in created[1:])
    assert all(
        any(getattr(tool, "name", None) == "delegate_to_child_agent" for tool in call["tools"])
        for call in created[1:]
    )
    assert [item["config"]["configurable"]["thread_id"] for item in invocations] == [
        child_thread_id(RUN, "child-call-1"),
        child_thread_id(child_thread_id(RUN, "child-call-1"), "grandchild-call-1"),
    ]
    assert all(item["durability"] == "sync" for item in invocations)
    assert model_calls[:3] == [
        ("gpt-5.6-luna", "medium", "standard"),
        ("gpt-5.6-terra", "high", "fast"),
        ("gpt-5.6-terra", "high", "fast"),
    ]
    assert child_thread_id(RUN, "child-call-1") == child_thread_id(RUN, "child-call-1")
    with pytest.raises(ValueError):
        child_thread_id(RUN, "x" * (MAX_TOOL_CALL_ID_LENGTH + 1))


def test_grok_46_registry_overrides_missing_langchain_profile_and_payload_is_correct() -> None:
    resolved = resolve_model_settings("grok-4.6", None, "standard")
    assert resolved.reasoning_effort == "high"

    model = ChatXAI(model="grok-4.6", api_key="test-xai-key", reasoning_effort="xhigh")
    assert model._resolve_model_profile() is None
    payload = model._get_request_payload([HumanMessage(content="hello")])
    assert payload["extra_body"]["reasoning_effort"] == "xhigh"
    assert "reasoning_effort" not in payload


class AskState(TypedDict, total=False):
    answer: str


def test_ask_user_interrupts_and_resumes_multiple_questions_durably() -> None:
    async def child(_task: str, _tool_call_id: str) -> str:
        return "done"

    ask_tool = next(tool for tool in build_core_tools(child) if tool.name == "ask_user")

    def ask(_state: AskState):
        answer = ask_tool.invoke(
            {
                "questions": [
                    {
                        "id": "choice",
                        "title": "Choose",
                        "description": "Pick one",
                        "options": [{"id": "a", "label": "A"}],
                        "multiple": False,
                        "allow_custom": False,
                    },
                    {
                        "id": "details",
                        "title": "Details",
                        "description": "Add details",
                        "options": [],
                        "multiple": False,
                        "allow_custom": True,
                    },
                ]
            }
        )
        return {"answer": answer}

    builder = StateGraph(AskState)
    builder.add_node("ask", ask)
    builder.add_edge(START, "ask")
    builder.add_edge("ask", END)
    graph = builder.compile(checkpointer=create_in_memory_checkpointer())
    config = {"configurable": {"thread_id": str(uuid4())}}

    first = graph.invoke({}, config)
    assert first["__interrupt__"][0].value["question_id"] == "choice"
    second = graph.invoke(Command(resume={"question_id": "choice", "answer": "a"}), config)
    assert second["__interrupt__"][0].value["question_id"] == "details"
    final = graph.invoke(
        Command(resume={"question_id": "details", "answer": "More context"}), config
    )
    assert json.loads(final["answer"])["answers"] == [
        {"question_id": "choice", "answer": "a"},
        {"question_id": "details", "answer": "More context"},
    ]


def test_ask_user_rejects_invalid_answer_shape() -> None:
    async def child(_task: str, _tool_call_id: str) -> str:
        return "done"

    ask_tool = next(tool for tool in build_core_tools(child) if tool.name == "ask_user")

    def ask(_state: AskState):
        return {
            "answer": ask_tool.invoke(
                {
                    "questions": [
                        {
                            "id": "choices",
                            "title": "Choose",
                            "description": "Pick several",
                            "options": [{"id": "a", "label": "A"}],
                            "multiple": True,
                            "allow_custom": False,
                        }
                    ]
                }
            )
        }

    builder = StateGraph(AskState)
    builder.add_node("ask", ask)
    builder.add_edge(START, "ask")
    builder.add_edge("ask", END)
    graph = builder.compile(checkpointer=create_in_memory_checkpointer())
    config = {"configurable": {"thread_id": str(uuid4())}}
    graph.invoke({}, config)
    with pytest.raises(InvalidResumeError):
        graph.invoke(Command(resume={"question_id": "choices", "answer": "a"}), config)


def test_stream_propagates_cancellation() -> None:
    with pytest.raises(asyncio.CancelledError):
        collect(stream_model(CancelledGraph(), []))
