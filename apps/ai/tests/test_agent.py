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
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command
from pydantic import ValidationError

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.checkpoints import create_in_memory_checkpointer
from my_bot_ai.features.agent.contracts import (
    AgentRequest,
    ConversationTitleRequest,
    ConversationTitleResponse,
    PlanStep,
    resolve_model_settings,
)
from my_bot_ai.features.agent.errors import (
    CheckpointMissingError,
    InvalidResumeError,
    RuntimeCallError,
)
from my_bot_ai.features.agent.models import build_chat_model, provider_builtin_tools
from my_bot_ai.features.agent.service import (
    GRAPH_RECURSION_LIMIT,
    GRAPH_RECURSION_MARGIN,
    MAX_TOOL_CALL_ID_LENGTH,
    MAX_TOOL_CALLS_PER_RUN,
    _safe_tool_error,
    _tool_error_middleware,
    build_model,
    child_thread_id,
    prepare_agent_request,
    stream_model,
)
from my_bot_ai.features.agent.title import TITLE_MODEL, generate_conversation_title
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
    assert body.working_directory == "/workspace"
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


@pytest.mark.parametrize(
    "working_directory",
    [
        "relative",
        "",
        ".",
        "/tmp",
        "/workspace-other",
        "/workspace/../tmp",
        "/workspace/project/../app",
        "/workspace\\tmp",
        "/workspace/.",
        "/workspace/project/./app",
        "/workspace//project",
        "//workspace/project",
        "/workspace/",
        "/workspace/project/",
        pytest.param(
            "/workspace/" + "a" * (4_097 - len("/workspace/")),
            id="over-length-limit",
        ),
    ],
)
def test_agent_request_rejects_invalid_working_directory(working_directory: str) -> None:
    with pytest.raises(ValidationError):
        AgentRequest.model_validate({**PAYLOAD, "working_directory": working_directory})


@pytest.mark.parametrize("codepoint", [*range(32), 127])
def test_agent_request_rejects_working_directory_control_characters(codepoint: int) -> None:
    with pytest.raises(ValidationError):
        AgentRequest.model_validate({
            **PAYLOAD,
            "working_directory": f"/workspace/project{chr(codepoint)}app",
        })


@pytest.mark.parametrize(
    "working_directory",
    [
        "/workspace",
        "/workspace/project",
        "/workspace/project/app",
        "/workspace/project name/.hidden",
        pytest.param(
            "/workspace/" + "a" * (4_096 - len("/workspace/")),
            id="at-length-limit",
        ),
    ],
)
def test_agent_request_preserves_canonical_working_directory(working_directory: str) -> None:
    body = AgentRequest.model_validate({**PAYLOAD, "working_directory": working_directory})
    assert body.working_directory == working_directory


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


class FakeGraph:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        assert _kwargs["durability"] == "sync"
        yield {"event": "on_chat_model_stream", "data": {"chunk": Chunk()}}
        yield {"event": "on_chat_model_stream", "data": {"chunk": ResultChunk()}}


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
        yield {
            "event": "on_tool_start",
            "name": "filesystem_read",
            "run_id": "tool-1",
            "data": {"input": {"path": "/workspace/package.json"}},
        }
        yield {"event": "on_tool_stream", "name": "filesystem_read", "run_id": "tool-1", "data": {}}
        yield {"event": "on_tool_end", "name": "filesystem_read", "run_id": "tool-1", "data": {}}
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


class RecoveredBrowserFailureStream:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        yield {
            "event": "on_tool_end",
            "name": "browser_click",
            "run_id": "browser-recovery-1",
            "data": {
                "output": SimpleNamespace(
                    content=json.dumps(
                        {
                            "ok": False,
                            "error": {
                                "code": "browser_action_failed",
                                "message": "The browser action could not be completed.",
                                "retryable": True,
                            },
                        }
                    )
                )
            },
        }


class CancelledGraph:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        raise asyncio.CancelledError
        yield  # pragma: no cover


class RecursionLimitedGraph:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        raise GraphRecursionError("recursion limit reached")
        yield  # pragma: no cover

    async def aget_state(self, _config):
        return SimpleNamespace(
            values={"messages": [HumanMessage("hello"), AIMessage("Partial answer")]}
        )


