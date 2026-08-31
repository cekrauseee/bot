import asyncio
import json
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.service import build_model, stream_model
from my_bot_ai.main import create_app

TURN = uuid4()
PAYLOAD = {
    "version": 1,
    "turn_id": str(TURN),
    "conversation_id": str(uuid4()),
    "user_id": str(uuid4()),
    "messages": [{"role": "user", "content": "hello"}],
    "model": "gpt-5.6-sol",
    "reasoning_effort": "medium",
    "speed": "standard",
}


async def fake_runner(body, settings):
    yield {"type": "reasoning.delta", "data": {"delta": "Checking"}}
    yield {"type": "text.delta", "data": {"delta": "Hello"}}


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


class FakeModel:
    async def astream_events(self, _input, version):
        assert version == "v2"
        yield {"event": "on_chat_model_stream", "data": {"chunk": Chunk()}}
        yield {"event": "on_chat_model_stream", "data": {"chunk": ResultChunk()}}


class CancelledModel:
    async def astream_events(self, _input, version):
        raise asyncio.CancelledError
        yield  # pragma: no cover


def test_stream_normalizes_reasoning_text_and_web_sources() -> None:
    async def collect():
        return [event async for event in stream_model(FakeModel(), [])]

    import anyio

    events = anyio.run(collect)
    assert [event["type"] for event in events] == [
        "text.delta",
        "reasoning.delta",
        "step.started",
        "step.completed",
    ]
    assert events[0]["data"]["delta"] == "Visible answer"
    assert events[1]["data"]["delta"] == "Brief plan"
    assert events[-1]["data"]["step"]["sources"] == [
        {
            "id": "https://example.com",
            "title": "Source",
            "url": "https://example.com",
            "domain": "example.com",
        }
    ]


def client() -> TestClient:
    return TestClient(
        create_app(
            Settings(
                environment="test",
                ai_base_url="http://localhost:8001",
                ai_service_token="test-token",
            ),
            runner=fake_runner,
        )
    )


def test_stream_auth_and_event_framing() -> None:
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
    assert all(event["turn_id"] == str(TURN) for event in events)


def test_stream_rejects_bad_auth_without_running() -> None:
    response = client().post(
        "/agent/stream", json=PAYLOAD, headers={"Authorization": "Bearer wrong"}
    )
    assert response.status_code == 401


def test_stream_strictly_validates_contract() -> None:
    invalid = {**PAYLOAD, "extra": True}
    response = client().post(
        "/agent/stream", json=invalid, headers={"Authorization": "Bearer test-token"}
    )
    assert response.status_code == 422


def test_missing_provider_is_safe() -> None:
    application = create_app(
        Settings(
            environment="test",
            ai_base_url="http://localhost:8001",
            ai_service_token="test-token",
        )
    )
    response = TestClient(application).post(
        "/agent/stream", json=PAYLOAD, headers={"Authorization": "Bearer test-token"}
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "AI provider is not configured"}


def test_provider_settings_map_standard_and_fast() -> None:
    with (
        patch("my_bot_ai.features.agent.service.ChatOpenAI", side_effect=lambda **kwargs: kwargs),
        patch(
            "my_bot_ai.features.agent.service.create_agent",
            side_effect=lambda **kwargs: kwargs["model"],
        ),
    ):
        standard = build_model(
            Settings(
                environment="test",
                ai_base_url="http://localhost:8001",
                ai_service_token="test-token",
                openai_api_key="key",
            ),
            "gpt-5.6-sol",
            "low",
            "standard",
        )
        fast = build_model(
            Settings(
                environment="test",
                ai_base_url="http://localhost:8001",
                ai_service_token="test-token",
                openai_api_key="key",
            ),
            "gpt-5.6-luna",
            "high",
            "fast",
        )
    assert standard["service_tier"] == "default"
    assert fast["service_tier"] == "fast"
    assert standard["store"] is fast["store"] is False


def test_stream_propagates_cancellation() -> None:
    import anyio

    async def collect():
        return [event async for event in stream_model(CancelledModel(), [])]

    try:
        anyio.run(collect)
    except asyncio.CancelledError:
        pass
    else:
        raise AssertionError("cancellation must not become a provider error event")
