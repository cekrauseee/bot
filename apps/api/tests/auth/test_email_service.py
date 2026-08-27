import logging

import pytest
import resend

from my_bot_api.services.email import EmailDeliveryError, ResendOtpEmailSender


@pytest.mark.asyncio
async def test_resend_sends_locally_rendered_react_email(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def send_async(params: dict[str, object], options: dict[str, str]) -> object:
        captured["params"] = params
        captured["options"] = options
        return {"id": "email_123"}

    monkeypatch.setattr(resend.Emails, "send_async", send_async)
    sender = ResendOtpEmailSender(
        api_key="re_test",
        sender="myBot <mybot@cekrause.eu>",
    )

    await sender.send_otp(
        to="person@example.com",
        code="482913",
        challenge_id="challenge_123",
        expires_in_seconds=600,
    )

    params = captured["params"]
    assert isinstance(params, dict)
    assert params["subject"] == "Your myBot sign-in code"
    assert params["from"] == "myBot <mybot@cekrause.eu>"
    assert params["to"] == ["person@example.com"]
    assert "template" not in params
    for body in (params["html"], params["text"]):
        assert isinstance(body, str)
        assert "482913" in body
        assert "10" in body
        assert "__MYBOT_" not in body
    assert captured["options"] == {"idempotency_key": "otp-challenge_123"}


@pytest.mark.asyncio
async def test_resend_failure_logs_safe_provider_metadata(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def fail(_: dict[str, object], __: dict[str, str]) -> object:
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(resend.Emails, "send_async", fail)
    caplog.set_level(logging.ERROR, logger="my_bot_api.services.email")
    sender = ResendOtpEmailSender(
        api_key="re_test",
        sender="myBot <mybot@cekrause.eu>",
    )

    with pytest.raises(EmailDeliveryError):
        await sender.send_otp(
            to="private@example.com",
            code="482913",
            challenge_id="challenge_private",
            expires_in_seconds=600,
        )

    assert "resend_otp_delivery_failed" in caplog.text
    assert "error_type=RuntimeError" in caplog.text
    assert "private@example.com" not in caplog.text
    assert "482913" not in caplog.text
    assert "re_test" not in caplog.text
