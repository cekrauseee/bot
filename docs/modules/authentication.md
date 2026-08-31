# Authentication

## Methods

Email login creates or reuses a user only after a valid one-time code. Google login uses OpenID Connect through `openid-client` and links a verified Google email to the same user record. Later Google logins resolve the provider subject before considering the current email claim.

The API requests only `openid email profile`. It stores the Google subject, provider email, first name, last name, and avatar URL. It does not store Google access or refresh tokens.

## HTTP Contract

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/otp/request` | Issue and email a new challenge |
| `POST` | `/auth/otp/verify` | Consume a code and create a session |
| `GET` | `/auth/google/start` | Start Google Authorization Code login |
| `GET` | `/auth/google/callback` | Validate Google state, nonce, PKCE, and identity |
| `GET` | `/auth/session` | Return the current user or HTTP 401 |
| `POST` | `/auth/sign-out` | Revoke the current session and clear its cookie |

OTP request responses are identical for new and existing email addresses. Errors use `detail.code`, `detail.message`, and an optional `detail.retry_after_seconds`. Rate-limited responses also set `Retry-After`.

## Security Properties

- Codes contain six cryptographically random decimal digits, expire after 10 minutes, and work once.
- Redis stores the code HMAC, challenge email, attempt count, and expiry. It never stores the raw code.
- A challenge locks after five incorrect codes. Request and verification limits apply to keyed email and IP identifiers.
- Resending waits 60 seconds, creates a new code, and invalidates the previous challenge.
- Session tokens are opaque random values. PostgreSQL stores only their SHA-256 hashes.
- Sessions last 30 days, support multiple devices, and can be revoked individually or by user.
- Production cookies are host-only, `Secure`, `HttpOnly`, `SameSite=Lax`, and use the `__Host-` prefix.
- Credentialed CORS uses one configured web origin. Production state-changing requests require the same `Origin`.

## Development OTP

With API `ENVIRONMENT=development`, OTP issuance skips Resend and includes `development_code` in the non-cacheable challenge response. The Vite development frontend prefills the six-digit code after both request and resend; users still submit verification normally. Issuance skips cooldown and email/IP request limits and returns `resend_after_seconds: 0`, even if old cooldown keys still exist. Each request atomically deletes the previous challenge and installs a new one. Random code generation, HMAC storage, expiry, verification attempt limits, and single-use consumption are unchanged.

Test and production environments use the email sender and never expose the code in the response. Production frontend builds ignore the development field. This convenience removes email ownership proof in development: use only isolated development databases and never expose a development API publicly or point it at real user data.

## Email Template

`packages/email/emails/login-otp.tsx` is the versioned React Email component and source of truth. The `@my-bot/email` workspace package exports the component and subject. The API supplies the generated OTP and expiry as props and sends the element through the Resend Node SDK `react` field without a hosted template or generated HTML/text artifacts. The API sends from `RESEND_FROM`; production uses `myBot <mybot@cekrause.eu>`.

## Production Topology

Configure the web and API as sibling HTTPS subdomains. Register the exact API callback URI in the Google OAuth client. Set the web build's `VITE_API_BASE_URL` to the API sibling origin. If a serving proxy is present, list its immediate IP address in `TRUSTED_PROXY_HOSTS`; the API then accepts only a single valid `X-Forwarded-For` address from that peer, and ignores forwarded headers from direct or untrusted peers.
