"""Structured, redacted logging for the AI service."""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import structlog
from fastapi import Request, Response

_SAFE_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_RENDERER = "my_bot_ai_renderer"
_HANDLER = "my_bot_ai_handler"
_DENIED_KEYS = {
    "authorization", "cookie", "set_cookie", "token", "api_key", "service_token",
    "password", "secret", "otp", "oauth_state", "state", "email", "body",
    "request_body", "response_body", "prompt", "message", "content", "reasoning", "code",
}

_ERROR_SUMMARIES = {
    "provider_auth": "The AI provider rejected the credentials.",
    "provider_quota": "The AI provider quota is exhausted.",
    "provider_rate_limit": "The AI provider rate limit was reached.",
    "provider_permission": "The AI provider denied access to this model.",
    "provider_bad_request": "The AI provider rejected the request.",
    "provider_timeout": "The AI provider timed out.",
    "provider_unavailable": "The AI provider is temporarily unavailable.",
    "provider_failure": "The AI provider request failed.",
    "provider_missing": "The selected AI provider is not configured.",
    "runtime": "A runtime tool failed.",
    "checkpoint": "The durable agent checkpoint failed.",
    "invalid_request": "The agent request was invalid.",
    "cancelled": "The request was cancelled.",
    "internal": "The AI service encountered an internal error.",
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


def add_service_context(
    _logger: Any, _method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Give stdlib records the same service fields as application records."""
    event_dict.setdefault("service", "my_bot_ai")
    event_dict.setdefault("schema_version", 1)
    return event_dict


def _replace_owned_handler(logger: logging.Logger, handler: logging.Handler) -> None:
    for existing in tuple(logger.handlers):
        if getattr(existing, _HANDLER, False):
            logger.removeHandler(existing)
            existing.close()
    setattr(handler, _HANDLER, True)
    logger.addHandler(handler)


class PrettyConsoleRenderer(structlog.dev.ConsoleRenderer):
    """Render a Pino Pretty-style header followed by one field per line."""

    def __init__(self) -> None:
        styles = self.get_default_column_styles(colors=True)
        level_styles = self.get_default_level_styles(colors=True)

        def level(_key: str, value: object) -> str:
            name = str(value)
            style = level_styles.get(name, "")
            return f"{style}{styles.bright}{name.upper()}{styles.reset}"

        def field(key: str, value: object) -> str:
            rendered = json.dumps(value, ensure_ascii=False, default=str)
            return (
                f"\n    {styles.kv_key}{key}{styles.reset}: "
                f"{styles.kv_value}{rendered}{styles.reset}"
            )

        def omitted(_key: str, _value: object) -> str:
            return ""

        super().__init__(
            columns=[
                structlog.dev.Column(
                    "timestamp",
                    structlog.dev.KeyValueColumnFormatter(
                        key_style=None,
                        value_style=styles.timestamp,
                        reset_style=styles.reset,
                        value_repr=str,
                        prefix="[",
                        postfix="]",
                    ),
                ),
                structlog.dev.Column("level", level),
                structlog.dev.Column(
                    "logger",
                    structlog.dev.KeyValueColumnFormatter(
                        key_style=None,
                        value_style=styles.bright + styles.logger_name,
                        reset_style=styles.reset,
                        value_repr=str,
                        prefix="(",
                        postfix="):",
                    ),
                ),
                structlog.dev.Column(
                    "event",
                    structlog.dev.KeyValueColumnFormatter(
                        key_style=None,
                        value_style=styles.bright,
                        reset_style=styles.reset,
                        value_repr=str,
                    ),
                ),
                structlog.dev.Column("service", omitted),
                structlog.dev.Column("", field),
            ]
        )
        self.sort_keys = False

    def __call__(self, logger: Any, name: str, event_dict: dict[str, Any]) -> str:
        return super().__call__(logger, name, event_dict).replace(" \n", "\n")


def configure_logging(environment: str) -> None:
    """Configure one process-wide renderer and suppress duplicate access logs."""
    production = environment == "production"
    timestamp = (
        structlog.processors.TimeStamper(fmt="iso", utc=True)
        if production
        else structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False)
    )
    renderer: Any = (
        structlog.processors.JSONRenderer()
        if production
        else PrettyConsoleRenderer()
    )
    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
    ]
    if not production:
        processors.append(structlog.stdlib.add_logger_name)
    processors.extend([timestamp, sanitize_event_dict, renderer])
    structlog.configure(
        processors=processors,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=False,
    )
    structlog.contextvars.bind_contextvars(
        service="my_bot_ai", environment=environment, schema_version=1
    )
    service_logger = logging.getLogger("my_bot_ai")
    service_logger.setLevel(logging.INFO)
    service_handler = logging.StreamHandler()
    service_handler.setFormatter(logging.Formatter("%(message)s"))
    _replace_owned_handler(service_logger, service_handler)
    service_logger.propagate = False

    uvicorn_handler = logging.StreamHandler()
    uvicorn_handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=[
                structlog.stdlib.add_log_level,
                structlog.stdlib.add_logger_name,
                timestamp,
                add_service_context,
                lambda _logger, _method, event: {
                    **event,
                    "environment": environment,
                },
                sanitize_event_dict,
            ],
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                renderer,
            ],
        )
    )
    uvicorn_logger = logging.getLogger("uvicorn")
    uvicorn_logger.setLevel(logging.INFO)
    _replace_owned_handler(uvicorn_logger, uvicorn_handler)
    uvicorn_logger.propagate = False
    for name in ("uvicorn.error", "uvicorn.asgi"):
        child_logger = logging.getLogger(name)
        child_logger.handlers.clear()
        child_logger.propagate = True
    logging.getLogger("uvicorn.access").disabled = True


def safe_identifier(value: str | None) -> str:
    """Accept bounded header identifiers and generate a UUID for invalid values."""
    if value and _SAFE_ID.fullmatch(value):
        return value
    return str(uuid.uuid4())


def classify_error(error: BaseException, provider: str | None = None) -> dict[str, Any]:
    """Return a fixed, non-sensitive operational description of an exception."""
    name = error.__class__.__name__.lower()
    module = error.__class__.__module__.lower()
    public = getattr(error, "public_error", None)
    public_code = getattr(public, "code", None)
    upstream_code = getattr(error, "code", None)
    if not isinstance(upstream_code, str):
        upstream_code = None
    if upstream_code is None:
        body = getattr(error, "body", None)
        if isinstance(body, dict):
            detail = body.get("error")
            if isinstance(detail, dict) and detail.get("code") == "insufficient_quota":
                upstream_code = "insufficient_quota"
    status_code = getattr(error, "status_code", None)
    if not isinstance(status_code, int):
        status_code = None

    category = "internal"
    code = "internal_error"
    retryable = False
    if public_code:
        code = str(public_code)
        if code == "provider_missing":
            category = code
        elif code in {"runtime_error", "manual_recovery_required", "idempotency_conflict"}:
            category = "runtime"
        elif code in {"checkpoint_missing"}:
            category = "checkpoint"
        elif code in {"invalid_resume"}:
            category = "invalid_request"
        else:
            category = "internal"
        retryable = bool(getattr(public, "retryable", False))
    elif upstream_code == "insufficient_quota":
        category, code, retryable = "provider_quota", upstream_code, False
    elif (
        "authentication" in name
        or name in {"invalidapikeyerror", "autherror"}
        or status_code == 401
    ):
        category, code = "provider_auth", "provider_auth"
    elif "permission" in name or "forbidden" in name or status_code == 403:
        category, code = "provider_permission", "provider_permission"
    elif "timeout" in name or "timeout" in module:
        category, code, retryable = "provider_timeout", "provider_timeout", True
    elif "badrequest" in name or status_code == 400:
        category, code = "provider_bad_request", "provider_bad_request"
    elif "ratelimit" in name or status_code == 429:
        category, code, retryable = "provider_rate_limit", "provider_rate_limit", True
    elif "unavailable" in name or "connection" in name or status_code in {502, 503, 504}:
        category, code, retryable = "provider_unavailable", "provider_unavailable", True

    result: dict[str, Any] = {
        "error_type": error.__class__.__name__[:128],
        "error_category": category,
        "error_code": code,
        "error_summary": _ERROR_SUMMARIES[category],
        "retryable": retryable,
    }
    if provider in {"openai", "xai", "openrouter"}:
        result["provider"] = provider
    if status_code is not None and 100 <= status_code <= 599:
        result["error_status_code"] = status_code
    return result


def classify_public_error(
    code: str, provider: str | None = None, retryable: bool = False
) -> dict[str, Any]:
    """Classify an already-safe public error code for lifecycle records."""
    categories = {
        "provider_missing": "provider_missing",
        "provider_error": "provider_failure",
        "runtime_error": "runtime",
        "manual_recovery_required": "runtime",
        "idempotency_conflict": "runtime",
        "checkpoint_missing": "checkpoint",
        "invalid_resume": "invalid_request",
        "cancelled": "cancelled",
    }
    safe_code = code if code in categories else (
        "provider_error" if retryable else "internal_error"
    )
    category = categories.get(safe_code, "provider_failure" if retryable else "internal")
    fields: dict[str, Any] = {
        "error_category": category,
        "error_code": safe_code,
        "error_summary": _ERROR_SUMMARIES[category],
        "retryable": retryable,
    }
    if provider in {"openai", "xai", "openrouter"}:
        fields["provider"] = provider
    return fields


def outbound_request_headers() -> dict[str, str]:
    """Propagate only validated tracing identifiers to private downstream services."""
    context = structlog.contextvars.get_contextvars()
    headers: dict[str, str] = {}
    for field, header in (
        ("request_id", "x-request-id"),
        ("correlation_id", "x-correlation-id"),
    ):
        value = context.get(field)
        if isinstance(value, str) and _SAFE_ID.fullmatch(value):
            headers[header] = value
    return headers


def request_context(request: Request) -> tuple[str, str]:
    structlog.contextvars.clear_contextvars()
    request_id = safe_identifier(request.headers.get("x-request-id"))
    correlation_id = safe_identifier(request.headers.get("x-correlation-id"))
    structlog.contextvars.bind_contextvars(
        service="my_bot_ai",
        environment=request.app.state.settings.environment,
        schema_version=1,
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
        fields.update(classify_error(error, getattr(request.state, "provider", None)))
    cause = getattr(request.state, "error_cause", None)
    if isinstance(cause, dict):
        fields.update(cause)
    logger.info(**fields)


def lifecycle_event(event: str, **fields: Any) -> None:
    """Emit a bounded lifecycle event; callers must pass identifiers only."""
    structlog.get_logger("my_bot_ai").info(event, **fields)
