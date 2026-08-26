# Architecture

## Overview

The repository contains two independently managed applications under `apps/`. Root scripts provide one entry point for development and validation without coupling npm and Python dependency resolution.

## Components

| Component | Responsibility |
| --- | --- |
| `apps/web` | Browser application, routing, theming, and product interface |
| `apps/api` | HTTP API and server-side product capabilities |
| Root workspace | Shared commands, repository rules, and canonical documentation |

The web application uses React Router Data Mode. The router is created outside the React tree and lazy-loads the login page module. The page composes the authentication feature, shared brand element, and beUI components. Interaction state lives in a feature hook.

The API uses an application factory in `my_bot_api.main`. A root API router includes bounded route modules. The initial health route returns a typed Pydantic response.

## Data Flow

The current login flow is local to the browser:

1. Vite loads the application shell and React Router.
2. React Router downloads the login page chunk.
3. The theme provider resolves the saved or system appearance.
4. The login feature keeps field and password-visibility state in memory.
5. Form submission is prevented because authentication is not implemented.

The API runs independently and responds to `GET /health`. It does not add an `/api` path prefix because the API is hosted on its own domain. There is no frontend-to-API request in the current scope.

## Invariants

- Page modules remain lazy-loaded through the router.
- Pages compose features and do not own reusable interaction logic.
- Interactive product primitives use beUI when a suitable component exists.
- beUI source enters the repository only through the shadcn CLI.
- Theme-aware components use semantic tokens that resolve in both appearances.
- API behavior is exposed through routers and covered by tests.
- The repository contains no Harness metadata or session state.
