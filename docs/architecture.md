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

The web application uses React Router Data Mode. The router is created outside the React tree and lazy-loads the public login and protected root pages. Pages compose authentication features and beUI components. Hooks own interaction and session state; a feature service owns HTTP calls.

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
