# Project

**An agentic harness for everyone.**

Bot provides the structure in which people and agents work together. The harness is the product; no single agent, model, interface, or catalog of capabilities defines it.

## Direction

Bot is intended to become a general, approachable home for agentic work. It should support different people, agents, and ways of working without assuming technical expertise or a single use case.

Product decisions should strengthen the shared harness rather than turn Bot into a collection of disconnected AI features.

## Implementation today

The repository keeps the browser and desktop renderer, application API, AI provider boundary, runtime tools, and email package independently managed in one monorepo.

- Vite and React web application with lazy public and protected routes.
- Official shadcn/Base UI components, Tailwind CSS 4 semantic tokens, and system light/dark appearance.
- Elysia API with passwordless email OTP, Google OpenID Connect, sessions, conversations, projects, and provider connections.
- PostgreSQL durable state and Redis short-lived auth/fanout state.
- FastAPI AI boundary and isolated local Docker or Vercel Sandbox runtime.
- Electron desktop shell that packages the exact web build and uses an independent encrypted desktop session.

## Boundaries

Pages compose feature-owned logic; reusable UI remains domain-neutral. Node/Elysia owns product HTTP and persistence, Python owns model-provider calls, and the runtime owns isolated tools. Browser and desktop authentication secrets are never stored in web storage, URLs, or Redis transaction state.

The canonical root `.env` is the environment contract. Desktop builds embed only validated `WEB_BASE_URL` and `VITE_API_BASE_URL` origins. Provider credentials and internal service secrets remain server-side.
