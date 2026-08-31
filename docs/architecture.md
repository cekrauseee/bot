# Architecture

## Overview

The repository contains independently managed product services under `apps/` and a consumable React Email package under `packages/`. Root scripts provide one entry point for development and validation while Turborepo owns the JavaScript/TypeScript task graph and `uv` owns the Python AI environment.

## Components

| Component | Responsibility |
| --- | --- |
| `apps/web` | Browser application, routing, theming, and product interface |
| `apps/api` | Node.js HTTP API, authentication, and server-side product capabilities |
| `apps/ai` | Python service boundary for model providers and AI workloads |
| `packages/email` | React Email components, local previews, and the consumable email package |
| PostgreSQL | Users, OAuth identities, sessions, conversations, and messages |
| Redis | Short-lived OTP challenges, OAuth state, and rate limits |
| Root workspace | Shared commands, repository rules, and canonical documentation |

The web application uses React Router Data Mode. The router is created outside the React tree and lazy-loads the public login page and one persistent chat layout for `/`, `/conversations/:conversationId`, and `/projects/:projectId/:conversationId`. Pages compose authentication and the public chat feature. Hooks own interaction and session state; feature services own HTTP and SSE parsing.

The chat feature is application-owned under `apps/web/src/features/chat`. Its public entrypoint re-exports the feature container and route-path helper. The URL is the only active conversation identity; project slugs are canonical path metadata. `useConversationController` owns catalog loading, keyed detail and turn operations, cancellation, and mutations. Its pure reducer stores the catalog independently from conversation records, guards every detail and turn write with an operation ID, and atomically moves a new optimistic turn to the server conversation ID. The transport service contains only HTTP, SSE validation, and message mapping. Presentational components compose the existing beUI shell, sidebar, message scroller, activity, streaming response, citations, code block, and composer.

The application API uses an Elysia application factory with the official Node.js adapter, typed runtime schemas, and OpenAPI documentation. It is the only browser-facing backend. It authenticates users, owns conversations and messages in PostgreSQL, and proxies the AI stream while persisting partial and final output. Drizzle defines the relational schema and versioned migrations.

The AI service uses a FastAPI application factory in `my_bot_ai.main`. It accepts only bearer-authenticated service requests from the application API. LangChain owns the agent graph, OpenAI Responses provides reasoning and built-in web search, and the service emits provider-neutral SSE events. It does not own browser authentication or persistence.

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
3. Elysia calls FastAPI with the local text transcript and an internal bearer token.
4. FastAPI runs the LangChain agent with `store=false` and streams normalized reasoning, text, and real web-search events.
5. Elysia validates and retransmits the SSE sequence while accumulating safe summaries, sources, and response text.
6. Completion, failure, or cancellation updates the assistant message before the terminal browser event is emitted.

## Invariants

- Page modules remain lazy-loaded through the router.
- Pages compose features and do not own reusable interaction logic.
- Interactive product primitives use beUI when a suitable component exists.
- beUI source enters the repository only through the shadcn CLI.
- Theme-aware components use semantic tokens that resolve in both appearances.
- API behavior is exposed through routers and covered by tests.
- Product routes, authentication, and relational data remain owned by `apps/api`.
- Model-provider integrations and AI execution remain owned by `apps/ai`.
- The browser never receives OpenAI credentials or provider-native event payloads.
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
