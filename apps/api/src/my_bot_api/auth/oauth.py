from dataclasses import dataclass
from typing import Any

from authlib.integrations.base_client import OAuthError
from authlib.integrations.starlette_client import OAuth
from redis.asyncio import Redis
from starlette.requests import Request
from starlette.responses import RedirectResponse

from my_bot_api.auth.errors import AuthError
from my_bot_api.config import Settings


class RedisOAuthCache:
    def __init__(self, redis: Redis, *, prefix: str = "auth:oauth:state:") -> None:
        self._redis = redis
        self._prefix = prefix

    async def get(self, key: str) -> str | None:
        return await self._redis.get(f"{self._prefix}{key}")

    async def set(self, key: str, value: str, expires_in: int) -> None:
        await self._redis.set(f"{self._prefix}{key}", value, ex=expires_in)

    async def delete(self, key: str) -> None:
        await self._redis.delete(f"{self._prefix}{key}")


@dataclass(frozen=True, slots=True)
class GoogleProfile:
    subject: str
    email: str
    first_name: str | None
    last_name: str | None
    avatar_url: str | None


class GoogleOAuthService:
    def __init__(self, redis: Redis, settings: Settings) -> None:
        self._settings = settings
        self._oauth = OAuth(cache=RedisOAuthCache(redis))
        self._google = self._oauth.register(
            "google",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret.get_secret_value(),
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={
                "scope": "openid email profile",
                "code_challenge_method": "S256",
            },
        )

    @property
    def configured(self) -> bool:
        return bool(
            self._settings.google_client_id
            and self._settings.google_client_secret.get_secret_value()
        )

    async def start(self, request: Request) -> RedirectResponse:
        if not self.configured:
            raise AuthError(
                code="google_auth_unavailable",
                message="Google sign-in is not configured.",
                status_code=503,
            )
        return await self._google.authorize_redirect(
            request,
            str(self._settings.google_redirect_uri),
            prompt="select_account",
        )

    async def callback(self, request: Request) -> GoogleProfile:
        if not self.configured:
            raise AuthError(
                code="google_auth_unavailable",
                message="Google sign-in is not configured.",
                status_code=503,
            )
        try:
            token = await self._google.authorize_access_token(
                request,
                claims_options={
                    "email": {"essential": True},
                    "email_verified": {"essential": True},
                    "sub": {"essential": True},
                },
            )
        except (OAuthError, RuntimeError, ValueError) as error:
            request.session.clear()
            raise AuthError(
                code="google_auth_failed",
                message="Unable to sign in with Google. Try again.",
                status_code=400,
            ) from error

        userinfo: dict[str, Any] = token.get("userinfo") or {}
        if userinfo.get("email_verified") is not True:
            raise AuthError(
                code="google_email_unverified",
                message="Google did not provide a verified email address.",
                status_code=400,
            )
        subject = userinfo.get("sub")
        email = userinfo.get("email")
        if not isinstance(subject, str) or not subject or not isinstance(email, str) or not email:
            raise AuthError(
                code="google_profile_incomplete",
                message="Google did not provide the required profile information.",
                status_code=400,
            )

        return GoogleProfile(
            subject=subject,
            email=email,
            first_name=self._optional_string(userinfo.get("given_name")),
            last_name=self._optional_string(userinfo.get("family_name")),
            avatar_url=self._optional_string(userinfo.get("picture")),
        )

    @staticmethod
    def _optional_string(value: object) -> str | None:
        return value if isinstance(value, str) and value else None
