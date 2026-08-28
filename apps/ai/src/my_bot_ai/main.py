"""FastAPI application factory and ASGI export."""

from fastapi import FastAPI

from my_bot_ai.config import Settings, get_settings
from my_bot_ai.features.health.router import router as health_router


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create an isolated AI service application."""

    resolved_settings = settings or get_settings()
    application = FastAPI(
        title="myBot AI",
        version="0.1.0",
        description="Future model-provider boundary for myBot.",
    )
    application.state.settings = resolved_settings
    application.include_router(health_router)
    return application


app = create_app()
