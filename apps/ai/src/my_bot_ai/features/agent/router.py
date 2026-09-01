"""Authenticated internal v2 agent streaming endpoint."""

import asyncio
import hmac
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.contracts import (
    MODEL_CAPABILITIES,
    AgentRequest,
    NormalizedEvent,
)
from my_bot_ai.features.agent.errors import AgentServiceError, ProviderMissingError
from my_bot_ai.features.agent.models import ensure_provider_available
from my_bot_ai.features.agent.service import stream_agent_request
from my_bot_ai.logging import classify_error, classify_public_error, lifecycle_event

router = APIRouter(tags=["agent"])
_DIAGNOSTIC_FIELDS = (
    "error_category",
    "error_code",
    "error_summary",
    "provider",
    "error_status_code",
)


def _stream_diagnostic(cause: dict[str, Any]) -> dict[str, Any]:
    """Carry safe diagnostics to the private API without changing public retry semantics."""

    return {key: cause[key] for key in _DIAGNOSTIC_FIELDS if key in cause}


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
    cancellation_logged = False
    terminal = False
    provider = MODEL_CAPABILITIES[body.model].provider
    request.state.provider = provider

    def record_error(error: BaseException) -> dict[str, Any]:
        cause = classify_error(error, provider)
        request.state.error_cause = cause
        return cause

    def emit(event: NormalizedEvent) -> bytes:
        nonlocal sequence
        sequence += 1
        return _frame(sequence, body, event)

    def mark_cancelled() -> None:
        nonlocal cancellation_logged
        request.state.request_outcome = "cancelled"
        request.state.error_cause = classify_public_error("cancelled", provider, False)
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
            "turn_started",
            turn_id=str(body.turn_id),
            conversation_id=str(body.conversation_id),
            model=body.model,
            reasoning_effort=body.reasoning_effort,
        )
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
                mark_cancelled()
                return
            event = NormalizedEvent.model_validate(raw_event)
            yield emit(event)
            if event.type in {"turn.completed", "turn.failed", "user.input_required"}:
                terminal = True
                if event.type == "turn.completed":
                    lifecycle_event(
                        "turn_completed",
                        turn_id=str(body.turn_id),
                        conversation_id=str(body.conversation_id),
                        model=body.model,
                    )
                elif event.type == "turn.failed":
                    request.state.request_outcome = "error"
                    error = event.data.get("error", {})
                    safe_error = classify_public_error(
                        str(error.get("code", "provider_error")),
                        provider,
                        bool(error.get("retryable", True)),
                    )
                    request.state.error_cause = safe_error
                    lifecycle_event(
                        "turn_failed",
                        turn_id=str(body.turn_id),
                        conversation_id=str(body.conversation_id),
                        **safe_error,
                    )
                return

        if not terminal:
            completed = NormalizedEvent(
                type="turn.completed",
                data={"model": body.model},
            )
            yield emit(completed)
            lifecycle_event(
                "turn_completed",
                turn_id=str(body.turn_id),
                conversation_id=str(body.conversation_id),
                model=body.model,
            )
    except (asyncio.CancelledError, GeneratorExit):
        mark_cancelled()
        raise
    except AgentServiceError as error:
        public = error.public_error
        safe_error = record_error(error)
        request.state.request_outcome = "error"
        lifecycle_event(
            "turn_failed",
            turn_id=str(body.turn_id),
            conversation_id=str(body.conversation_id),
            **safe_error,
        )
        yield emit(
            NormalizedEvent(
                type="turn.failed",
                data={
                    "error": {
                        "code": public.code,
                        "message": public.message,
                        "retryable": public.retryable,
                        **_stream_diagnostic(safe_error),
                    }
                },
            )
        )
    except Exception as error:
        request.state.request_outcome = "error"
        safe_error = record_error(error)
        lifecycle_event(
            "turn_failed",
            turn_id=str(body.turn_id),
            conversation_id=str(body.conversation_id),
            **safe_error,
        )
        yield emit(
            NormalizedEvent(
                type="turn.failed",
                data={
                    "error": {
                        "code": "provider_error",
                        "message": "The AI provider failed.",
                        "retryable": True,
                        **_stream_diagnostic(safe_error),
                    }
                },
            )
        )


@router.post("/agent/stream", dependencies=[Depends(require_token)])
async def agent_stream(body: AgentRequest, request: Request) -> StreamingResponse:
    request.state.turn_id = body.turn_id
    request.state.conversation_id = body.conversation_id
    request.state.model = body.model
    request.state.reasoning_effort = body.reasoning_effort
    settings: Settings = request.app.state.settings
    runner = getattr(request.app.state, "runner", None)
    if runner is None:
        try:
            ensure_provider_available(settings, body.model)
        except ProviderMissingError as error:
            public = error.public_error
            request.state.provider = MODEL_CAPABILITIES[body.model].provider
            request.state.error_cause = classify_error(error, request.state.provider)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": public.code, "message": public.message},
            ) from None
    return StreamingResponse(
        _events(request, body, settings, runner),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
