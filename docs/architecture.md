# Architecture

## Services

| Component | Responsibility |
| --- | --- |
| `apps/web` | Browser and desktop renderer, routes, theme, and interface |
| `apps/desktop` | Electron shell, safe `app://mybot` protocol, encrypted desktop session |
| `apps/api` | Elysia HTTP API, authentication, persistence, and provider connections |
| `apps/ai` | FastAPI model-provider and orchestration boundary |
| `apps/runtime` | Isolated filesystem, process, browser, and sandbox tools |
| `packages/email` | Versioned React Email components |
| PostgreSQL | Durable users, sessions, projects, conversations, messages, and runs |
| Redis | Short-lived OTP/OAuth/desktop state and event fanout |

Routes are defined outside page components and lazy-load modules from `apps/web/src/routes`. Features own reusable interaction state and API clients. The API is the only browser-facing backend; Python and runtime credentials never reach the renderer.

## Authentication

Email OTP stores only challenge hashes in Redis. Google uses Authorization Code, PKCE, state, and nonce; provider tokens are not persisted. Browser sessions are opaque HttpOnly cookies backed by PostgreSQL hashes.

Desktop sign-in creates a short-lived transaction and stores its client secret only in encrypted Electron storage. The system browser authenticates, completes the transaction, and returns through a `mybot://` deep link that carries only the transaction ID. The desktop main process validates that ID, exchanges the secret once for a new session, and stores the token with Electron `safeStorage`; the browser session remains independent.

## Desktop shell

Forge packages the canonical `apps/web/dist` directory as `Resources/dist` inside an ASAR-enabled app and registers the `mybot` protocol. The renderer uses the stable `app://mybot` origin, context isolation, sandboxing, disabled Node integration, a strict CSP, and denied permissions/navigation. The API accepts that origin in every environment for authenticated application routes while keeping OTP creation and verification browser-only. A narrow preload bridge starts browser sign-in, clears the desktop session, reports platform info, and opens only validated external URLs. Public web/API origins are generated at build time from the root environment and no secrets are embedded.

## Invariants

- Use official shadcn/Base UI components and semantic Tailwind tokens.
- PostgreSQL is durable truth; Redis is ephemeral state or fanout.
- Raw OTP, browser session, desktop client secret, and provider tokens never enter URLs, logs, or persistent transaction state.
- API state-changing browser routes validate the configured origin; bearer requests are accepted only where the route validates the bearer session.
- Provider adapters remain behind the allowlisted connection registry.
- Desktop external navigation accepts HTTPS, plus exact configured local or loopback HTTP origins.
