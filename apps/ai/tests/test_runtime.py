import json
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import anyio
import httpx
import pytest
import structlog

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.contracts import AgentRequest
from my_bot_ai.features.agent.errors import (
    RuntimeIdempotencyConflictError,
    RuntimeRecoveryRequiredError,
)
from my_bot_ai.features.agent.runtime import (
    RuntimeClient,
    RuntimeContext,
    build_runtime_tools,
)
from my_bot_ai.features.agent.service import stream_agent_request


class EmptyGraph:
    async def astream_events(self, _input, *, version, **_kwargs):
        assert version == "v2"
        if False:
            yield None

    async def aget_state(self, _config):
        return SimpleNamespace(tasks=())


def test_runtime_tools_use_typed_schemas_and_normalized_dotted_requests() -> None:
    captured: list[dict[str, object]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        captured.append(
            {
                "url": str(request.url),
                "authorization": request.headers.get("authorization"),
                "request_id": request.headers.get("x-request-id"),
                "correlation_id": request.headers.get("x-correlation-id"),
                "body": json.loads(request.content),
            }
        )
        return httpx.Response(200, json={"result": {"ok": True}})

    async def run() -> tuple[list[str], dict[str, dict[str, object]]]:
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id="request-1", correlation_id="correlation-1"
        )
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            context = RuntimeContext(
                run_id="run-1",
                conversation_id="conversation-1",
                user_id="user-1",
                workspace_id="workspace-1",
                working_directory="/workspace/project",
            )
            client = RuntimeClient("https://runtime.invalid", token="token", client=http)
            tools = build_runtime_tools(client, context)
            by_name = {tool.name: tool for tool in tools}
            calls = {
                "filesystem_list": {"path": "/workspace"},
                "filesystem_read": {"path": "/workspace/notes.txt"},
                "filesystem_write": {
                    "path": "/workspace/notes.txt",
                    "content": "hello",
                },
                "shell_exec": {
                    "command": "printf",
                    "argv": ["hello"],
                    "cwd": "/workspace",
                },
                "browser_open": {"url": "https://example.com"},
                "browser_snapshot": {},
                "browser_click": {"selector": "#continue"},
                "browser_type": {"selector": "#name", "text": "Ada"},
                "browser_close": {},
            }
            for name, arguments in calls.items():
                result = await by_name[name].ainvoke(
                    {
                        "type": "tool_call",
                        "id": f"call-{name}",
                        "name": name,
                        "args": arguments,
                    }
                )
                assert json.loads(result.content) == {"ok": True}
            return list(by_name), {name: tool.args for name, tool in by_name.items()}

    try:
        names, schemas = anyio.run(run)
    finally:
        structlog.contextvars.clear_contextvars()
    assert names == [
        "filesystem_list",
        "filesystem_read",
        "filesystem_write",
        "shell_exec",
        "browser_open",
        "browser_snapshot",
        "browser_click",
        "browser_type",
        "browser_close",
    ]
    assert "browser_release_control" not in names
    assert "leaseId" not in schemas["browser_click"]
    assert "leaseId" not in schemas["browser_type"]
    assert all(item["url"] == "https://runtime.invalid/tools" for item in captured)
    assert all(item["authorization"] == "Bearer token" for item in captured)
    assert all(item["request_id"] == "request-1" for item in captured)
    assert all(item["correlation_id"] == "correlation-1" for item in captured)
    assert [item["body"]["tool"] for item in captured] == [
        "filesystem.list",
        "filesystem.read",
        "filesystem.write",
        "shell.exec",
        "browser.open",
        "browser.snapshot",
        "browser.click",
        "browser.type",
        "browser.close",
    ]
    assert all(
        item["body"]["workspace_id"] == "workspace-1"
        and item["body"]["run_id"] == "run-1"
        and item["body"]["conversation_id"] == "conversation-1"
        and item["body"]["user_id"] == "user-1"
        and item["body"]["working_directory"] == "/workspace/project"
        for item in captured
    )
    assert all(
        isinstance(item["body"]["operation_id"], str)
        and len(item["body"]["operation_id"]) == 64
        for item in captured
    )
    assert len({item["body"]["operation_id"] for item in captured}) == len(captured)


