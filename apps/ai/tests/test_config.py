from my_bot_ai.config import Settings, repository_env_path


def test_repository_env_path_is_optional_and_source_checkout_aware() -> None:
    path = repository_env_path()

    assert path.name == ".env"
    assert (path.parent / "apps" / "ai" / "pyproject.toml").is_file()


def test_missing_env_file_uses_safe_defaults(tmp_path) -> None:
    settings = Settings(_env_file=tmp_path / "missing.env")

    assert settings.environment == "development"
    assert settings.service_name == "ai"


def test_env_file_is_loaded_and_process_environment_wins(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("ENVIRONMENT=production\n", encoding="utf-8")

    monkeypatch.delenv("ENVIRONMENT", raising=False)
    assert Settings(_env_file=env_file).environment == "production"
    monkeypatch.setenv("ENVIRONMENT", "test")
    assert Settings(_env_file=env_file).environment == "test"
