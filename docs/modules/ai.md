# AI Service

## Responsibility

`apps/ai` is the Python boundary for model providers, inference orchestration, and future AI-specific workloads. It does not own browser authentication, user persistence, sessions, transactional email, or product HTTP contracts.

## Structure

- `src/my_bot_ai/main.py`: FastAPI application factory and exported ASGI app.
- `src/my_bot_ai/config.py`: typed service configuration.
- `src/my_bot_ai/features`: feature-owned routers and future model integrations.
- `tests`: isolated service tests.

## Current Contract

`GET /health` returns:

```json
{"status": "ok", "service": "ai"}
```

The service runs on port `8001` in local development. The application API does not call it yet, so it can evolve without coupling product authentication or storage to a model runtime.

## Dependency Management

`pyproject.toml` defines the Python 3.14 runtime and development dependencies. `uv.lock` records the resolved environment. Keep product-neutral AI libraries here; dependencies used only by the Node application API belong to `apps/api`. The minimal `package.json` is a Turbo discovery wrapper: its `dev`, `lint`, and `test` scripts delegate to `uv`; it does not duplicate Python dependencies in npm.