class EmptyRecursionLimitedGraph:
    async def astream_events(self, _input, version, **_kwargs):
        assert version == "v2"
        raise GraphRecursionError("recursion limit reached")
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


def test_recursion_limit_emits_saved_partial_answer_as_truthful_completion() -> None:
    events = collect(
        stream_model(
            RecursionLimitedGraph(), [], config={"recursion_limit": GRAPH_RECURSION_LIMIT}
        )
    )

    assert events == [
        {"type": "text.delta", "data": {"delta": "Partial answer"}},
        {
            "type": "turn.completed",
            "data": {
                "outcome": "recursion_limit",
                "partial": True,
                "message": (
                    "The execution budget was reached; the answer above is the latest "
                    "saved result."
                ),
            },
        },
    ]


def test_recursion_limit_without_output_is_a_specific_failure() -> None:
    events = collect(
        stream_model(
            EmptyRecursionLimitedGraph(), [], config={"recursion_limit": GRAPH_RECURSION_LIMIT}
        )
    )

    assert events == [
        {
            "type": "turn.failed",
            "data": {
                "error": {
                    "code": "execution_budget_exhausted",
                    "message": "The execution budget was reached before a useful answer was saved.",
                    "retryable": False,
                }
            },
        }
    ]


def test_tool_budget_leaves_recursion_margin_for_finalization() -> None:
    assert 2 * MAX_TOOL_CALLS_PER_RUN + 2 + GRAPH_RECURSION_MARGIN <= GRAPH_RECURSION_LIMIT


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
    assert events[1]["data"]["tool"] == {
        "id": "tool-1",
        "name": "filesystem_read",
        "label": "Reading files",
        "status": "in_progress",
        "target": "/workspace/package.json",
    }
    assert events[3]["data"]["tool"] == {
        "id": "tool-1",
        "name": "filesystem_read",
        "label": "Read files",
        "status": "completed",
    }
    assert events[-1]["data"]["child"]["label"] == "Delegated a task"
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


def test_recovered_tool_failure_remains_visible_to_the_agent_and_user() -> None:
    events = collect(stream_model(RecoveredBrowserFailureStream(), []))
    assert events == [
        {
            "type": "tool.completed",
            "data": {
                "tool": {
                    "id": "browser-recovery-1",
                    "name": "browser_click",
                    "label": "Could not interact with the page",
                    "status": "failed",
                    "detail": "The browser action could not be completed.",
                },
                "browser_projection": {
                    "state": "failed",
                    "control": "agent",
                    "message": "The browser action could not be completed.",
                },
            },
        }
    ]


