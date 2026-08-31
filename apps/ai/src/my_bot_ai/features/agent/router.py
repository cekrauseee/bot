"""Authenticated internal v2 agent streaming endpoint."""

import asyncio
import hmac
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.contracts import AgentRequest, NormalizedEvent
from my_bot_ai.features.agent.errors import AgentServiceError, ProviderMissingError
from my_bot_ai.features.agent.models import ensure_provider_available
from my_bot_ai.features.agent.service import stream_agent_request

router = APIRouter(tags=["agent"])


def require_token(request: Request) -> None:
    expected = request.app.state.settings.ai_service_token
    authorization = request.headers.get("authorization", "")
    if not hmac.compare_digest(authorization, f"Bearer {expected}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def _frame(sequence: int, body: AgentRequest, event: NormalizedEvent) -> bytes:
    payload = {
        "version": 2,
        "sequence": sequence,
        "run_id": str(body.run_id),
        "turn_id": str(body.turn_id),
        "type": event.type,
        "data": event.data,
    }
    return (
        f"event: {event.type}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"
    ).encode()


async def _events(
    request: Request,
    body: AgentRequest,
    settings: Settings,
    runner: Any = None,
) -> AsyncIterator[bytes]:
    sequence = 0
    terminal = False

    def emit(event: NormalizedEvent) -> bytes:
        nonlocal sequence
        sequence += 1
        return _frame(sequence, body, event)

    try:
        if runner is None:
            events = stream_agent_request(
                body,
                settings,
                request.app.state.checkpointer,
                runtime_tools=request.app.state.runtime_tools,
            )
        else:
            yield emit(
                NormalizedEvent(
                    type="turn.started",
                    data={
                        "thread_id": str(body.run_id),
                        "model": body.model,
                        "reasoning_effort": body.reasoning_effort,
                        "speed": body.speed,
                        "plan": [step.model_dump(mode="json") for step in body.task_plan],
                        "resumed": body.resume is not None,
                    },
                )
            )
            events = runner(body, settings)

        async for raw_event in events:
            if await request.is_disconnected():
                return
            event = NormalizedEvent.model_validate(raw_event)
            yield emit(event)
            if event.type in {"turn.completed", "turn.failed", "user.input_required"}:
                terminal = True
                return

        if not terminal:
            yield emit(
                NormalizedEvent(
                    type="turn.completed",
                    data={"model": body.model},
                )
            )
    except (asyncio.CancelledError, GeneratorExit):
        raise
    except AgentServiceError as error:
        public = error.public_error
        yield emit(
            NormalizedEvent(
                type="turn.failed",
                data={
                    "error": {
                        "code": public.code,
                        "message": public.message,
                        "retryable": public.retryable,
                    }
                },
            )
        )
    except Exception:
        yield emit(
            NormalizedEvent(
                type="turn.failed",
                data={
                    "error": {
                        "code": "provider_error",
                        "message": "The AI provider failed.",
                        "retryable": True,
                    }
                },
            )
        )


@router.post("/agent/stream", dependencies=[Depends(require_token)])
async def agent_stream(body: AgentRequest, request: Request) -> StreamingResponse:
    settings: Settings = request.app.state.settings
    runner = getattr(request.app.state, "runner", None)
    if runner is None:
        try:
            ensure_provider_available(settings, body.model)
        except ProviderMissingError as error:
            public = error.public_error
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": public.code, "message": public.message},
            ) from None
    return StreamingResponse(
        _events(request, body, settings, runner),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
