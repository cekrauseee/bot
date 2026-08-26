# myBOT transactional email

`login-otp.tsx` is the React Email source for the Resend template alias `mybot-login-otp`. Set the hosted template subject to **Your myBOT sign-in code**.

## Local preview and render

From the repository root:

```sh
npm run dev:emails
npm run render --workspace @my-bot/emails
npm run export --workspace @my-bot/emails
```

The preview uses code `482913` and a 10-minute expiry. `render` writes `out/login-otp.html`; `export` writes the React Email CLI output under `out/`.

## Resend template upload

Run `npm run resend:setup --workspace @my-bot/emails` once to configure the React Email CLI with a Resend API key locally. Then run the preview and use its Resend toolbar tab to upload the template. In Resend, set the subject to **Your myBOT sign-in code**, publish the template with alias `mybot-login-otp`, and define `OTP_CODE` (string) and `EXPIRATION_MINUTES` (number). The template must be published before the backend alias can send. Never commit the API key.

The backend sends the published alias using Resend's template API, passing `OTP_CODE` and `EXPIRATION_MINUTES` in `template.variables`.
