# Architecture

## Overview

The repository contains independently managed product services under `apps/` and a consumable React Email package under `packages/`. Root scripts provide one entry point for development and validation while Turborepo owns the JavaScript/TypeScript task graph and `uv` owns the Python AI environment.

## Components

| Component | Responsibility |
| --- | --- |
| `apps/web` | Browser application, routing, theming, and product interface |
| `apps/api` | Node.js HTTP API, authentication, and server-side product capabilities |
| `apps/ai` | Python service boundary for model providers and AI workloads |
| `apps/runtime` | Private execution service for sandboxed files, processes, and browsers |
| `packages/email` | React Email components, local previews, and the consumable email package |
| PostgreSQL | Product data, durable agent runs and events, and LangGraph checkpoints |
| Redis | Authentication state plus cross-instance event and frame fanout |
| Root workspace | Shared commands, repository rules, and canonical documentation |

The web application uses React Router Data Mode. The router is created outside the React tree and lazy-loads the public login page and one persistent chat layout for `/` and `/conversations/:conversationId`. Pages compose authentication and the public chat feature. Hooks own interaction and session state; feature services own HTTP and SSE parsing.

The chat feature is application-owned under `apps/web/src/features/chat`. Its conversation service hydrates active runs, consumes durable SSE and WebSocket events, resumes after navigation, and projects plans, questions, tool activity, and run-scoped browser previews. Presentational components compose the existing beUI shell, sidebar, message scroller, activity, streaming response, citations, code block, composer, and approval-card question surface.

The application API uses an Elysia application factory with the official Node.js adapter, typed runtime schemas, and OpenAPI documentation. It is the only browser-facing backend. It authenticates users and owns conversations, messages, one global agent workspace per user, agent runs, and normalized event history. PostgreSQL is the replay source of truth. Redis only distributes committed events and transient browser frames between API instances.

The AI service uses a FastAPI application factory in `my_bot_ai.main`. It accepts only bearer-authenticated service requests from the application API. LangChain and LangGraph own the durable agent graph and child-agent delegation. OpenAI and xAI model adapters remain provider-specific behind one normalized event contract. PostgreSQL checkpoints are authoritative for recovery; the API event log is their browser-facing projection.

The runtime maps each application workspace to a named persistent Vercel Sandbox. Files are global to that user workspace; each run snapshots its project's folder as the starting directory, or uses `/workspace` when unassigned. Browsers are scoped to individual runs. A root-owned operation journal prevents duplicate external effects across process retries, while model-controlled commands run as an unprivileged Linux user.

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

The durable agent flow is:

1. The browser sends a new message to Elysia with its session cookie and selected model settings.
2. Elysia atomically stores the user message, assistant placeholder, run, workspace reference, and initial event.
3. A leased executor calls FastAPI with the transcript and stable run ID. Other API instances may reclaim an expired lease.
4. FastAPI inspects the LangGraph checkpoint before invoking. It submits the transcript only when no checkpoint exists, resumes a matching interrupt once, or continues runnable checkpoint state with `None`.
5. LangChain streams provider-neutral text, safe reasoning summaries, plans, questions, tools, child agents, browser projections, and transient frames. Runtime tool calls carry deterministic operation IDs.
6. Elysia fences writes with the execution token, stores each durable event, and updates the assistant and active-run projection in the same transaction. Checkpoint reconciliation replaces stale partial text before continuation.
7. SSE serves the initiating request. WebSocket reconnects use a decimal cursor, bounded PostgreSQL replay, Redis live fanout, and explicit resynchronization through the active-run projection.

## Invariants

- Page modules remain lazy-loaded through the router.
- Pages compose features and do not own reusable interaction logic.
- Interactive product primitives use beUI when a suitable component exists.
- beUI source enters the repository only through the shadcn CLI.
- Theme-aware components use semantic tokens that resolve in both appearances.
- API behavior is exposed through routers and covered by tests.
- Product routes, authentication, and relational data remain owned by `apps/api`.
- Model-provider integrations and AI execution remain owned by `apps/ai`.
- Filesystem, shell, and browser execution remain owned by `apps/runtime`.
- The browser never receives OpenAI credentials or provider-native event payloads.
- Provider response storage stays disabled; PostgreSQL is the product and replay source of truth.
- LangGraph checkpoints decide whether execution may advance; API rows never replay a transcript into an existing graph.
- Runtime operation IDs prevent automatic repetition of ambiguous external effects.
- Browser frames are transient and never enter PostgreSQL or the operation journal.
- Authentication secrets and raw OTP or session tokens never enter persistent storage or logs.
- Account lookup behavior does not reveal whether an email already exists.
- The repository contains no Harness metadata or session state.
- Pages do not import chat internals or vendor-style agent components.
- Chat fixtures and model types do not import React or component types.
- Chat workspace presentation receives data, view state, and callbacks from the feature container.
