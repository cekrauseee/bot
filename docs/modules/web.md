# Web Application

## Responsibility

`apps/web` renders the browser experience. It uses Vite 8, React 19, React Router 8 in Data Mode, Tailwind CSS 4, and local beUI source.

## Structure

- `src/app`: application providers, routing, and route fallbacks.
- `src/pages`: route-level composition organized by URL intent.
- `src/features`: product capabilities, their components, and hooks.
- `src/components/motion`: beUI registry source and motion-aware primitives.
- `src/components`: application-shared, domain-neutral UI components.
- `src/lib`: shared utilities and motion primitives required by beUI.

## Chat feature

`src/features/chat/index.ts` is the single public entrypoint used by the home page. `HomePage` maps `AuthUser` to the application-owned user view model, while `ChatFeature` owns temporary fixture-backed resource, reasoning, and speed state. Serializable contracts live in `model.ts`; visible scenario data lives in `fixtures/`. Presentational code is grouped by responsibility under `components/workspace`, `components/sidebar`, `components/messages`, `components/activity`, `components/tasks`, `components/tools`, `components/shared`, and `components/composer`. `ChatWorkspace` receives typed data, state, and callbacks; it has no auth dependency or persistence claims.

## Authentication

The `/sign` route lazy-loads the public login page. The feature service sends credentialed requests to `VITE_API_BASE_URL`. Its hook manages email, OTP, resend countdown, pending, and error state without inferring whether an account exists.

The `/` route is protected by a server session check. Its signed-in view renders the fixture-backed chat feature and exposes the real Sign out action. An HTTP 401 redirects to `/sign`; an unavailable API keeps a recoverable error state instead of treating the user as signed out.

## Theming

`next-themes` applies a class to the root element. The default theme is `system`, and the beUI theme toggle switches between explicit light and dark appearances. An inline head script applies the initial class before React starts to avoid an incorrect-theme flash.

Theme values live in `src/index.css` as OKLCH semantic tokens. Component code consumes roles such as `background`, `foreground`, `primary`, `muted`, `border`, and `ring`.

## beUI Workflow

Search, preview, and install components with `npx shadcn@latest` and the `@beui` namespace. Review every generated file and preserve the paths reported by `npx shadcn@latest info --json`.
