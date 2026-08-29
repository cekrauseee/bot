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

`src/features/chat/index.ts` is the single public entrypoint used by `ChatPage`. The page maps `AuthUser` to the application-owned user view model. `ChatFeature` owns model preferences and composes the conversation service with presentational components. The service loads conversations, parses SSE across arbitrary chunks, reconciles server IDs, and cancels active streams on navigation or Stop.

`/` shows the centered initial composer. The first `turn.started` navigates in place to `/conversations/:conversationId` without unmounting the active stream. Direct conversation URLs load durable history. The sidebar groups conversations by local calendar periods, and deletion requires an in-product confirmation.

Assistant text is parsed as safe Markdown. The beUI streaming response surface owns completion actions and citations, while the beUI code block renders fenced code during and after streaming. Reasoning summaries and real web-search activity remain separate from the final response. Existing approval, plan, task, tool, and resource components remain in the source tree for future features.

## Authentication

The `/sign` route lazy-loads the public login page. The feature service sends credentialed requests to `VITE_API_BASE_URL`. Its hook manages email, OTP, resend countdown, pending, and error state without inferring whether an account exists.

The `/` and `/conversations/:conversationId` routes are protected by a server session check. Their shared signed-in layout exposes the real Sign out action. An HTTP 401 redirects to `/sign`; an unavailable API keeps a recoverable error state instead of treating the user as signed out.

## Theming

`next-themes` applies a class to the root element. The default theme is `system`, and the beUI theme toggle switches between explicit light and dark appearances. An inline head script applies the initial class before React starts to avoid an incorrect-theme flash.

Theme values live in `src/index.css` as OKLCH semantic tokens. Component code consumes roles such as `background`, `foreground`, `primary`, `muted`, `border`, and `ring`.

## beUI Workflow

Search, preview, and install components with `npx shadcn@latest` and the `@beui` namespace. Review every generated file and preserve the paths reported by `npx shadcn@latest info --json`.
