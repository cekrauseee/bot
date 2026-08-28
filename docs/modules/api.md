# HTTP API

## Responsibility

`apps/api` is the functional application API for myBot. It runs TypeScript on Node.js with Elysia, Drizzle, PostgreSQL, Redis, OpenID Connect, and Resend. It is an npm workspace and remains independent from the Python AI service.

## Structure

- `src/app.ts`: Elysia application factory, cross-cutting HTTP behavior, and typed route composition.
- `src/config.ts`: validated environment configuration and production guardrails.
- `src/modules/auth`: OTP, Google OpenID Connect, and session services.
- `src/db`: Drizzle schema, repository, connection, migration, and drift checks.
- `src/email.ts`: local template loading and Resend delivery.
- `drizzle`: versioned, non-destructive SQL migrations.
- `tests`: unit and PostgreSQL/Redis integration coverage.

## Current Contract

`GET /health` returns:

```json
{"status": "ok"}
```

The response is validated by an Elysia runtime schema and covered by API tests. Authentication routes live under `/auth`; their stable behavior is documented in [Authentication](authentication.md). The service does not add an `/api` path prefix because the API is hosted on its own domain. Interactive OpenAPI documentation is available at `/openapi`, with its JSON document at `/openapi/json`.

## Dependency Management

`package.json` defines runtime and development dependencies. The repository root `package-lock.json` records the complete npm workspace graph. Strict TypeScript, Oxlint, Vitest, production builds, integration tests, and Drizzle migration checks run through the root command catalog.

## Database Compatibility

Drizzle now owns the schema and migration workflow. The initial migration uses idempotent DDL so it can initialize an empty database or adopt tables already created by the former Alembic revision without deleting data. Migration checks verify the expected relational contract before delivery.
