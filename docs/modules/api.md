# HTTP API

## Responsibility

`apps/api` is the Python service boundary for myBot. It uses Python 3.14, FastAPI, Pydantic, SQLAlchemy, Psycopg, Redis, Authlib, Resend, Alembic, and `uv`.

## Structure

- `src/my_bot_api/main.py`: application factory and exported ASGI app.
- `src/my_bot_api/config.py`: validated environment configuration.
- `src/my_bot_api/auth`: OTP, Google OAuth, cookies, security helpers, and contracts.
- `src/my_bot_api/database`: async engine and authentication repository.
- `src/my_bot_api/models`: persisted user, identity, and session models.
- `src/my_bot_api/routers/auth.py`: browser authentication routes.
- `src/my_bot_api/routers/health.py`: health contract and route.
- `migrations`: Alembic environment and revisions.
- `tests`: endpoint and application tests.

## Current Contract

`GET /health` returns:

```json
{"status": "ok"}
```

The response is validated by the `HealthResponse` Pydantic model and covered by `tests/test_health.py`. Authentication routes live under `/auth`; their stable behavior is documented in [Authentication](authentication.md). The service does not add an `/api` path prefix because the API is hosted on its own domain.

## Dependency Management

`pyproject.toml` defines runtime and development dependencies. `uv.lock` records the resolved environment. FastAPI is pinned to the verified minor release; transitive Starlette and Pydantic versions remain under FastAPI's dependency contract.
