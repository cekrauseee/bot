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

`src/features/chat/index.ts` is the single public entrypoint used by `ChatPage`. `ChatFeature` owns model preferences and composes the conversation service with presentational components. The service loads conversations and active runs, parses SSE across arbitrary chunks, reconnects through WebSocket cursors, and reconciles optimistic and checkpoint-backed state. Navigation detaches the local view without cancelling background work; Stop calls the explicit run-cancellation endpoint.

`/` shows the centered initial composer. The first `turn.started` navigates in place to `/conversations/:conversationId` without unmounting the active stream. Direct conversation URLs load durable history. The sidebar groups conversations by local calendar periods, and deletion requires an in-product confirmation.

Assistant text is parsed as safe Markdown. Reasoning summaries, searches, tools, and child agents remain separate from final text. Each conversation has one macro task plan, shown as a compact badge above the composer and expanded through a popover rather than inserted into messages. The latest plan survives completed runs, new turns, and reloads. `ask_user` interrupts render through the beUI approval-card surface with keyboard-correct choice behavior, custom answers, and resumable ownership. Stop remains available while a run is waiting for input.

The composer loads `/models` and adapts reasoning choices and Fast mode to the selected provider. OpenAI and xAI entries retain distinct provider icons. Invalid saved preferences fall back to the selected model's server-provided defaults.

Run-scoped browser state appears in a compact picture-in-picture surface. Durable status and URL survive reload; bounded images arrive only as transient WebSocket frames. Wide viewports reserve room for a minimizable floating preview. Narrow viewports dock the same preview in layout flow so it does not cover messages or questions. The preview closes visually with the run. User takeover is intentionally not shown until a trusted control channel exists.

## Authentication

The `/sign` route lazy-loads the public login page. The feature service sends credentialed requests to `VITE_API_BASE_URL`. Its hook manages email, OTP, resend countdown, pending, and error state without inferring whether an account exists.

The `/` and `/conversations/:conversationId` routes are protected by a server session check. Their shared signed-in layout exposes the real Sign out action. An HTTP 401 redirects to `/sign`; an unavailable API keeps a recoverable error state instead of treating the user as signed out.

## Theming

`next-themes` applies a class to the root element. The default theme is `system`, and the beUI theme toggle switches between explicit light and dark appearances. An inline head script applies the initial class before React starts to avoid an incorrect-theme flash.

Theme values live in `src/index.css` as OKLCH semantic tokens. Component code consumes roles such as `background`, `foreground`, `primary`, `muted`, `border`, and `ring`.

## beUI Workflow

Search, preview, and install components with `npx shadcn@latest` and the `@beui` namespace. Review every generated file and preserve the paths reported by `npx shadcn@latest info --json`.