def test_runtime_tools_use_contextual_defaults_for_filesystem_and_shell() -> None:
    captured: list[dict[str, object]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"result": {"ok": True}})

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            tools = build_runtime_tools(
                RuntimeClient("https://runtime.invalid", client=http),
                RuntimeContext("run", "conversation", "user", "workspace", "/workspace/app"),
            )
            by_name = {tool.name: tool for tool in tools}
            for name in ("filesystem_list", "shell_exec"):
                args = {"command": "true", "argv": []} if name == "shell_exec" else {}
                result = await by_name[name].ainvoke(
                    {"type": "tool_call", "id": f"call-{name}", "name": name, "args": args}
                )
                assert json.loads(result.content) == {"ok": True}

    anyio.run(run)
    assert captured[0]["arguments"] == {"path": "."}
    assert captured[1]["arguments"] == {"command": "true", "argv": [], "cwd": "."}


def test_agent_builds_an_isolated_runtime_client_for_each_request() -> None:
    workspace_id = uuid4()
    body = AgentRequest(
        version=2,
        run_id=uuid4(),
        turn_id=uuid4(),
        workspace_id=workspace_id,
        conversation_id=uuid4(),
        user_id=uuid4(),
        messages=[{"role": "user", "content": "Inspect the workspace"}],
        model="gpt-5.6-luna",
        reasoning_effort="medium",
        speed="standard",
        working_directory="/workspace/project/app",
    )
    clients: list[tuple[str, str | None]] = []
    contexts: list[RuntimeContext] = []
    tools = (object(),)

    class FakeRuntimeClient:
        def __init__(self, base_url: str, *, token: str | None = None):
            clients.append((base_url, token))

    def fake_tools(_client, context):
        contexts.append(context)
        return tools

    async def run() -> None:
        settings = Settings(
            environment="test",
            runtime_base_url="http://runtime.internal:8002",
            runtime_service_token="runtime-token",
        )
        for _ in range(2):
            with patch(
                "my_bot_ai.features.agent.service.build_model",
                return_value=(EmptyGraph(), "openai"),
            ) as build:
                events = [
                    event
                    async for event in stream_agent_request(body, settings, checkpointer=object())
                ]
                assert [event["type"] for event in events] == ["turn.started"]
                assert events[0]["data"]["checkpoint"]["phase"] == "absent"
                assert build.call_args.kwargs["runtime_tools"] is tools
                assert build.call_args.kwargs["working_directory"] == body.working_directory

    with (
        patch("my_bot_ai.features.agent.service.RuntimeClient", FakeRuntimeClient),
        patch("my_bot_ai.features.agent.service.build_runtime_tools", side_effect=fake_tools),
    ):
        anyio.run(run)

    assert clients == [
        ("http://runtime.internal:8002", "runtime-token"),
        ("http://runtime.internal:8002", "runtime-token"),
    ]
    assert [context.workspace_id for context in contexts] == [str(workspace_id)] * 2
    assert [context.working_directory for context in contexts] == [body.working_directory] * 2


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("manual_recovery_required", RuntimeRecoveryRequiredError),
        ("idempotency_conflict", RuntimeIdempotencyConflictError),
    ],
)
def test_runtime_client_preserves_non_retryable_idempotency_failures(code, expected) -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            409,
            json={"error": {"code": code, "message": "private", "retryable": False}},
        )

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = RuntimeClient("https://runtime.invalid", client=http)
            with pytest.raises(expected):
                await client.execute_tool(
                    "filesystem.read",
                    {"path": "/workspace/file.txt"},
                    RuntimeContext("run", "conversation", "user", "workspace"),
                    operation_id="operation",
                )

    anyio.run(run)


def test_runtime_client_strips_browser_frames_and_dispatches_them_transiently() -> None:
    frame = {
        "base64": "cG5n",
        "mime_type": "image/png",
        "captured_at": "2026-08-30T17:00:00Z",
    }

    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"result": {"ok": True, "browser_frame": frame}})

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = RuntimeClient("https://runtime.invalid", client=http)
            with patch(
                "my_bot_ai.features.agent.runtime.adispatch_custom_event"
            ) as dispatch:
                dispatch.return_value = None
                result = await client.execute_tool(
                    "browser.snapshot",
                    {},
                    RuntimeContext("run", "conversation", "user", "workspace"),
                    operation_id="operation",
                )
                assert result == {"ok": True}
                dispatch.assert_awaited_once_with("browser.frame", frame)

    anyio.run(run)
