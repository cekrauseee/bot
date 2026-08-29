# HTTP API

## Responsibility

`apps/api` is the functional application API for myBot. It runs TypeScript on Node.js with Elysia, Drizzle, PostgreSQL, Redis, OpenID Connect, and Resend. It is an npm workspace and remains independent from the Python AI service.

## Structure

- `src/app.ts`: Elysia application factory, cross-cutting HTTP behavior, and typed route composition.
- `src/config.ts`: validated environment configuration and production guardrails.
- `src/modules/auth`: OTP, Google OpenID Connect, and session services.
- `src/modules/conversations.ts`: AI client, versioned SSE validation, stream persistence, and public serialization.
- `src/db`: Drizzle schema, repository, connection, migration, drift checks, and local application seed.
- `src/email.ts`: React Email composition and Resend delivery.
- `drizzle`: versioned, non-destructive SQL migrations.
- `tests`: unit and PostgreSQL/Redis integration coverage.

## Current Contract

`GET /health` returns:

```json
{"status": "ok"}
```

The response is validated by an Elysia runtime schema and covered by API tests. Authentication routes live under `/auth`; their stable behavior is documented in [Authentication](authentication.md). The service does not add an `/api` path prefix because the API is hosted on its own domain. Interactive OpenAPI documentation is available at `/openapi`, with its JSON document at `/openapi/json`.

Authenticated conversation routes are:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/conversations` | List the current user's conversations newest first |
| `GET` | `/conversations/:conversationId` | Load one owned conversation and its messages |
| `POST` | `/conversations/turns` | Create a conversation and stream its first turn |
| `POST` | `/conversations/:conversationId/turns` | Stream a turn in an existing conversation |
| `DELETE` | `/conversations/:conversationId` | Delete an inactive owned conversation |

Turn responses use named `text/event-stream` events with a versioned JSON envelope. Elysia validates ordering and identifiers, emits one enriched `turn.started`, persists partial output on cancellation, and completes only after a valid upstream terminal event. One streaming assistant message is allowed per conversation across application instances.

## Dependency Management

`package.json` defines runtime and development dependencies. The repository root `package-lock.json` records the complete npm workspace graph. Turbo runs package-owned TypeScript, Oxlint, Vitest, and production build tasks; integration tests and Drizzle migration checks are explicitly non-cached external-state tasks. Local and test connections use `pg.Pool`; production selects Neon Serverless `Pool` and configures the Node `ws` constructor. Production accepts only Neon hosts (`*.neon.tech`) unless `NEON_WS_PROXY` is configured as a `host[:port][/path]` WebSocket proxy address without a protocol.

## Database Compatibility

Drizzle owns the schema and migration workflow. The compatibility migration adopts the former authentication schema without deleting data; the conversation migration adds `conversations` and `messages` with cascading ownership and streaming indexes. Migration checks verify the complete relational contract before delivery.
