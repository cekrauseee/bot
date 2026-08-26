import pytest
from pydantic import ValidationError

from my_bot_api.config import Settings


def production_settings(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "environment": "production",
        "web_base_url": "https://app.example.com",
        "api_base_url": "https://api.example.com",
        "google_redirect_uri": "https://api.example.com/auth/google/callback",
        "google_client_id": "client.apps.googleusercontent.com",
        "google_client_secret": "google-client-secret",
        "resend_api_key": "re_example",
        "session_secret": "session-secret-that-is-unique-and-long-enough",
        "otp_pepper": "otp-pepper-that-is-unique-and-long-enough",
        "rate_limit_pepper": "rate-pepper-that-is-unique-and-long-enough",
    }
    values.update(overrides)
    return values


def test_production_requires_distinct_authentication_secrets() -> None:
    repeated = "one-repeated-secret-that-is-at-least-32-characters"

    with pytest.raises(ValidationError, match="different values"):
        Settings(
            **production_settings(
                session_secret=repeated,
                otp_pepper=repeated,
                rate_limit_pepper=repeated,
            )
        )


def test_production_google_callback_must_use_api_host() -> None:
    with pytest.raises(ValidationError, match="API host"):
        Settings(
            **production_settings(
                google_redirect_uri="https://other.example.com/auth/google/callback"
            )
        )


def test_production_cookie_uses_host_prefix() -> None:
    settings = Settings(**production_settings())

    assert settings.session_cookie_name == "__Host-mybot_session"
    assert settings.secure_cookies is True
