from types import SimpleNamespace

from my_bot_ai import dev


def test_development_server_uses_the_configured_origin(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        dev,
        "get_settings",
        lambda: SimpleNamespace(
            ai_base_url=SimpleNamespace(host="localhost", port=8123, scheme="http"),
            environment="development",
        ),
    )
    configured = []
    monkeypatch.setattr(dev, "configure_logging", configured.append)
    monkeypatch.setattr(dev.uvicorn, "run", lambda *args, **kwargs: calls.append((args, kwargs)))

    dev.main()

    assert configured == ["development"]
    assert calls == [(("my_bot_ai.main:app",), {
        "host": "localhost",
        "port": 8123,
        "reload": True,
        "log_config": None,
    })]
