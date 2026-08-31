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
| `PATCH` | `/conversations/:conversationId` | Rename an owned conversation with `{ title: string }` |
| `POST` | `/conversations/turns` | Create a conversation and stream its first turn |
| `POST` | `/conversations/:conversationId/turns` | Stream a turn in an existing conversation |
| `DELETE` | `/conversations/:conversationId` | Delete an inactive owned conversation |
| `PATCH` | `/conversations/:conversationId/pin` | Set `{ pinned: boolean }` for an owned conversation |
| `PATCH` | `/conversations/pinned-order` | Reorder the complete owned pinned set using `{ conversation_ids: string[] }` |

Conversation summaries include nullable `pinned_order` and `pin_updated_at`. Pinning appends to the pinned order and preserves `project_id` and `updated_at`; unpinning clears the order. Pin/reorder requests serialize on the owning user row, and pin timestamps advance monotonically. Reordering rejects duplicate, missing, foreign, or unpinned IDs with 409 without partial writes. Pinned conversations reject all explicit project assignments, including moves to Recents, until unpinned.

Conversation renames normalize whitespace, keep chat activity timestamps and project/pin membership unchanged, and advance a separate `title_updated_at` clock.

Projects expose nullable `sort_order` and `order_updated_at`. `PATCH /projects/order` accepts `{ project_ids: string[] }` containing the complete current owned set and returns the reordered projects. Invalid or stale sets return 409 without partial writes. Create, delete, and reorder serialize on the user row. Unordered/new projects precede ordered projects, with creation time and ID descending as tie-breakers; renaming does not change the chosen order.

Turn responses use named `text/event-stream` events with a versioned JSON envelope. Elysia validates ordering and identifiers, emits one enriched `turn.started`, persists partial output on cancellation, and completes only after a valid upstream terminal event. One streaming assistant message is allowed per conversation across application instances.

Existing-conversation turn requests may include `retry_of`, the UUID of the latest failed assistant message. Under the owning conversation lock, the API verifies that the prompt matches its preceding user message and that no turn is streaming. It resets and reuses that assistant row, keeping the user message once. Older, completed, mismatched, or already-running attempts return 409; another user's conversation returns 404. New-conversation requests cannot include `retry_of`.

## Dependency Management

`package.json` defines runtime and development dependencies. The repository root `package-lock.json` records the complete npm workspace graph. Turbo runs package-owned TypeScript, Oxlint, Vitest, and production build tasks; integration tests and Drizzle migration checks are explicitly non-cached external-state tasks. Local and test connections use `pg.Pool`; production accepts only `*.neon.tech` hosts and connects directly through Neon Serverless with the Node `ws` constructor.

## Database Compatibility

Drizzle owns the schema and migration workflow. The compatibility migration adopts the former authentication schema without deleting data; the conversation migration adds `conversations` and `messages` with cascading ownership and streaming indexes. Migration checks verify the complete relational contract before delivery.
