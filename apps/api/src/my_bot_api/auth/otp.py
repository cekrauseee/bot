from dataclasses import dataclass

from redis.asyncio import Redis

from my_bot_api.auth.errors import AuthError, invalid_code_error
from my_bot_api.auth.security import (
    generate_opaque_token,
    generate_otp_code,
    hash_otp,
    keyed_identifier,
)
from my_bot_api.config import Settings
from my_bot_api.services.email import EmailDeliveryError, OtpEmailSender

_FIXED_WINDOW_SCRIPT = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
"""

_ROLLBACK_ISSUE_SCRIPT = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
end
if redis.call('GET', KEYS[2]) == ARGV[1] then
  redis.call('DEL', KEYS[2])
end
redis.call('DEL', KEYS[3])
return 1
"""

_VERIFY_SCRIPT = """
if redis.call('EXISTS', KEYS[1]) == 0 then
  return {'missing'}
end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  redis.call('DEL', KEYS[1])
  return {'missing'}
end
local expected = redis.call('HGET', KEYS[1], 'code_hash')
if expected == ARGV[2] then
  local email = redis.call('HGET', KEYS[1], 'email')
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  return {'verified', email}
end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts >= tonumber(ARGV[3]) then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  return {'locked'}
end
return {'invalid', tostring(attempts)}
"""


@dataclass(frozen=True, slots=True)
class IssuedOtp:
    challenge_id: str
    expires_in_seconds: int
    resend_after_seconds: int


class OtpService:
    def __init__(self, redis: Redis, email_sender: OtpEmailSender, settings: Settings) -> None:
        self._redis = redis
        self._email_sender = email_sender
        self._settings = settings

    def _email_key(self, email: str) -> str:
        return keyed_identifier(
            email,
            pepper=self._settings.rate_limit_pepper.get_secret_value(),
        )

    def _ip_key(self, ip_address: str) -> str:
        return keyed_identifier(
            ip_address,
            pepper=self._settings.rate_limit_pepper.get_secret_value(),
        )

    async def _take_limit(self, key: str, maximum: int) -> None:
        current, ttl = await self._redis.eval(
            _FIXED_WINDOW_SCRIPT,
            1,
            key,
            self._settings.otp_rate_limit_window_seconds,
        )
        if int(current) <= maximum:
            return
        raise AuthError(
            code="rate_limited",
            message="Too many attempts. Wait before trying again.",
            status_code=429,
            retry_after_seconds=max(1, int(ttl)),
        )

    async def issue(self, *, email: str, ip_address: str) -> IssuedOtp:
        email_key = self._email_key(email)
        challenge_id = generate_opaque_token()
        cooldown_key = f"auth:otp:cooldown:{email_key}"
        cooldown_acquired = await self._redis.set(
            cooldown_key,
            challenge_id,
            ex=self._settings.otp_resend_cooldown_seconds,
            nx=True,
        )
        if not cooldown_acquired:
            ttl = await self._redis.ttl(cooldown_key)
            raise AuthError(
                code="rate_limited",
                message="Wait before requesting another code.",
                status_code=429,
                retry_after_seconds=max(1, ttl),
            )

        try:
            await self._take_limit(
                f"auth:otp:request:ip:{self._ip_key(ip_address)}",
                self._settings.otp_ip_requests_per_window,
            )
            await self._take_limit(
                f"auth:otp:request:email:{email_key}",
                self._settings.otp_email_requests_per_window,
            )
        except AuthError:
            await self._delete_if_value(cooldown_key, challenge_id)
            raise

        code = generate_otp_code()
        code_hash = hash_otp(
            challenge_id=challenge_id,
            code=code,
            pepper=self._settings.otp_pepper.get_secret_value(),
        )
        challenge_key = f"auth:otp:challenge:{challenge_id}"
        active_key = f"auth:otp:active:{email_key}"
        previous_challenge = await self._redis.get(active_key)

        async with self._redis.pipeline(transaction=True) as pipeline:
            if previous_challenge:
                pipeline.delete(f"auth:otp:challenge:{previous_challenge}")
            pipeline.hset(
                challenge_key,
                mapping={"code_hash": code_hash, "email": email, "attempts": "0"},
            )
            pipeline.expire(challenge_key, self._settings.otp_ttl_seconds)
            pipeline.set(active_key, challenge_id, ex=self._settings.otp_ttl_seconds)
            await pipeline.execute()

        try:
            await self._email_sender.send_otp(
                to=email,
                code=code,
                challenge_id=challenge_id,
                expires_in_seconds=self._settings.otp_ttl_seconds,
            )
        except EmailDeliveryError as error:
            await self._redis.eval(
                _ROLLBACK_ISSUE_SCRIPT,
                3,
                cooldown_key,
                active_key,
                challenge_key,
                challenge_id,
            )
            raise AuthError(
                code="email_delivery_unavailable",
                message="Unable to send a code right now. Try again shortly.",
                status_code=503,
            ) from error

        return IssuedOtp(
            challenge_id=challenge_id,
            expires_in_seconds=self._settings.otp_ttl_seconds,
            resend_after_seconds=self._settings.otp_resend_cooldown_seconds,
        )

    async def verify(self, *, challenge_id: str, code: str, ip_address: str) -> str:
        await self._take_limit(
            f"auth:otp:verify:ip:{self._ip_key(ip_address)}",
            self._settings.otp_verify_attempts_per_ip_window,
        )
        candidate_hash = hash_otp(
            challenge_id=challenge_id,
            code=code,
            pepper=self._settings.otp_pepper.get_secret_value(),
        )
        challenge_key = f"auth:otp:challenge:{challenge_id}"
        email = await self._redis.hget(challenge_key, "email")
        if not email:
            raise invalid_code_error()
        active_key = f"auth:otp:active:{self._email_key(email)}"
        result = await self._redis.eval(
            _VERIFY_SCRIPT,
            2,
            challenge_key,
            active_key,
            challenge_id,
            candidate_hash,
            self._settings.otp_max_attempts,
        )
        status = result[0]
        if status == "verified":
            return result[1]
        if status == "locked":
            raise AuthError(
                code="code_attempts_exhausted",
                message="Too many incorrect attempts. Request a new code.",
                status_code=429,
                retry_after_seconds=self._settings.otp_resend_cooldown_seconds,
            )
        raise invalid_code_error()

    async def close(self) -> None:
        await self._redis.aclose()

    async def _delete_if_value(self, key: str, value: str) -> None:
        await self._redis.eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then "
            "return redis.call('DEL', KEYS[1]) end return 0",
            1,
            key,
            value,
        )
