# HTTP API

## Responsibility

`apps/api` is the functional application API for myBot. It runs TypeScript on Node.js with Elysia, Drizzle, PostgreSQL, Redis, OpenID Connect, and Resend. It is an npm workspace and remains independent from the Python AI service.

## Structure

- `src/app.ts`: Elysia application factory, cross-cutting HTTP behavior, and typed route composition.
- `src/config.ts`: validated environment configuration and production guardrails.
- `src/modules/auth`: OTP, Google OpenID Connect, and session services.
- `src/modules/conversations.ts`: private AI client and public conversation serialization.
- `src/modules/agent-control-plane.ts`: leased execution, checkpoint projection, event replay, Redis fanout, and WebSocket transport.
- `src/modules/models.ts`: provider-aware public model capability catalog.
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

Agent control routes are:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/models` | Return provider-aware model, reasoning, and speed capabilities |
| `GET` | `/agent-runs/:runId` | Load one owned run projection |
| `GET` | `/agent-runs/:runId/events?after=` | Replay a bounded page of durable events |
| `POST` | `/agent-runs/:runId/resume` | Atomically answer the current question and queue continuation |
| `POST` | `/agent-runs/:runId/cancel` | Request cancellation without deleting run history |
| WebSocket | `/agent-runs/:runId/subscribe?after=` | Replay then stream durable events and transient browser frames |

Starting a turn creates a durable run and returns named `text/event-stream` events with a v2 envelope. PostgreSQL assigns the public decimal event sequence. The executor validates the AI service sequence, fences every write with a renewable execution token, stores partial state, and completes only after a valid terminal event. One active run is allowed per conversation across application instances.

Runs may continue after the initiating HTTP connection closes. Clients hydrate `active_run`, reconnect with the last sequence, replay through a fixed high-water mark, and then receive Redis-backed live fanout. PostgreSQL remains authoritative if Redis drops a message. Browser images are validated and fanned out separately without a database insert.

Conversation details expose one current task `plan`, projected from the latest nonempty run snapshot. New runs inherit that plan and pass it to the AI service as context. Plan updates replace the current snapshot; they do not create message blocks or independent plans per turn.

The first AI event contains its LangGraph checkpoint projection. When that checkpoint advanced beyond the API, Elysia replaces stale assistant text, clears a consumed resume value, records the reconciled checkpoint ID, and then applies new deltas. Expired execution leases are reclaimed periodically; stale executors cannot append events or change the assistant.

## Dependency Management

`package.json` defines runtime and development dependencies. The repository root `package-lock.json` records the complete npm workspace graph. Turbo runs package-owned TypeScript, Oxlint, Vitest, and production build tasks; integration tests and Drizzle migration checks are explicitly non-cached external-state tasks. Local and test connections use `pg.Pool`; production selects Neon Serverless `Pool` and configures the Node `ws` constructor. Production accepts only Neon hosts (`*.neon.tech`) unless `NEON_WS_PROXY` is configured as a `host[:port][/path]` WebSocket proxy address without a protocol.

## Database Compatibility

Drizzle owns the schema and migration workflow. The agent control-plane migration adds one global workspace per user, durable runs, and append-only events without changing existing conversation ownership. Migration checks verify the complete relational contract before delivery.
