# Authentication

## Browser login

Email login issues a six-digit OTP, stores only its hash and challenge metadata in Redis, and consumes it once. Google login uses Authorization Code, PKCE, state, and nonce; only the verified profile and identity link are stored. Browser sessions are opaque tokens whose hashes are stored in PostgreSQL and whose raw values are held in HttpOnly cookies.

State-changing browser requests require the configured web origin (or the desktop app origin for authenticated app routes). Bearer authentication is accepted only by routes that resolve that bearer session; a syntactically valid fake bearer does not bypass origin checks.

## Desktop handoff

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/desktop/start` | Create a short-lived transaction and return its one-time secret to the desktop main process |
| `POST` | `/auth/desktop/approve` | Authenticated browser action that records the approved `user_id` |
| `POST` | `/auth/desktop/exchange` | One-time exchange that issues a new desktop session for that user |

The client secret appears only in the desktop main process and request body. Redis stores its hash, transaction status, and approved user ID; it never stores a browser session token. Approval is never implicit after OTP or Google authentication: the browser shows an accessible confirmation card and requires an explicit button. The newly issued desktop session can be signed out without revoking the browser session that approved it.

## Desktop storage

Electron stores the desktop session with `safeStorage` under the user-data directory. Renderer code receives no token. Main-process API requests add the token only for the exact configured API origin.
