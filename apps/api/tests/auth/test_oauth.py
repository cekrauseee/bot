from typing import Any

import fakeredis.aioredis
import pytest
from authlib.integrations.base_client import OAuthError
from starlette.requests import Request

from my_bot_api.auth.errors import AuthError
from my_bot_api.auth.oauth import GOOGLE_ISSUER, GoogleOAuthService
from my_bot_api.config import Settings


class CapturingGoogleClient:
    def __init__(self) -> None:
        self.claims_options: dict[str, Any] | None = None

    async def authorize_access_token(self, _: Request, **kwargs: Any) -> None:
        self.claims_options = kwargs["claims_options"]
        raise OAuthError(description="invalid token")


@pytest.mark.asyncio
async def test_google_callback_requires_google_issuer_and_configured_audience() -> None:
    settings = Settings(
        environment="test",
        google_client_id="client.apps.googleusercontent.com",
        google_client_secret="google-client-secret",
    )
    service = GoogleOAuthService(
        fakeredis.aioredis.FakeRedis(decode_responses=True), settings
    )
    client = CapturingGoogleClient()
    service._google = client  # type: ignore[assignment]
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/auth/google/callback",
            "headers": [],
            "query_string": b"code=code&state=state",
            "session": {},
        }
    )

    with pytest.raises(AuthError, match="Unable to sign in"):
        await service.callback(request)

    assert client.claims_options == {
        "iss": {"essential": True, "values": [GOOGLE_ISSUER]},
        "aud": {"essential": True, "values": [settings.google_client_id]},
        "email": {"essential": True},
        "email_verified": {"essential": True},
        "sub": {"essential": True},
    }
