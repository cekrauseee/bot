import { afterEach, describe, expect, it, vi } from 'vitest'
import { Writable } from 'node:stream'
import { LoginOtpEmail } from '@my-bot/email'
import {
  EmailDeliveryError,
  ResendOtpEmailSender,
} from '../src/email.js'
import { createLogger } from '../src/logger.js'

describe('OTP email delivery', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends the React Email component with actual props and stable metadata', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email_123' }, error: null })
    const sender = new ResendOtpEmailSender(
      're_test',
      'myBot <mybot@example.com>',
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
      tags: [{ name: 'category', value: 'authentication' }],
    })
    expect(payload).not.toHaveProperty('html')
    expect(payload).not.toHaveProperty('text')
    expect(payload).not.toHaveProperty('template')
    expect(payload.react).toMatchObject({ type: LoginOtpEmail, props: { otpCode: '482913', expirationMinutes: 11 } })
    expect(options).toEqual({ idempotencyKey: 'otp-challenge_123' })
  })

  it('logs only safe metadata when Resend rejects a message', async () => {
    let serialized = ''
    const destination = new Writable({ write(chunk, _encoding, callback) { serialized += chunk.toString(); callback() } })
    const log = createLogger({ environment: 'production' }, destination)
    const sender = new ResendOtpEmailSender(
      're_private',
      'myBot <mybot@example.com>',
      { emails: { send: vi.fn().mockRejectedValue(new TypeError('provider unavailable')) } } as never,
      log,
    )

    await expect(sender.sendOtp({
      to: 'private@example.com',
      code: '482913',
      challengeId: 'private_challenge',
      expiresInSeconds: 600,
    })).rejects.toBeInstanceOf(EmailDeliveryError)

    await new Promise<void>((resolve) => setImmediate(resolve))
    const record = JSON.parse(serialized) as Record<string, unknown>
    expect(record).toMatchObject({
      level: 'error', service: 'my_bot_api', environment: 'production',
      event: 'otp_email_delivery_failed', message: 'otp_email_delivery_failed',
      error_name: 'TypeError',
    })
    expect(serialized).toContain('TypeError')
    expect(serialized).not.toContain('private@example.com')
    expect(serialized).not.toContain('482913')
    expect(serialized).not.toContain('re_private')
    expect(serialized).not.toContain('private_challenge')
    destination.end()
  })

  it('treats an SDK error response as a delivery failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sender = new ResendOtpEmailSender(
      're_test',
      'myBot <mybot@example.com>',
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
