import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EmailDeliveryError,
  loadLoginOtpTemplate,
  ResendOtpEmailSender,
} from '../src/email.js'

describe('OTP email delivery', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads generated HTML and text artifacts with both tokens', async () => {
    const template = await loadLoginOtpTemplate()

    expect(template.subject).toBe('Your myBot sign-in code')
    for (const body of [template.html, template.text]) {
      expect(body).toContain('__MYBOT_OTP_CODE__')
      expect(body).toContain('__MYBOT_EXPIRATION_MINUTES__')
    }
  })

  it('sends rendered bodies with a stable idempotency key', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email_123' }, error: null })
    const sender = new ResendOtpEmailSender(
      're_test',
      'myBot <mybot@example.com>',
      Promise.resolve({
        subject: 'Your myBot sign-in code',
        html: '<p>__MYBOT_OTP_CODE__ __MYBOT_EXPIRATION_MINUTES__</p>',
        text: '__MYBOT_OTP_CODE__ __MYBOT_EXPIRATION_MINUTES__',
      }),
      { emails: { send } } as never,
    )

    await sender.sendOtp({
      to: 'private@example.com',
      code: '482913',
      challengeId: 'challenge_123',
      expiresInSeconds: 601,
    })

    const [payload, options] = send.mock.calls[0]
    expect(payload).toMatchObject({
      from: 'myBot <mybot@example.com>',
      to: ['private@example.com'],
      subject: 'Your myBot sign-in code',
      html: '<p>482913 11</p>',
      text: '482913 11',
    })
    expect(payload).not.toHaveProperty('template')
    expect(options).toEqual({ idempotencyKey: 'otp-challenge_123' })
  })

  it('logs only safe metadata when Resend rejects a message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sender = new ResendOtpEmailSender(
      're_private',
      'myBot <mybot@example.com>',
      Promise.resolve({
        subject: 'Code',
        html: '__MYBOT_OTP_CODE__ __MYBOT_EXPIRATION_MINUTES__',
        text: '__MYBOT_OTP_CODE__ __MYBOT_EXPIRATION_MINUTES__',
      }),
      { emails: { send: vi.fn().mockRejectedValue(new TypeError('provider unavailable')) } } as never,
    )

    await expect(sender.sendOtp({
      to: 'private@example.com',
      code: '482913',
      challengeId: 'private_challenge',
      expiresInSeconds: 600,
    })).rejects.toBeInstanceOf(EmailDeliveryError)

    const serialized = JSON.stringify(log.mock.calls)
    expect(serialized).toContain('TypeError')
    expect(serialized).not.toContain('private@example.com')
    expect(serialized).not.toContain('482913')
    expect(serialized).not.toContain('re_private')
    expect(serialized).not.toContain('private_challenge')
  })

  it('treats an SDK error response as a delivery failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sender = new ResendOtpEmailSender(
      're_test',
      'myBot <mybot@example.com>',
      Promise.resolve({
        subject: 'Code',
        html: '__MYBOT_OTP_CODE__ __MYBOT_EXPIRATION_MINUTES__',
        text: '__MYBOT_OTP_CODE__ __MYBOT_EXPIRATION_MINUTES__',
      }),
      {
        emails: {
          send: vi.fn().mockResolvedValue({
            data: null,
            error: { name: 'rate_limit_exceeded', message: 'slow down', statusCode: 429 },
            headers: null,
          }),
        },
      } as never,
    )

    await expect(sender.sendOtp({
      to: 'private@example.com',
      code: '482913',
      challengeId: 'challenge_123',
      expiresInSeconds: 600,
    })).rejects.toBeInstanceOf(EmailDeliveryError)
  })
})
