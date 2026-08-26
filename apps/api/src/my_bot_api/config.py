from functools import lru_cache
from typing import Annotated, Literal

from pydantic import AnyHttpUrl, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://mybot:mybot@localhost:5434/mybot"
    redis_url: str = "redis://localhost:6380/0"
    web_base_url: AnyHttpUrl = AnyHttpUrl("http://localhost:5173")
    api_base_url: AnyHttpUrl = AnyHttpUrl("http://localhost:8000")

    session_secret: SecretStr = SecretStr(
        "development-session-secret-change-before-production"
    )
    otp_pepper: SecretStr = SecretStr("development-otp-pepper-change-before-production")
    rate_limit_pepper: SecretStr = SecretStr(
        "development-rate-limit-pepper-change-before-production"
    )
    session_ttl_seconds: int = 60 * 60 * 24 * 30

    otp_ttl_seconds: int = 60 * 10
    otp_resend_cooldown_seconds: int = 60
    otp_max_attempts: int = 5
    otp_email_requests_per_window: int = 5
    otp_ip_requests_per_window: int = 20
    otp_verify_attempts_per_ip_window: int = 50
    otp_rate_limit_window_seconds: int = 60 * 15

    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    google_redirect_uri: AnyHttpUrl = AnyHttpUrl(
        "http://localhost:8000/auth/google/callback"
    )
    trusted_proxy_hosts: Annotated[tuple[str, ...], NoDecode] = ()

    resend_api_key: SecretStr = SecretStr("")
    resend_from: str = "myBot <hello@mybot.cekrause.eu>"
    resend_otp_template_id: str = "mybot-login-otp"

    @field_validator("trusted_proxy_hosts", mode="before")
    @classmethod
    def parse_trusted_proxy_hosts(cls, value: object) -> tuple[str, ...]:
        if value is None or value == "":
            return ()
        if isinstance(value, str):
            value = value.split(",")
        if not isinstance(value, (list, tuple, set)):
            raise ValueError("TRUSTED_PROXY_HOSTS must be a comma-separated list")
        hosts = tuple(str(host).strip() for host in value if str(host).strip())
        if any("/" in host for host in hosts):
            # CIDR ranges are deliberately not accepted: the allowlist is for
            # the immediate serving proxy, not arbitrary client networks.
            raise ValueError("TRUSTED_PROXY_HOSTS must contain individual IP addresses")
        import ipaddress

        try:
            for host in hosts:
                ipaddress.ip_address(host)
        except ValueError as error:
            raise ValueError("TRUSTED_PROXY_HOSTS must contain valid IP addresses") from error
        return hosts

    @field_validator("database_url")
    @classmethod
    def require_async_postgres(cls, value: str) -> str:
        if not value.startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use postgresql+psycopg://")
        return value

    @field_validator(
        "session_ttl_seconds",
        "otp_ttl_seconds",
        "otp_resend_cooldown_seconds",
        "otp_max_attempts",
        "otp_email_requests_per_window",
        "otp_ip_requests_per_window",
        "otp_verify_attempts_per_ip_window",
        "otp_rate_limit_window_seconds",
    )
    @classmethod
    def require_positive_value(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("security limits must be positive")
        return value

    @model_validator(mode="after")
    def reject_development_secrets_in_production(self) -> Settings:
        if self.environment != "production":
            return self

        secret_values = (
            self.session_secret.get_secret_value(),
            self.otp_pepper.get_secret_value(),
            self.rate_limit_pepper.get_secret_value(),
        )
        if any(
            value.startswith("development-")
            or len(value) < 32
            or self._is_example_placeholder(value)
            for value in secret_values
        ):
            raise ValueError(
                "production authentication secrets must be unique and at least 32 characters"
            )
        if len(set(secret_values)) != len(secret_values):
            raise ValueError("production authentication secrets must be different values")
        google_secret = self.google_client_secret.get_secret_value()
        if (
            not self.google_client_id
            or self._is_example_placeholder(self.google_client_id)
            or not google_secret
            or self._is_example_placeholder(google_secret)
        ):
            raise ValueError("Google OAuth credentials are required in production")
        resend_api_key = self.resend_api_key.get_secret_value()
        if not resend_api_key or self._is_example_placeholder(resend_api_key):
            raise ValueError("RESEND_API_KEY is required in production")
        if self.web_base_url.scheme != "https" or self.api_base_url.scheme != "https":
            raise ValueError("production web and API URLs must use HTTPS")
        if self.google_redirect_uri.scheme != "https":
            raise ValueError("production Google redirect URI must use HTTPS")
        if self.google_redirect_uri.host != self.api_base_url.host:
            raise ValueError("production Google redirect URI must use the API host")
        return self

    @staticmethod
    def _is_example_placeholder(value: str) -> bool:
        normalized = value.strip().casefold()
        return (
            normalized.startswith("replace-with-")
            or normalized.startswith("your-")
            or normalized.startswith("example-")
            or normalized in {
                "re_example",
                "example.apps.googleusercontent.com",
                "changeme",
                "change-me",
            }
        )

    @property
    def web_origin(self) -> str:
        return str(self.web_base_url).rstrip("/")

    @property
    def api_origin(self) -> str:
        return str(self.api_base_url).rstrip("/")

    @property
    def session_cookie_name(self) -> str:
        return "__Host-mybot_session" if self.environment == "production" else "mybot_session"

    @property
    def secure_cookies(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    # Alembic and the application are launched from the repository root, where
    # the documented .env file lives. Keeping this in Settings ensures both
    # entry points apply the same validation and parsing rules.
    return Settings()
