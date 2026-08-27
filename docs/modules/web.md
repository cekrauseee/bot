# Web Application

## Responsibility

`apps/web` renders the browser experience. It uses Vite 8, React 19, React Router 8 in Data Mode, Tailwind CSS 4, and local beUI source.

## Structure

- `src/app`: application providers, routing, and route fallbacks.
- `src/pages`: route-level composition organized by URL intent.
- `src/features`: product capabilities, their components, and hooks.
- `src/components/motion`: beUI registry source.
- `src/shared`: domain-neutral product elements.
- `src/lib`: shared utilities and motion primitives required by beUI.

## Authentication

The `/login` route lazy-loads the public login page. The feature service sends credentialed requests to `VITE_API_BASE_URL`. Its hook manages email, OTP, resend countdown, pending, and error state without inferring whether an account exists.

The `/` route is protected by a server session check. Its current signed-in mock contains a Sign out action. An HTTP 401 redirects to `/login`; an unavailable API keeps a recoverable error state instead of treating the user as signed out.

## Theming

`next-themes` applies a class to the root element. The default theme is `system`, and the beUI theme toggle switches between explicit light and dark appearances. An inline head script applies the initial class before React starts to avoid an incorrect-theme flash.

Theme values live in `src/index.css` as OKLCH semantic tokens. Component code consumes roles such as `background`, `foreground`, `primary`, `muted`, `border`, and `ring`.

## beUI Workflow

Search, preview, and install components with `npx shadcn@latest` and the `@beui` namespace. Review every generated file and preserve the paths reported by `npx shadcn@latest info --json`.
