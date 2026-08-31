import type { Redis } from 'ioredis'
import { describe, expect, it, vi } from 'vitest'
import { loadSettings, type Environment } from '../src/config.js'
import { OtpService } from '../src/modules/auth/otp.js'
import { hashOtp } from '../src/security.js'

describe('development OTP delivery', () => {
  it('allows repeated development requests even when a cooldown key already exists', async () => {
    const settings = loadSettings({ ...process.env, ENVIRONMENT: 'development' })
    const acquireCooldown = vi.fn(async () => null)
    const redis = {
      set: acquireCooldown,
      eval: vi.fn(async () => ['installed']),
    } as unknown as Redis
    const sendOtp = vi.fn(async () => {})
    const service = new OtpService(redis, { sendOtp }, settings)
    const challenges = new Set<string>()
    for (let index = 0; index < 10; index += 1) {
      const issued = await service.issue('developer@example.com', '127.0.0.1')
      expect(issued.resendAfterSeconds).toBe(0)
      challenges.add(issued.challengeId)
    }
    expect(challenges.size).toBe(10)
    expect(acquireCooldown).not.toHaveBeenCalled()
    expect(sendOtp).not.toHaveBeenCalled()
  })

  it.each<Environment>(['test', 'production'])('still rejects an active cooldown in %s', async (environment) => {
    const settings = { ...loadSettings({ ...process.env, ENVIRONMENT: 'test' }), environment }
    const redis = { set: vi.fn(async () => null), ttl: vi.fn(async () => 45) } as unknown as Redis
    const sendOtp = vi.fn(async () => {})
    await expect(new OtpService(redis, { sendOtp }, settings)
      .issue('developer@example.com', '127.0.0.1')).rejects.toMatchObject({ code: 'rate_limited' })
    expect(sendOtp).not.toHaveBeenCalled()
  })

  it.each<Environment>(['development', 'test', 'production'])(
    'uses the correct delivery path in %s', async (environment) => {
      const settings = { ...loadSettings({ ...process.env, ENVIRONMENT: 'test' }), environment }
      const evaluate = vi.fn(async (script: string, ..._args: unknown[]) => {
        if (script.includes("return {'installed'}")) return ['installed']
        return [1, 60]
      })
      const redis = {
        set: vi.fn(async () => 'OK'),
        get: vi.fn(async () => null),
        eval: evaluate,
      } as unknown as Redis
      const sendOtp = vi.fn(async (_input: { code: string }) => {})
      const result = await new OtpService(redis, { sendOtp }, settings)
        .issue('developer@example.com', '127.0.0.1')

      if (environment === 'development') {
        expect(sendOtp).not.toHaveBeenCalled()
        expect(result.resendAfterSeconds).toBe(0)
        expect(redis.set).not.toHaveBeenCalled()
        expect(evaluate).toHaveBeenCalledOnce()
        expect(result.developmentCode).toMatch(/^\d{6}$/)
        const installation = evaluate.mock.calls.find(([script]) => script.includes('code_hash'))!
        expect(installation).toContain(hashOtp(result.challengeId, result.developmentCode!, settings.otpPepper))
        expect(installation).not.toContain(result.developmentCode)
      } else {
        expect(sendOtp).toHaveBeenCalledOnce()
        expect(result.resendAfterSeconds).toBe(settings.otpResendCooldownSeconds)
        expect(redis.set).toHaveBeenCalled()
        expect(result).not.toHaveProperty('developmentCode')
      }
    },
  )
})
