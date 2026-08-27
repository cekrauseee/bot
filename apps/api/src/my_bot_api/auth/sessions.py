from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Response

from my_bot_api.auth.security import generate_opaque_token, hash_session_token
from my_bot_api.config import Settings
from my_bot_api.database.repository import AuthRepository
from my_bot_api.models import Session, User


@dataclass(frozen=True, slots=True)
class IssuedSession:
    token: str
    session: Session


class SessionManager:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def issue(self, repository: AuthRepository, user: User) -> IssuedSession:
        token = generate_opaque_token()
        session = await repository.create_session(
            user,
            hash_session_token(token),
            datetime.now(UTC) + timedelta(seconds=self._settings.session_ttl_seconds),
        )
        return IssuedSession(token=token, session=session)

    async def resolve(self, repository: AuthRepository, token: str | None) -> Session | None:
        if not token:
            return None
        return await repository.resolve_active_session(hash_session_token(token))

    def set_cookie(self, response: Response, token: str) -> None:
        response.set_cookie(
            key=self._settings.session_cookie_name,
            value=token,
            max_age=self._settings.session_ttl_seconds,
            httponly=True,
            secure=self._settings.secure_cookies,
            samesite="lax",
            path="/",
        )

    def clear_cookie(self, response: Response) -> None:
        response.delete_cookie(
            key=self._settings.session_cookie_name,
            httponly=True,
            secure=self._settings.secure_cookies,
            samesite="lax",
            path="/",
        )
