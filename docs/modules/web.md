# Web application

`apps/web` is the canonical Vite/React renderer for browser and desktop. React Router declares `/`, `/conversations/:conversationId`, `/sign`, and `/login`; page modules are lazy-loaded and compose feature-owned API/state logic. Shared primitives live under `src/components/ui`.

The interface uses official shadcn components with Base UI primitives, Tailwind CSS 4 semantic tokens, and system light/dark appearance. Forms use accessible labels, errors, status announcements, native buttons, and `gap-*` utilities. Motion is restrained and honors reduced-motion preferences.

The authenticated shell loads the conversation and project catalogs from the API. Conversation identity comes from the URL, while feature hooks own loading, mutations, provider connections, and live updates. Browser authentication uses HttpOnly cookies. In the desktop shell the same build runs under `app://mybot`; main-process bearer injection and safe external navigation stay outside renderer code.

The `/sign?desktop_transaction=...` state is a browser-only approval page. After Google or OTP establishes the browser session, the user must press the explicit approval button before the desktop transaction can be exchanged.
