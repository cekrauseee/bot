import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Resend } from 'resend'

export class EmailDeliveryError extends Error {}
export type Template = { subject: string; html: string; text: string }

const codeToken = '__MYBOT_OTP_CODE__'
const minutesToken = '__MYBOT_EXPIRATION_MINUTES__'

export async function loadLoginOtpTemplate(): Promise<Template> {
  const directory = fileURLToPath(new URL('./modules/auth/email/templates/', import.meta.url))
  const metadata = JSON.parse(await readFile(`${directory}login-otp.json`, 'utf8')) as { subject: string }
  const [html, text] = await Promise.all([readFile(`${directory}login-otp.html`, 'utf8'), readFile(`${directory}login-otp.txt`, 'utf8')])
  if (![html, text].every((value) => value.includes(codeToken) && value.includes(minutesToken))) {
    throw new Error('generated login OTP template is missing substitution tokens')
  }
  return { subject: metadata.subject, html, text }
}

export interface OtpEmailSender {
  sendOtp(input: { to: string; code: string; challengeId: string; expiresInSeconds: number }): Promise<void>
}

export class ResendOtpEmailSender implements OtpEmailSender {
  private readonly template: Promise<Template>
  private readonly resend?: Resend

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    template = loadLoginOtpTemplate(),
    resend?: Resend,
  ) {
    this.template = template
    this.resend = resend
  }

  async sendOtp({ to, code, challengeId, expiresInSeconds }: Parameters<OtpEmailSender['sendOtp']>[0]) {
    if (!this.apiKey) throw new EmailDeliveryError('Resend is not configured')
    const template = await this.template
    const replacements = new Map([
      [codeToken, code],
      [minutesToken, String(Math.ceil(expiresInSeconds / 60))],
    ])
    const replace = (value: string) => [...replacements].reduce((result, [token, replacement]) => result.split(token).join(replacement), value)
    try {
      const resend = this.resend ?? new Resend(this.apiKey)
      const result = await resend.emails.send({
        from: this.from,
        to: [to],
        subject: template.subject,
        html: replace(template.html),
        text: replace(template.text),
        tags: [{ name: 'category', value: 'authentication' }],
      }, { idempotencyKey: `otp-${challengeId}` })
      if (result.error) {
        console.error('resend_otp_delivery_failed', {
          errorType: result.error.name,
          statusCode: result.error.statusCode,
        })
        throw new EmailDeliveryError('Resend did not accept the OTP email')
      }
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error
      // Never include recipient, OTP, or challenge identifiers in logs.
      console.error('resend_otp_delivery_failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      })
      throw new EmailDeliveryError('Resend did not accept the OTP email')
    }
  }
}
