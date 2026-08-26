import math
from typing import Protocol

import resend


class EmailDeliveryError(RuntimeError):
    """Raised when the transactional provider cannot accept an email."""


class OtpEmailSender(Protocol):
    async def send_otp(
        self,
        *,
        to: str,
        code: str,
        challenge_id: str,
        expires_in_seconds: int,
    ) -> None: ...


class ResendOtpEmailSender:
    def __init__(self, *, api_key: str, sender: str, template_id: str) -> None:
        self._api_key = api_key
        self._sender = sender
        self._template_id = template_id

    async def send_otp(
        self,
        *,
        to: str,
        code: str,
        challenge_id: str,
        expires_in_seconds: int,
    ) -> None:
        if not self._api_key:
            raise EmailDeliveryError("Resend is not configured")

        resend.api_key = self._api_key
        try:
            await resend.Emails.send_async(
                {
                    "from": self._sender,
                    "to": [to],
                    "template": {
                        "id": self._template_id,
                        "variables": {
                            "OTP_CODE": code,
                            "EXPIRATION_MINUTES": math.ceil(expires_in_seconds / 60),
                        },
                    },
                    "tags": [{"name": "category", "value": "authentication"}],
                },
                {"idempotency_key": f"otp-{challenge_id}"},
            )
        except Exception as error:
            raise EmailDeliveryError("Resend did not accept the OTP email") from error
