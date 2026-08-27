# myBot transactional email

`emails/login-otp.tsx` is the React Email component and single source of truth for the OTP message. The API does not use hosted Resend templates.

## Local preview and render

From the repository root:

```sh
npm run emails:dev
npm run emails:render
npm run emails:check
npm run export --workspace @my-bot/emails
```

The preview uses code `482913` and a 10-minute expiry. `emails:render` renders HTML, plain text, and subject metadata into `apps/api/src/my_bot_api/templates`. Setup and development render these assets automatically. `emails:check` fails when the committed assets drift from the JSX source.

## Delivery

FastAPI loads the generated package assets, substitutes the server-generated code and expiry, and sends `subject`, `html`, and `text` through the Resend Emails API. Resend requires only `RESEND_API_KEY` and `RESEND_FROM`; there is no template alias or dashboard publication step.
