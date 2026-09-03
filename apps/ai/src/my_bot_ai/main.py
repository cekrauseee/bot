"""FastAPI application factory and ASGI export."""

from collections.abc import Sequence
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from my_bot_ai.config import Settings, get_settings
from my_bot_ai.features.agent.checkpoints import checkpointer_for_settings
from my_bot_ai.features.agent.router import router as agent_router
from my_bot_ai.features.health.router import router as health_router
from my_bot_ai.logging import configure_logging, logging_middleware


def _is_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    return not normalized or normalized.startswith(
        ("replace-with-", "example-", "your-", "development-")
    ) or normalized in {"replace-me", "re_example", "changeme", "change-me"}


def create_app(
    settings: Settings | None = None,
    runner: Any = None,
    *,
    title_runner: Any = None,
    checkpointer: Any = None,
    runtime_tools: Sequence[Any] | None = None,
) -> FastAPI:
    """Create an isolated AI service application."""

    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.environment)
    if resolved_settings.environment == "production":
        token = resolved_settings.ai_service_token
        provider_key = resolved_settings.openai_api_key or ""
        if _is_placeholder(token) or token == "dev-ai-service-token" or len(token) < 32:
            raise ValueError("AI_SERVICE_TOKEN must be a strong production secret")
        if _is_placeholder(provider_key) or len(provider_key) < 20:
            raise ValueError("OPENAI_API_KEY must be configured in production")
        if checkpointer is None and not resolved_settings.database_url:
            raise ValueError("DATABASE_URL must be configured in production")
        runtime_token = resolved_settings.runtime_service_token or ""
        if _is_placeholder(runtime_token) or len(runtime_token) < 32:
            raise ValueError("RUNTIME_SERVICE_TOKEN must be a strong production secret")

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        if checkpointer is not None:
            application.state.checkpointer = checkpointer
            yield
            return
        async with checkpointer_for_settings(resolved_settings) as active_checkpointer:
            application.state.checkpointer = active_checkpointer
            yield

    application = FastAPI(
        title="myBot AI",
        version="0.1.0",
        description="Authenticated streaming AI agent service for myBot.",
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings
    application.state.runner = runner
    application.state.title_runner = title_runner
    application.state.runtime_tools = None if runtime_tools is None else tuple(runtime_tools)

    @application.middleware("http")
    async def request_body_limit(request: Request, call_next):
        # This is a transport safety limit only; product context/output limits
        # remain owned by the provider and caller contract.
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > 8 * 1024 * 1024:
            return JSONResponse({"detail": "Request body too large"}, status_code=413)
        return await call_next(request)

    application.middleware("http")(logging_middleware)

    application.include_router(health_router)
    application.include_router(agent_router)
    return application


app = create_app()
