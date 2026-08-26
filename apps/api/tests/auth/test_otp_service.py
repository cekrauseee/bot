import asyncio

import fakeredis.aioredis
import pytest

from my_bot_api.auth.errors import AuthError
from my_bot_api.auth.otp import OtpService
from my_bot_api.config import Settings
from my_bot_api.services.email import EmailDeliveryError


class RecordingEmailSender:
    def __init__(self, *, fail_once: bool = False) -> None:
        self.fail_once = fail_once
        self.messages: list[dict[str, str | int]] = []

    async def send_otp(
        self,
        *,
        to: str,
        code: str,
        challenge_id: str,
        expires_in_seconds: int,
    ) -> None:
        if self.fail_once:
            self.fail_once = False
            raise EmailDeliveryError("provider unavailable")
        self.messages.append(
            {
                "to": to,
                "code": code,
                "challenge_id": challenge_id,
                "expires_in_seconds": expires_in_seconds,
            }
        )


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        otp_pepper="test-otp-pepper-with-at-least-32-characters",
        rate_limit_pepper="test-rate-pepper-with-at-least-32-characters",
        otp_ttl_seconds=600,
        otp_resend_cooldown_seconds=60,
        otp_max_attempts=5,
        otp_email_requests_per_window=5,
        otp_ip_requests_per_window=20,
        otp_verify_attempts_per_ip_window=50,
        otp_rate_limit_window_seconds=900,
    )


@pytest.fixture
def redis() -> fakeredis.aioredis.FakeRedis:
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


@pytest.mark.asyncio
async def test_otp_is_single_use_under_concurrent_verification(
    settings: Settings,
    redis: fakeredis.aioredis.FakeRedis,
) -> None:
    sender = RecordingEmailSender()
    service = OtpService(redis, sender, settings)
    issued = await service.issue(email="person@example.com", ip_address="192.0.2.1")
    code = str(sender.messages[0]["code"])

    results = await asyncio.gather(
        service.verify(
            challenge_id=issued.challenge_id,
            code=code,
            ip_address="192.0.2.1",
        ),
        service.verify(
            challenge_id=issued.challenge_id,
            code=code,
            ip_address="192.0.2.2",
        ),
        return_exceptions=True,
    )

    assert results.count("person@example.com") == 1
    failures = [result for result in results if isinstance(result, AuthError)]
    assert len(failures) == 1
    assert failures[0].code == "invalid_code"


@pytest.mark.asyncio
async def test_fifth_incorrect_attempt_invalidates_challenge(
    settings: Settings,
    redis: fakeredis.aioredis.FakeRedis,
) -> None:
    sender = RecordingEmailSender()
    service = OtpService(redis, sender, settings)
    issued = await service.issue(email="person@example.com", ip_address="192.0.2.1")

    for _ in range(4):
        with pytest.raises(AuthError, match="incorrect") as error:
            await service.verify(
                challenge_id=issued.challenge_id,
                code="000000",
                ip_address="192.0.2.1",
            )
        assert error.value.code == "invalid_code"

    with pytest.raises(AuthError) as exhausted:
        await service.verify(
            challenge_id=issued.challenge_id,
            code="000000",
            ip_address="192.0.2.1",
        )
    assert exhausted.value.code == "code_attempts_exhausted"

    with pytest.raises(AuthError) as consumed:
        await service.verify(
            challenge_id=issued.challenge_id,
            code=str(sender.messages[0]["code"]),
            ip_address="192.0.2.1",
        )
    assert consumed.value.code == "invalid_code"


@pytest.mark.asyncio
async def test_resend_cooldown_and_new_code_invalidate_previous_challenge(
    settings: Settings,
    redis: fakeredis.aioredis.FakeRedis,
) -> None:
    sender = RecordingEmailSender()
    service = OtpService(redis, sender, settings)
    first = await service.issue(email="person@example.com", ip_address="192.0.2.1")

    with pytest.raises(AuthError) as cooldown:
        await service.issue(email="person@example.com", ip_address="192.0.2.1")
    assert cooldown.value.code == "rate_limited"
    assert cooldown.value.retry_after_seconds == 60

    cooldown_keys = [key async for key in redis.scan_iter("auth:otp:cooldown:*")]
    await redis.delete(*cooldown_keys)
    second = await service.issue(email="person@example.com", ip_address="192.0.2.1")

    with pytest.raises(AuthError) as old_code:
        await service.verify(
            challenge_id=first.challenge_id,
            code=str(sender.messages[0]["code"]),
            ip_address="192.0.2.1",
        )
    assert old_code.value.code == "invalid_code"
    assert (
        await service.verify(
            challenge_id=second.challenge_id,
            code=str(sender.messages[1]["code"]),
            ip_address="192.0.2.1",
        )
        == "person@example.com"
    )


@pytest.mark.asyncio
async def test_delivery_failure_rolls_back_challenge_and_cooldown(
    settings: Settings,
    redis: fakeredis.aioredis.FakeRedis,
) -> None:
    sender = RecordingEmailSender(fail_once=True)
    service = OtpService(redis, sender, settings)

    with pytest.raises(AuthError) as failure:
        await service.issue(email="person@example.com", ip_address="192.0.2.1")
    assert failure.value.code == "email_delivery_unavailable"

    issued = await service.issue(email="person@example.com", ip_address="192.0.2.1")
    assert issued.challenge_id == sender.messages[0]["challenge_id"]
