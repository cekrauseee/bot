import asyncio
import os
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from redis.asyncio import Redis
from sqlalchemy import delete, func, select

from my_bot_api.config import Settings
from my_bot_api.container import create_container
from my_bot_api.database import Database
from my_bot_api.database.repository import AuthRepository
from my_bot_api.main import create_app
from my_bot_api.models import OAuthIdentity, Session, User
from my_bot_api.services.email import OtpEmailSender

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_INTEGRATION_TESTS") != "1",
        reason="set RUN_INTEGRATION_TESTS=1 after starting the dedicated services",
    ),
]


class RecordingEmailSender(OtpEmailSender):
    def __init__(self) -> None:
        self.code = ""

    async def send_otp(
        self,
        *,
        to: str,
        code: str,
        challenge_id: str,
        expires_in_seconds: int,
    ) -> None:
        del to, challenge_id, expires_in_seconds
        self.code = code


def integration_settings() -> Settings:
    return Settings(
        environment="test",
        database_url="postgresql+psycopg://mybot:mybot@localhost:5434/mybot",
        redis_url="redis://localhost:6380/0",
        session_secret="integration-session-secret-at-least-32-characters",
        otp_pepper="integration-otp-pepper-at-least-32-characters",
        rate_limit_pepper="integration-rate-limit-pepper-at-least-32-characters",
    )


async def reset_auth_state(settings: Settings) -> None:
    database = Database(settings.database_url)
    async with database.transaction() as session:
        await session.execute(delete(Session))
        await session.execute(delete(OAuthIdentity))
        await session.execute(delete(User))
    await database.dispose()

    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    await redis.flushdb()
    await redis.aclose()


def test_email_otp_session_and_sign_out_flow() -> None:
    settings = integration_settings()
    asyncio.run(reset_auth_state(settings))
    sender = RecordingEmailSender()
    container = create_container(settings, email_sender=sender)
    app = create_app(settings, container=container)

    with TestClient(app) as client:
        issued = client.post("/auth/otp/request", json={"email": "Person@Example.com"})
        assert issued.status_code == 202
        challenge_id = issued.json()["challenge_id"]
        assert sender.code.isdecimal()

        verified = client.post(
            "/auth/otp/verify",
            json={"challenge_id": challenge_id, "code": sender.code},
        )
        assert verified.status_code == 200
        assert verified.json()["user"]["email"] == "person@example.com"
        assert verified.cookies.get("mybot_session")

        session = client.get("/auth/session")
        assert session.status_code == 200
        assert session.json()["email"] == "person@example.com"

        signed_out = client.post("/auth/sign-out")
        assert signed_out.status_code == 204
        assert client.get("/auth/session").status_code == 401


def test_google_linking_reuses_verified_email_user() -> None:
    settings = integration_settings()
    asyncio.run(reset_auth_state(settings))

    async def scenario() -> None:
        database = Database(settings.database_url)
        async with database.transaction() as session:
            repository = AuthRepository(session)
            otp_user = await repository.get_or_create_email_user(
                "person@example.com",
                email_verified_at=datetime.now(UTC),
            )
            google_user = await repository.get_or_create_google_user(
                provider_subject="google-subject-123",
                email="person@example.com",
                email_verified=True,
                first_name="Person",
                last_name="Example",
                avatar_url="https://example.com/avatar.png",
                provider_email="person@example.com",
            )
            assert google_user.id == otp_user.id

        async with database.session() as session:
            user_count = await session.scalar(select(func.count()).select_from(User))
            identity_count = await session.scalar(
                select(func.count()).select_from(OAuthIdentity)
            )
            assert user_count == 1
            assert identity_count == 1
        await database.dispose()

    asyncio.run(scenario())
