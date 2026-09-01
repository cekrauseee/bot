"""Typed configuration for the AI service."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def repository_env_path() -> Path:
    """Return the optional .env path for a source checkout.

    Installed packages may not have a repository checkout next to them. A
    missing path is intentional: pydantic-settings treats it as an empty
    dotenv source, while real process environment variables still win.
    """

    module_path = Path(__file__).resolve()
    for parent in module_path.parents:
        if (parent / "apps" / "ai" / "pyproject.toml").is_file():
            return parent / ".env"
    return module_path.parent / ".env"


class Settings(BaseSettings):
    """Runtime settings that are safe to share with future AI features."""

    model_config = SettingsConfigDict(
        env_file=repository_env_path(), env_file_encoding="utf-8", extra="ignore"
    )

    environment: Literal["development", "test", "production"]
    service_name: Literal["ai"] = "ai"
    ai_base_url: AnyHttpUrl
    database_url: str | None = None
    openai_api_key: str | None = None
    xai_api_key: str | None = None
    openrouter_api_key: str | None = None
    ai_service_token: str
    runtime_base_url: AnyHttpUrl
    runtime_service_token: str | None = None

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> object:
        """Normalize the legacy SQLAlchemy-style psycopg URL for libpq consumers."""

        legacy_scheme = "postgresql+psycopg:"
        if isinstance(value, str) and value.lower().startswith(legacy_scheme):
            return f"postgresql:{value[len(legacy_scheme):]}"
        return value


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide validated settings instance."""

    return Settings()
