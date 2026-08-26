from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from my_bot_api.auth.errors import AuthError
from my_bot_api.auth.schemas import ErrorDetail
from my_bot_api.config import Settings, get_settings
from my_bot_api.container import ApplicationContainer, create_container
from my_bot_api.routers.auth import router as auth_router
from my_bot_api.routers.health import router as health_router


def create_app(
    settings: Settings | None = None,
    *,
    container: ApplicationContainer | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    resolved_container = container or create_container(resolved_settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            await resolved_container.close()

    application = FastAPI(title="myBot API", version="0.1.0", lifespan=lifespan)
    application.state.container = resolved_container
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[resolved_settings.web_origin],
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    application.add_middleware(
        SessionMiddleware,
        secret_key=resolved_settings.session_secret.get_secret_value(),
        session_cookie=(
            "__Host-mybot_oauth_state"
            if resolved_settings.environment == "production"
            else "mybot_oauth_state"
        ),
        max_age=600,
        same_site="lax",
        https_only=resolved_settings.secure_cookies,
        path="/",
    )

    @application.exception_handler(AuthError)
    async def handle_auth_error(_: Request, error: AuthError) -> JSONResponse:
        detail = ErrorDetail(
            code=error.code,
            message=error.message,
            retry_after_seconds=error.retry_after_seconds,
        )
        headers = None
        if error.retry_after_seconds is not None:
            headers = {"Retry-After": str(error.retry_after_seconds)}
        return JSONResponse(
            status_code=error.status_code,
            content={"detail": detail.model_dump(exclude_none=True)},
            headers=headers,
        )

    application.include_router(auth_router)
    application.include_router(health_router)
    return application


app = create_app()
