"""FastAPI application factory and ASGI export."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from my_bot_ai.config import Settings, get_settings
from my_bot_ai.features.agent.router import router as agent_router
from my_bot_ai.features.health.router import router as health_router
from my_bot_ai.logging import configure_logging, logging_middleware


def _is_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    return not normalized or normalized.startswith(
        ("replace-with-", "example-", "your-", "development-")
    ) or normalized in {"replace-me", "re_example", "changeme", "change-me"}


def create_app(settings: Settings | None = None, runner=None) -> FastAPI:
    """Create an isolated AI service application."""

    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.environment)
    if resolved_settings.environment == "production":
        token = resolved_settings.ai_service_token
        key = resolved_settings.openai_api_key or ""
        if _is_placeholder(token) or token == "dev-ai-service-token" or len(token) < 32:
            raise ValueError("AI_SERVICE_TOKEN must be a strong production secret")
        if _is_placeholder(key) or len(key) < 20:
            raise ValueError("OPENAI_API_KEY must be configured in production")
    application = FastAPI(
        title="myBot AI",
        version="0.1.0",
        description="Authenticated streaming AI agent service for myBot.",
    )
    application.state.settings = resolved_settings
    application.state.runner = runner

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
