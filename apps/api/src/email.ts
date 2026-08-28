import { LoginOtpEmail, loginOtpSubject } from '@my-bot/emails'
import { createElement } from 'react'
import { Resend } from 'resend'

export class EmailDeliveryError extends Error {}

export interface OtpEmailSender {
  sendOtp(input: { to: string; code: string; challengeId: string; expiresInSeconds: number }): Promise<void>
}

export class ResendOtpEmailSender implements OtpEmailSender {
  private readonly resend?: Resend

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    resend?: Resend,
  ) {
    this.resend = resend
  }

  async sendOtp({ to, code, challengeId, expiresInSeconds }: Parameters<OtpEmailSender['sendOtp']>[0]) {
    if (!this.apiKey) throw new EmailDeliveryError('Resend is not configured')
    try {
      const resend = this.resend ?? new Resend(this.apiKey)
      const result = await resend.emails.send({
        from: this.from,
        to: [to],
        subject: loginOtpSubject,
        react: createElement(LoginOtpEmail, {
          otpCode: code,
          expirationMinutes: Math.ceil(expiresInSeconds / 60),
        }),
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
