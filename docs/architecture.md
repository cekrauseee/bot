# Architecture

## Overview

The repository contains two independently managed applications under `apps/`. Root scripts provide one entry point for development and validation without coupling npm and Python dependency resolution.

## Components

| Component | Responsibility |
| --- | --- |
| `apps/web` | Browser application, routing, theming, and product interface |
| `apps/api` | HTTP API and server-side product capabilities |
| `apps/emails` | React Email components, local previews, and API artifact rendering |
| PostgreSQL | Users, OAuth identities, and revocable sessions |
| Redis | Short-lived OTP challenges, OAuth state, and rate limits |
| Root workspace | Shared commands, repository rules, and canonical documentation |

The web application uses React Router Data Mode. The router is created outside the React tree and lazy-loads the public login and protected root pages. Pages compose authentication and chat features and beUI components. Hooks own interaction and session state; feature services own HTTP calls.

The chat feature is application-owned under `apps/web/src/features/chat`. Its public entrypoint (`features/chat/index.ts`) re-exports the feature container, which owns temporary fixture state; `HomePage` adapts `AuthUser` to the page-owned user view model. `model.ts` and `fixtures/` contain serializable data only. `components/` owns the presentational shell, workspace, sidebar, messages, activity, tools, and composer; renderers adapt model blocks to interactive components. Chat components expose callbacks for navigation and composer actions and do not invent API event formats or persistence.

The API uses an application factory in `my_bot_api.main`. A small application container owns database, Redis, OTP, OAuth, email, and session services. Routers expose typed health and authentication contracts.

## Data Flow

The email login flow crosses both applications:

1. The web application requests an OTP for a normalized email address.
2. Redis atomically applies cooldown and rate limits, then stores only the HMAC of a short-lived code.
3. The repository renders the React Email component locally, and Resend delivers its HTML and text.
4. Redis verifies and consumes the code once.
5. PostgreSQL creates or reuses the user and stores a hashed opaque session token.
6. The API sets a host-only `HttpOnly` cookie and the browser loads the protected root page.

Google login uses Authorization Code, PKCE, state, nonce, and the `openid email profile` scopes. A verified Google email links to an existing email account; a known Google subject takes precedence on later logins. The API does not retain Google access or refresh tokens.

The API runs on its own subdomain and does not add an `/api` path prefix. Credentialed CORS accepts only the configured web origin. State-changing browser requests validate that origin.

## Invariants

- Page modules remain lazy-loaded through the router.
- Pages compose features and do not own reusable interaction logic.
- Interactive product primitives use beUI when a suitable component exists.
- beUI source enters the repository only through the shadcn CLI.
- Theme-aware components use semantic tokens that resolve in both appearances.
- API behavior is exposed through routers and covered by tests.
- Authentication secrets and raw OTP or session tokens never enter persistent storage or logs.
- Account lookup behavior does not reveal whether an email already exists.
- The repository contains no Harness metadata or session state.
- Pages do not import chat internals or vendor-style agent components.
- Chat fixtures and model types do not import React or component types.
- Chat workspace presentation receives data, view state, and callbacks from the feature container.
