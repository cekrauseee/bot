"""Typed configuration for the AI service."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

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

    environment: Literal["development", "test", "production"] = "development"
    service_name: Literal["ai"] = "ai"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide validated settings instance."""

    return Settings()
