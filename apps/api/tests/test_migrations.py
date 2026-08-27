from contextlib import contextmanager
from pathlib import Path
from runpy import run_path

from alembic import context

from my_bot_api.config import get_settings


class FakeAlembicConfig:
    config_file_name = None
    config_ini_section = "alembic"

    def __init__(self) -> None:
        self.options: dict[str, str] = {}

    def set_main_option(self, key: str, value: str) -> None:
        self.options[key] = value

    def get_main_option(self, key: str) -> str:
        return self.options[key].replace("%%", "%")

    def get_section(self, _: str, defaults: dict[str, str]) -> dict[str, str]:
        return {**defaults, **self.options}


def test_migrations_use_root_env_settings_and_escape_encoded_url(
    monkeypatch: object, tmp_path: Path
) -> None:
    url = "postgresql+psycopg://migration:p%40ss@db.example/mybot"
    tmp_path.joinpath(".env").write_text(f"DATABASE_URL={url}\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)  # type: ignore[attr-defined]
    get_settings.cache_clear()

    alembic_config = FakeAlembicConfig()
    configured: dict[str, str] = {}
    original_config = getattr(context, "config", None)
    original_offline = getattr(context, "is_offline_mode", None)
    original_configure = getattr(context, "configure", None)
    original_transaction = getattr(context, "begin_transaction", None)
    original_run = getattr(context, "run_migrations", None)

    @contextmanager
    def transaction() -> object:
        yield

    monkeypatch.setattr(context, "config", alembic_config, raising=False)  # type: ignore[attr-defined]
    monkeypatch.setattr(context, "is_offline_mode", lambda: True)
    monkeypatch.setattr(context, "configure", lambda **kwargs: configured.update(kwargs))
    monkeypatch.setattr(context, "begin_transaction", transaction)
    monkeypatch.setattr(context, "run_migrations", lambda: None)
    try:
        run_path(str(Path(__file__).parents[1] / "migrations" / "env.py"))
    finally:
        monkeypatch.setattr(context, "config", original_config, raising=False)  # type: ignore[attr-defined]
        monkeypatch.setattr(context, "is_offline_mode", original_offline)
        monkeypatch.setattr(context, "configure", original_configure)
        monkeypatch.setattr(context, "begin_transaction", original_transaction)
        monkeypatch.setattr(context, "run_migrations", original_run)
        get_settings.cache_clear()

    assert alembic_config.options["sqlalchemy.url"] == url.replace("%", "%%")
    assert configured["url"] == url
