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
        "resend_api_key": "re_live_0123456789abcdefghijklmnopqrstuvwxyz",
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


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("session_secret", "replace-with-a-unique-secret-at-least-32-characters"),
        ("otp_pepper", "replace-with-a-different-secret-at-least-32-characters"),
        ("rate_limit_pepper", "replace-with-another-secret-at-least-32-characters"),
        ("google_client_id", "example.apps.googleusercontent.com"),
        ("google_client_secret", "replace-with-google-client-secret"),
        ("resend_api_key", "re_example"),
    ],
)
def test_production_rejects_example_credentials(field: str, value: str) -> None:
    with pytest.raises(ValidationError):
        Settings(**production_settings(**{field: value}))


def test_trusted_proxy_hosts_accepts_comma_separated_ips() -> None:
    settings = Settings(trusted_proxy_hosts="10.0.0.1, 10.0.0.2")

    assert settings.trusted_proxy_hosts == ("10.0.0.1", "10.0.0.2")


def test_trusted_proxy_hosts_rejects_network_ranges() -> None:
    with pytest.raises(ValidationError, match="individual IP"):
        Settings(trusted_proxy_hosts="10.0.0.0/24")
