"""Authenticated agent streaming endpoint."""

import asyncio
import hmac
import json
from collections.abc import AsyncIterator
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.service import build_model, stream_model
from my_bot_ai.logging import lifecycle_event

router = APIRouter(tags=["agent"])


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class AgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    turn_id: UUID
    conversation_id: UUID
    user_id: UUID
    messages: list[Message] = Field(min_length=1)
    model: Literal["gpt-5.6-sol", "gpt-5.6-luna"]
    reasoning_effort: Literal["low", "medium", "high", "xhigh", "max"]
    speed: Literal["standard", "fast"]


def require_token(request: Request) -> None:
    expected = request.app.state.settings.ai_service_token
    authorization = request.headers.get("authorization", "")
    if not hmac.compare_digest(authorization, f"Bearer {expected}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def _frame(sequence: int, turn_id: UUID, event_type: str, data: dict[str, Any]) -> bytes:
    payload = {
        "version": 1,
        "sequence": sequence,
        "turn_id": str(turn_id),
        "type": event_type,
        "data": data,
    }
    return f"event: {event_type}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n".encode()


async def _events(
    request: Request, body: AgentRequest, settings: Settings, runner: Any = None
) -> AsyncIterator[bytes]:
    sequence = 0
    cancellation_logged = False

    def emit(event_type: str, data: dict[str, Any]) -> bytes:
        nonlocal sequence
        sequence += 1
        return _frame(sequence, body.turn_id, event_type, data)

    def mark_cancelled() -> None:
        nonlocal cancellation_logged
        request.state.request_outcome = "cancelled"
        if cancellation_logged:
            return
        cancellation_logged = True
        lifecycle_event(
            "turn_cancelled",
            turn_id=str(body.turn_id),
            conversation_id=str(body.conversation_id),
        )

    try:
        request.state.request_outcome = "success"
        lifecycle_event(
            "turn_started", turn_id=str(body.turn_id), conversation_id=str(body.conversation_id),
            model=body.model, reasoning_effort=body.reasoning_effort,
        )
        yield emit(
            "turn.started",
            {
                "model": body.model,
                "reasoning_effort": body.reasoning_effort,
                "speed": body.speed,
            },
        )
        if runner is None:
            llm = build_model(settings, body.model, body.reasoning_effort, body.speed)
            events = stream_model(llm, [message.model_dump() for message in body.messages])
        else:
            events = runner(body, settings)
        async for event in events:
            if await request.is_disconnected():
                mark_cancelled()
                return
            yield emit(event["type"], event.get("data", {}))
        yield emit("turn.completed", {"model": body.model})
        lifecycle_event(
            "turn_completed",
            turn_id=str(body.turn_id),
            conversation_id=str(body.conversation_id),
            model=body.model,
        )
    except asyncio.CancelledError, GeneratorExit:
        mark_cancelled()
        raise
    except Exception:
        request.state.request_outcome = "error"
        lifecycle_event(
            "turn_failed",
            turn_id=str(body.turn_id),
            conversation_id=str(body.conversation_id),
            error_code="provider_error",
        )
        yield emit(
            "turn.failed",
            {
                "error": {
                    "code": "provider_error",
                    "message": "The AI provider failed.",
                    "retryable": True,
                }
            },
        )


@router.post("/agent/stream", dependencies=[Depends(require_token)])
async def agent_stream(body: AgentRequest, request: Request) -> StreamingResponse:
    request.state.turn_id = body.turn_id
    request.state.conversation_id = body.conversation_id
    request.state.model = body.model
    request.state.reasoning_effort = body.reasoning_effort
    settings: Settings = request.app.state.settings
    if not settings.openai_api_key and not getattr(request.app.state, "runner", None):
        raise HTTPException(status_code=503, detail="AI provider is not configured")
    runner = getattr(request.app.state, "runner", None)
    return StreamingResponse(
        _events(request, body, settings, runner),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