def test_tool_failures_are_safe_structured_feedback() -> None:
    browser = json.loads(_safe_tool_error(RuntimeCallError(), "browser_click"))
    generic = json.loads(_safe_tool_error(RuntimeError("private"), "filesystem_read"))

    assert browser == {
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
    assert generic == {
        "ok": False,
        "error": {
            "code": "tool_execution_failed",
            "message": "The tool could not complete this action.",
            "retryable": True,
        },
    }


def test_tool_error_middleware_returns_failures_to_the_model() -> None:
    async def run() -> None:
        middleware = _tool_error_middleware()

        async def failing_handler(_request):
            raise RuntimeCallError

        result = await middleware.awrap_tool_call(
            SimpleNamespace(
                tool=SimpleNamespace(name="browser_click"),
                tool_call={"id": "call-1", "name": "browser_click"},
            ),
            failing_handler,
        )
        assert result.status == "error"
        assert json.loads(result.content) == json.loads(
            _safe_tool_error(RuntimeCallError(), "browser_click")
        )

    anyio.run(run)


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


def test_title_endpoint_is_authenticated_and_separate_from_the_agent_stream() -> None:
    seen: list[ConversationTitleRequest] = []

    async def title_runner(body, _settings):
        seen.append(body)
        return {"title": "Durable background runs"}

    application = create_app(
        Settings(environment="test", ai_service_token="test-token"),
        runner=fake_runner,
        title_runner=title_runner,
    )
    title_payload = {
        "version": 1,
        "run_id": str(RUN),
        "turn_id": str(TURN),
        "conversation_id": PAYLOAD["conversation_id"],
        "user_id": PAYLOAD["user_id"],
        "message": "Keep agent runs visible after reload",
    }
    unauthenticated = TestClient(application).post("/agent/title", json=title_payload)
    response = TestClient(application).post(
        "/agent/title",
        json=title_payload,
        headers={"Authorization": "Bearer test-token"},
    )

    assert unauthenticated.status_code == 401
    assert response.status_code == 200
    assert response.json() == {"title": "Durable background runs"}
    assert len(seen) == 1
    assert seen[0].message == title_payload["message"]


def test_title_generation_uses_luna_structured_output_without_streaming() -> None:
    captured: dict[str, object] = {}

    class StructuredModel:
        async def ainvoke(self, messages):
            captured["messages"] = messages
            return ConversationTitleResponse(title="Persist conversation titles")

    class TitleModel:
        def with_structured_output(self, schema, *, method, strict):
            captured.update(schema=schema, method=method, strict=strict)
            return StructuredModel()

    body = ConversationTitleRequest(
        version=1,
        run_id=RUN,
        turn_id=TURN,
        conversation_id=PAYLOAD["conversation_id"],
        user_id=PAYLOAD["user_id"],
        message="Persist the generated conversation title",
    )
    settings = Settings(openai_api_key="key")
    with patch(
        "my_bot_ai.features.agent.title.build_chat_model",
        return_value=(TitleModel(), SimpleNamespace()),
    ) as build:
        result = asyncio.run(generate_conversation_title(body, settings))

    build.assert_called_once_with(
        settings, TITLE_MODEL, "low", "standard", streaming=False
    )
    assert captured["schema"] is ConversationTitleResponse
    assert captured["method"] == "json_schema"
    assert captured["strict"] is True
    assert captured["messages"][-1] == ("human", body.message)
    assert result.title == "Persist conversation titles"


def test_provider_quota_failure_keeps_public_retry_contract_and_safe_diagnostic() -> None:
    class QuotaError(Exception):
        code = "insufficient_quota"
        status_code = 429

    async def failing_runner(_body, _settings):
        if False:
            yield None
        raise QuotaError("private provider response")

    response = client(failing_runner).post(
        "/agent/stream", json=PAYLOAD, headers={"Authorization": "Bearer test-token"}
    )
    blocks = [block for block in response.text.split("\n\n") if block]
    event = json.loads(blocks[-1].split("data: ", 1)[1])
    error = event["data"]["error"]

    assert error == {
        "code": "provider_error",
        "message": "The AI provider failed.",
        "retryable": True,
        "error_category": "provider_quota",
        "error_code": "insufficient_quota",
        "error_summary": "The AI provider quota is exhausted.",
        "provider": "openai",
        "error_status_code": 429,
    }
    assert "QuotaError" not in response.text
    assert "private provider response" not in response.text


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


def test_request_rejects_unsupported_models() -> None:
    response = client().post(
        "/agent/stream",
        json={**PAYLOAD, "model": "unsupported-model"},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422


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

    assert resolve_model_settings("gpt-5.6-terra", "none", "standard").reasoning_effort == "none"


def test_child_agents_are_recursive_configurable_and_checkpoint_led() -> None:
    created: list[dict[str, object]] = []
    invocations: list[dict[str, object]] = []
    model_calls: list[tuple[str, str | None, str]] = []
    states: dict[str, dict[str, object]] = {}
    saver = object()
    runtime_tool = object()
    root_graph = object()
    working_directory = "/workspace/project/app"

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
            working_directory=working_directory,
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

    assert [call["name"] for call in created] == [
        "my-bot-agent",
        "my-bot-child-1",
        "my-bot-child-1",
        "my-bot-child-2",
    ]
    for call in created:
        prompt = call["system_prompt"]
        assert "The shared workspace root is /workspace." in prompt
        assert f"Your working directory is {working_directory}." in prompt
        assert "Other files in /workspace remain accessible." in prompt
        assert "A tool failure is returned as JSON with ok:false" in prompt
        assert len(call["middleware"]) == 1
    assert "Current task plan (context only)" in created[0]["system_prompt"]
    assert all(
        "Current task plan (context only)" not in call["system_prompt"] for call in created[1:]
    )
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
