"""Structured, redacted logging for the AI service."""

from __future__ import annotations

import logging
import re
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import structlog
from fastapi import Request, Response

_SAFE_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_RENDERER = "my_bot_ai_renderer"
_DENIED_KEYS = {
    "authorization", "cookie", "set_cookie", "token", "api_key", "service_token",
    "password", "secret", "otp", "oauth_state", "state", "email", "body",
    "request_body", "response_body", "prompt", "message", "content", "reasoning", "code",
}


def sanitize_log_fields(value: Any, depth: int = 0, seen: set[int] | None = None) -> Any:
    """Recursively remove credential and user-payload-shaped log fields."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if seen is None:
        seen = set()
    value_id = id(value)
    if value_id in seen:
        return "[Circular]"
    seen.add(value_id)
    if isinstance(value, list):
        return [sanitize_log_fields(item, depth + 1, seen) for item in value]
    if isinstance(value, tuple):
        return [sanitize_log_fields(item, depth + 1, seen) for item in value]
    if isinstance(value, dict):
        sanitized: dict[Any, Any] = {}
        for key, item in value.items():
            normalized = re.sub(r"([a-z])([A-Z])", r"\1_\2", str(key)).lower().replace("-", "_")
            if normalized in _DENIED_KEYS - {"code"}:
                continue
            if normalized == "code" and (
                not isinstance(item, str)
                or re.fullmatch(r"\d{4,8}", item)
                or len(item) >= 16
                or re.search(r"secret|token|auth|otp", item, re.IGNORECASE)
            ):
                continue
            sanitized[key] = sanitize_log_fields(item, depth + 1, seen)
        return sanitized
    return str(value)


def sanitize_event_dict(
    _logger: Any, _method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Structlog processor applying the redaction boundary to every event."""
    return sanitize_log_fields(event_dict)


def configure_logging(environment: str) -> None:
    """Configure one process-wide renderer and suppress duplicate access logs."""
    renderer = (
        structlog.processors.JSONRenderer()
        if environment == "production"
        else structlog.dev.ConsoleRenderer(colors=False)
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            sanitize_event_dict,
            renderer,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=False,
    )
    structlog.contextvars.bind_contextvars(service="my_bot_ai", environment=environment)
    service_logger = logging.getLogger("my_bot_ai")
    service_logger.setLevel(logging.INFO)
    if not service_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        service_logger.addHandler(handler)
    service_logger.propagate = False
    logging.getLogger("uvicorn.access").disabled = True


def safe_identifier(value: str | None) -> str:
    """Accept bounded header identifiers and generate a UUID for invalid values."""
    if value and _SAFE_ID.fullmatch(value):
        return value
    return str(uuid.uuid4())


def request_context(request: Request) -> tuple[str, str]:
    structlog.contextvars.clear_contextvars()
    request_id = safe_identifier(request.headers.get("x-request-id"))
    correlation_id = safe_identifier(request.headers.get("x-correlation-id"))
    structlog.contextvars.bind_contextvars(
        service="my_bot_ai",
        environment=request.app.state.settings.environment,
        request_id=request_id,
        correlation_id=correlation_id,
    )
    request.state.request_id = request_id
    request.state.correlation_id = correlation_id
    return request_id, correlation_id


async def logging_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Own request lifecycle logging, including the lifetime of streamed bodies."""
    import time

    started = time.perf_counter()
    request_id, correlation_id = request_context(request)
    status_code = 500
    outcome = "error"
    logger = structlog.get_logger("my_bot_ai")
    completed = False
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["x-request-id"] = request_id
        response.headers["x-correlation-id"] = correlation_id
        original_body_iterator = response.body_iterator  # type: ignore[attr-defined]

        async def body() -> AsyncIterator[bytes]:
            nonlocal completed, outcome
            try:
                async for chunk in original_body_iterator:
                    yield chunk
                outcome = getattr(
                    request.state,
                    "request_outcome",
                    "error" if status_code >= 400 else "success",
                )
            except BaseException as exc:
                outcome = "cancelled" if exc.__class__.__name__ == "CancelledError" else "error"
                raise
            finally:
                if not completed:
                    completed = True
                    _completed(logger, request, status_code, outcome, started)
                structlog.contextvars.clear_contextvars()

        response.body_iterator = body()  # type: ignore[attr-defined]
        return response
    except BaseException as exc:
        outcome = "cancelled" if exc.__class__.__name__ == "CancelledError" else "error"
        if not completed:
            completed = True
            _completed(logger, request, status_code, outcome, started, exc)
        raise
    finally:
        if completed:
            structlog.contextvars.clear_contextvars()


def _completed(
    logger: Any,
    request: Request,
    status_code: int,
    outcome: str,
    started: float,
    error: BaseException | None = None,
) -> None:
    route = request.scope.get("route")
    http_route = getattr(route, "path", None) or request.url.path
    fields: dict[str, Any] = {
        "event": "request_completed",
        "http_method": request.method.lower(),
        "http_route": http_route,
        "http_status_code": status_code,
        "duration_ms": round((__import__("time").perf_counter() - started) * 1000, 2),
        "outcome": outcome,
    }
    for name in ("turn_id", "conversation_id", "model", "reasoning_effort"):
        value = getattr(request.state, name, None)
        if value is not None:
            fields[name] = str(value)
    if error is not None:
        fields["error_type"] = error.__class__.__name__
    logger.info(**fields)


def lifecycle_event(event: str, **fields: Any) -> None:
    """Emit a bounded lifecycle event; callers must pass identifiers only."""
    structlog.get_logger("my_bot_ai").info(event, **fields)
