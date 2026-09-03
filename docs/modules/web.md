# Web application

`apps/web` is the canonical Vite/React renderer for browser and desktop. React Router declares `/`, `/conversations/:conversationId`, `/sign`, and `/login`; page modules are lazy-loaded and compose feature-owned API/state logic. Shared primitives live under `src/components/ui`.

The interface uses official shadcn components with Base UI primitives, Tailwind CSS 4 semantic tokens, and system light/dark appearance. Forms use accessible labels, errors, status announcements, native buttons, and `gap-*` utilities. Motion is restrained and honors reduced-motion preferences.

The authenticated shell loads the conversation and project catalogs from the API. Conversation identity comes from the URL, while feature hooks own loading, mutations, provider connections, and live updates. The account menu opens one concise settings dialog: model-provider access remains actionable there, while built-in integrations such as GitHub have a separate section and expose only capabilities that are actually available. Browser authentication uses HttpOnly cookies. In the desktop shell the same build runs under `app://mybot`; main-process bearer injection and safe external navigation stay outside renderer code.

Settings uses the generic provider-connection API and hook for the built-in GitHub integration. Its compact card represents unavailable, disconnected, connecting, and connected states; browser OAuth opens the returned sign-in URL, polls the owned login, and offers cancellation. Connected accounts expose the active toggle and disconnect action. GitHub account credentials remain API-owned; the renderer receives only safe connection metadata.

Blocking questions render as ordinary assistant messages. The composer remains the single response surface, and the user's answer starts another conversation turn.

Browser tool activities remain individually visible inside a collapsed-by-default browser group. Its trigger follows the current browser action, shimmers only while the browser lifecycle is active, and uses the most recent terminal result after the session ends. Earlier failed actions remain visible without overriding a later recovery.

Skill lifecycle events are parsed from durable activity records and live v2 events. Consecutive skill items form a distinct `skills` activity family, with accessible Sparkles iconography and concise `Loading skill`/`Loaded skill` copy; completed groups summarize as `Loaded skills`.

Transient browser frames feed an in-app picture-in-picture preview while the active run is launching or using the browser. The preview appears as soon as browser activity starts and shows a loading surface until its first frame arrives. Frames are scoped to the run. The API retains only the latest frame in process memory and sends it to late WebSocket subscribers, while the renderer retains it across socket reconnects. Both copies are cleared when the run becomes terminal. Frames are not durable and are not restored after a process restart until another frame arrives.

The desktop renderer shows only a browser sign-in action. `/sign?desktop_transaction=...` remains browser-only: after Google or OTP establishes the browser session, it completes the transaction, attempts to open the validated `mybot://` callback automatically, and keeps one fallback link visible.
