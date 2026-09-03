# Web application

`apps/web` is the canonical Vite/React renderer for browser and desktop. React Router declares `/`, `/conversations/:conversationId`, `/sign`, and `/login`; page modules are lazy-loaded and compose feature-owned API/state logic. Shared primitives live under `src/components/ui`.

The interface uses official shadcn components with Base UI primitives, Tailwind CSS 4 semantic tokens, and system light/dark appearance. Forms use accessible labels, errors, status announcements, native buttons, and `gap-*` utilities. Motion is restrained and honors reduced-motion preferences.

The authenticated shell loads the conversation and project catalogs from the API. Conversation identity comes from the URL, while feature hooks own loading, mutations, provider connections, and live updates. Browser authentication uses HttpOnly cookies. In the desktop shell the same build runs under `app://mybot`; main-process bearer injection and safe external navigation stay outside renderer code.

The desktop renderer shows only a browser sign-in action. `/sign?desktop_transaction=...` remains browser-only: after Google or OTP establishes the browser session, it completes the transaction, attempts to open the validated `mybot://` callback automatically, and keeps one fallback link visible.
