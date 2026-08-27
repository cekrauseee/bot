from dataclasses import dataclass

from redis.asyncio import Redis

from my_bot_api.auth.oauth import GoogleOAuthService
from my_bot_api.auth.otp import OtpService
from my_bot_api.auth.sessions import SessionManager
from my_bot_api.config import Settings
from my_bot_api.database import Database
from my_bot_api.services.email import OtpEmailSender, ResendOtpEmailSender


@dataclass(slots=True)
class ApplicationContainer:
    settings: Settings
    database: Database
    redis: Redis
    otp: OtpService
    google_oauth: GoogleOAuthService
    sessions: SessionManager

    async def close(self) -> None:
        await self.otp.close()
        await self.database.dispose()


def create_container(
    settings: Settings,
    *,
    redis: Redis | None = None,
    email_sender: OtpEmailSender | None = None,
) -> ApplicationContainer:
    redis_client = redis or Redis.from_url(settings.redis_url, decode_responses=True)
    sender = email_sender or ResendOtpEmailSender(
        api_key=settings.resend_api_key.get_secret_value(),
        sender=settings.resend_from,
    )
    return ApplicationContainer(
        settings=settings,
        database=Database(settings.database_url),
        redis=redis_client,
        otp=OtpService(redis_client, sender, settings),
        google_oauth=GoogleOAuthService(redis_client, settings),
        sessions=SessionManager(settings),
    )
