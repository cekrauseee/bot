# Architecture

## Overview

The repository contains independently managed product services under `apps/` and a consumable React Email package under `packages/`. Root scripts provide one entry point for development and validation while Turborepo owns the JavaScript/TypeScript task graph and `uv` owns the Python AI environment.

## Components

| Component | Responsibility |
| --- | --- |
| `apps/web` | Browser application, routing, theming, and product interface |
| `apps/api` | Node.js HTTP API, authentication, and server-side product capabilities |
| `apps/ai` | Python service boundary for model providers and AI workloads |
| `apps/runtime` | Private filesystem, process, browser, and sandbox boundary |
| `packages/email` | React Email components, local previews, and the consumable email package |
| PostgreSQL | Users, sessions, conversations, messages, agent runs, checkpoints, and durable events |
| Redis | Short-lived auth state plus cross-instance agent event and browser-frame fanout |
| Root workspace | Shared commands, repository rules, and canonical documentation |

The web application uses React Router Data Mode. The router is created outside the React tree and lazy-loads the public login page and one persistent chat layout for `/`, `/conversations/:conversationId`, and `/projects/:projectId/:conversationId`. Pages compose authentication and the public chat feature. Hooks own interaction and session state; feature services own HTTP and SSE parsing.

The chat feature is application-owned under `apps/web/src/features/chat`. Its public entrypoint re-exports the feature container and route-path helper. The URL is the only active conversation identity; project slugs are canonical path metadata. `useConversationController` owns catalog loading, keyed detail and turn operations, active-run subscriptions, cancellation, resume input, and mutations. Its pure reducer stores the catalog independently from conversation records, guards every detail and turn write, and atomically moves a new optimistic turn to the server conversation ID. The React-free transport service owns credentialed HTTP, SSE v2 and WebSocket validation, bigint cursors, and persisted-message projections.

The application API uses an Elysia application factory with the official Node.js adapter, typed runtime schemas, and OpenAPI documentation. It is the only browser-facing backend. It authenticates users and owns conversations, projects, workspaces, runs, messages, plans, and append-only events in PostgreSQL. Its leased executor continues work after the initiating HTTP response disconnects, publishes transient updates through Redis, and fences every durable write.

The AI service uses a FastAPI application factory in `my_bot_ai.main`. It accepts only bearer-authenticated service requests from the application API. LangGraph checkpoints own resumable orchestration; OpenAI, xAI, and OpenRouter adapters expose provider-aware models. The service normalizes agent, tool, child, plan, question, browser, and terminal events. It calls the runtime with a separate bearer token and does not own browser authentication or product persistence.

The runtime maps one durable user workspace to an isolated Vercel Sandbox. It executes unprivileged filesystem, process, and run-scoped browser tools with deterministic operation IDs. Project paths choose a run's starting directory without restricting access to the rest of `/workspace`.

## Data Flow

The email login flow crosses both applications:

1. The web application requests an OTP for a normalized email address.
2. Redis atomically applies cooldown and rate limits, then stores only the HMAC of a short-lived code.
3. The API passes the React Email component and OTP props to Resend's Node SDK; Resend renders the component in Node and delivers the message.
4. Redis verifies and consumes the code once.
5. PostgreSQL creates or reuses the user and stores a hashed opaque session token.
6. The API sets a host-only `HttpOnly` cookie and the browser loads the protected root page.

Google login uses Authorization Code, PKCE, state, nonce, and the `openid email profile` scopes. A verified Google email links to an existing email account; a known Google subject takes precedence on later logins. The API does not retain Google access or refresh tokens.

The API runs on its own subdomain and does not add an `/api` path prefix. Credentialed CORS accepts only the configured web origin. State-changing browser requests validate that origin.

The conversation flow is:

1. The browser sends a new message to Elysia with its session cookie and selected model settings.
2. Elysia verifies ownership and stores the user message plus a streaming assistant placeholder.
3. Elysia creates and leases a durable run, persists `turn.started`, and returns a replay-backed SSE v2 stream.
4. The executor calls FastAPI with the text transcript, run identity, frozen working directory, model settings, and correlation headers.
5. FastAPI restores the LangGraph checkpoint, invokes provider and runtime tools, and emits normalized v2 events.
6. Elysia fences and persists durable events and assistant projections before publishing them. Browser frames remain transient.
7. The web reducer applies ordered events by string cursor. Questions pause the run; resume and cancellation use owned run routes.
8. Navigation detaches local transports without cancelling cloud work. Reload uses `active_run`, replay, and WebSocket fanout to resume the projection.

## Observability

The API, AI service, and runtime emit schema-versioned structured events. Validated request and correlation IDs propagate from the browser-facing API through AI calls and runtime tools. Each request ends with one `request_completed` wide event containing route, status, duration, outcome, and safe operation identities where available.

Failures add an allowlisted category, code, fixed human-readable summary, and retryability. Provider quota exhaustion remains distinct from ordinary rate limiting, authentication, permission, invalid requests, timeouts, and availability failures. Logging boundaries recursively remove credentials, cookies, prompts, message content, provider bodies, SQL, commands, paths, and tool output. Raw exception messages never become diagnostic summaries.

## Invariants

- Page modules remain lazy-loaded through the router.
- Pages compose features and do not own reusable interaction logic.
- Interactive product primitives use beUI when a suitable component exists.
- beUI source enters the repository only through the shadcn CLI.
- Theme-aware components use semantic tokens that resolve in both appearances.
- API behavior is exposed through routers and covered by tests.
- Product routes, authentication, and relational data remain owned by `apps/api`.
- Model-provider integrations and AI execution remain owned by `apps/ai`.
- The browser never receives model-provider credentials or provider-native event payloads.
- OpenAI response storage stays disabled; PostgreSQL is the conversation source of truth.
- Authentication secrets and raw OTP or session tokens never enter persistent storage or logs.
- Account lookup behavior does not reveal whether an email already exists.
- The repository contains no Harness metadata, session state, or operational plans.
- Pages do not import chat internals or vendor-style agent components.
- Chat fixtures and model types do not import React or component types.
- Chat workspace presentation receives data, view state, and callbacks from the feature container.
- The route selects the active conversation; controller state never stores a second active conversation ID.
- Catalog failures do not erase ready conversation records, and detail failures do not erase catalog data.
- Late or aborted detail and turn callbacks can update only the record and operation that still own them.
- Route changes never imply run cancellation; Stop is the explicit cancellation action.
- One task plan belongs to the conversation task and renders above the composer, not inside message content.
