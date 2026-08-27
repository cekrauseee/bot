import json
import logging
import math
from dataclasses import dataclass
from functools import lru_cache
from importlib.resources import files
from typing import Protocol

import resend

logger = logging.getLogger(__name__)

_OTP_CODE_TOKEN = "__MYBOT_OTP_CODE__"
_EXPIRATION_MINUTES_TOKEN = "__MYBOT_EXPIRATION_MINUTES__"


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


@dataclass(frozen=True, slots=True)
class RenderedEmailTemplate:
    subject: str
    html: str
    text: str

    def render(self, *, code: str, expiration_minutes: int) -> tuple[str, str]:
        values = {
            _OTP_CODE_TOKEN: code,
            _EXPIRATION_MINUTES_TOKEN: str(expiration_minutes),
        }
        html = self.html
        text = self.text
        for token, value in values.items():
            html = html.replace(token, value)
            text = text.replace(token, value)
        return html, text


@lru_cache
def load_login_otp_template() -> RenderedEmailTemplate:
    package = files("my_bot_api.templates")
    metadata = json.loads(package.joinpath("login-otp.json").read_text(encoding="utf-8"))
    template = RenderedEmailTemplate(
        subject=metadata["subject"],
        html=package.joinpath("login-otp.html").read_text(encoding="utf-8"),
        text=package.joinpath("login-otp.txt").read_text(encoding="utf-8"),
    )
    for token in (_OTP_CODE_TOKEN, _EXPIRATION_MINUTES_TOKEN):
        if token not in template.html or token not in template.text:
            raise RuntimeError(f"Generated login OTP template is missing token {token}")
    return template


class ResendOtpEmailSender:
    def __init__(
        self,
        *,
        api_key: str,
        sender: str,
        template: RenderedEmailTemplate | None = None,
    ) -> None:
        self._api_key = api_key
        self._sender = sender
        self._template = template or load_login_otp_template()

    async def send_otp(
        self,
        *,
        to: str,
        code: str,
        challenge_id: str,
        expires_in_seconds: int,
    ) -> None:
        if not self._api_key:
            logger.error("resend_otp_delivery_failed reason=missing_api_key")
            raise EmailDeliveryError("Resend is not configured")

        html, text = self._template.render(
            code=code,
            expiration_minutes=math.ceil(expires_in_seconds / 60),
        )
        resend.api_key = self._api_key
        try:
            await resend.Emails.send_async(
                {
                    "from": self._sender,
                    "to": [to],
                    "subject": self._template.subject,
                    "html": html,
                    "text": text,
                    "tags": [{"name": "category", "value": "authentication"}],
                },
                {"idempotency_key": f"otp-{challenge_id}"},
            )
        except Exception as error:
            logger.error(
                "resend_otp_delivery_failed error_type=%s provider_code=%s "
                "status_code=%s request_id=%s",
                type(error).__name__,
                getattr(error, "code", None),
                getattr(error, "status_code", None),
                getattr(error, "request_id", None),
            )
            raise EmailDeliveryError("Resend did not accept the OTP email") from error
