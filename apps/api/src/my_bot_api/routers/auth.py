import ipaddress
import logging
from collections.abc import Collection
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse

from my_bot_api.auth.errors import AuthError
from my_bot_api.auth.schemas import (
    AuthResponse,
    OtpChallengeResponse,
    OtpRequest,
    OtpVerifyRequest,
    UserResponse,
)
from my_bot_api.container import ApplicationContainer
from my_bot_api.database.repository import AuthRepository, normalize_email

router = APIRouter(prefix="/auth", tags=["authentication"])
logger = logging.getLogger(__name__)


def get_container(request: Request) -> ApplicationContainer:
    return request.app.state.container


Container = Annotated[ApplicationContainer, Depends(get_container)]


def require_browser_origin(
    request: Request,
    container: Container,
) -> None:
    origin = request.headers.get("origin")
    if origin == container.settings.web_origin:
        return
    if container.settings.environment != "production" and origin is None:
        return
    raise AuthError(
        code="invalid_origin",
        message="This request did not come from an allowed origin.",
        status_code=403,
    )


def client_ip(request: Request, trusted_proxy_hosts: Collection[str] = ()) -> str:
    peer = request.client.host if request.client is not None else "unknown"
    if peer not in trusted_proxy_hosts:
        return peer

    # The deployment contract is one trusted hop: accept XFF only when it is
    # exactly one valid address. This prevents an untrusted caller from
    # smuggling a second address into a proxy chain.
    forwarded_values = request.headers.getlist("x-forwarded-for")
    if len(forwarded_values) != 1:
        return peer
    forwarded = forwarded_values[0].strip()
    if not forwarded or "," in forwarded:
        return peer
    try:
        ipaddress.ip_address(forwarded)
    except ValueError:
        return peer
    return forwarded


def user_response(user: object) -> UserResponse:
    return UserResponse.model_validate(user)


@router.post(
    "/otp/request",
    response_model=OtpChallengeResponse,
    status_code=202,
    dependencies=[Depends(require_browser_origin)],
)
async def request_otp(
    payload: OtpRequest,
    request: Request,
    container: Container,
) -> OtpChallengeResponse:
    challenge = await container.otp.issue(
        email=normalize_email(str(payload.email)),
        ip_address=client_ip(request, container.settings.trusted_proxy_hosts),
    )
    return OtpChallengeResponse(
        challenge_id=challenge.challenge_id,
        expires_in_seconds=challenge.expires_in_seconds,
        resend_after_seconds=challenge.resend_after_seconds,
    )


@router.post(
    "/otp/verify",
    response_model=AuthResponse,
    dependencies=[Depends(require_browser_origin)],
)
async def verify_otp(
    payload: OtpVerifyRequest,
    request: Request,
    response: Response,
    container: Container,
) -> AuthResponse:
    reservation = await container.otp.reserve(
        challenge_id=payload.challenge_id,
        code=payload.code,
        ip_address=client_ip(request, container.settings.trusted_proxy_hosts),
    )
    try:
        async with container.database.transaction() as database_session:
            repository = AuthRepository(database_session)
            user = await repository.get_or_create_email_user(
                reservation.email,
                email_verified_at=datetime.now(UTC),
            )
            issued_session = await container.sessions.issue(repository, user)
    except Exception:
        await container.otp.release(reservation)
        raise
    try:
        if not await container.otp.finalize(reservation):
            raise AuthError(
                code="invalid_code",
                message="That code is invalid or has expired. Request a new code.",
                status_code=400,
            )
    except Exception:
        # A transient Redis failure must not leave a successful DB write with
        # an indefinitely reserved challenge.
        await container.otp.release(reservation)
        raise
    container.sessions.set_cookie(response, issued_session.token)
    return AuthResponse(user=user_response(user))


@router.get("/google/start")
async def google_start(
    request: Request,
    container: Container,
) -> RedirectResponse:
    return await container.google_oauth.start(request)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    container: Container,
) -> RedirectResponse:
    try:
        profile = await container.google_oauth.callback(request)
        async with container.database.transaction() as database_session:
            repository = AuthRepository(database_session)
            user = await repository.get_or_create_google_user(
                provider_subject=profile.subject,
                email=profile.email,
                email_verified=True,
                first_name=profile.first_name,
                last_name=profile.last_name,
                avatar_url=profile.avatar_url,
                provider_email=profile.email,
            )
            issued_session = await container.sessions.issue(repository, user)
    except AuthError as error:
        logger.warning("google_auth_rejected", extra={"auth_error_code": error.code})
        return RedirectResponse(
            f"{container.settings.web_origin}/login?error=google",
            status_code=303,
        )
    except Exception:
        logger.exception("google_auth_callback_failed")
        return RedirectResponse(
            f"{container.settings.web_origin}/login?error=google",
            status_code=303,
        )

    response = RedirectResponse(f"{container.settings.web_origin}/", status_code=303)
    container.sessions.set_cookie(response, issued_session.token)
    return response


@router.get("/session", response_model=UserResponse)
async def get_session(
    request: Request,
    container: Container,
) -> UserResponse:
    token = request.cookies.get(container.settings.session_cookie_name)
    async with container.database.transaction() as database_session:
        repository = AuthRepository(database_session)
        session = await container.sessions.resolve(repository, token)
        if session is None:
            raise AuthError(
                code="unauthorized",
                message="Sign in to continue.",
                status_code=401,
            )
        await repository.touch_session(session.id)
        return user_response(session.user)


@router.post(
    "/sign-out",
    status_code=204,
    dependencies=[Depends(require_browser_origin)],
)
async def sign_out(
    request: Request,
    response: Response,
    container: Container,
) -> Response:
    token = request.cookies.get(container.settings.session_cookie_name)
    if token:
        async with container.database.transaction() as database_session:
            repository = AuthRepository(database_session)
            session = await container.sessions.resolve(repository, token)
            if session is not None:
                await repository.revoke_session(session.id)
    container.sessions.clear_cookie(response)
    response.status_code = 204
    return response
