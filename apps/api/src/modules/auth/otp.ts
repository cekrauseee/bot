import type { Redis } from 'ioredis'
import type { Settings } from '../../config.js'
import { EmailDeliveryError, type OtpEmailSender } from '../../email.js'
import { AuthError, invalidCode } from '../../errors.js'
import { generateOpaqueToken, generateOtpCode, hashOtp, keyedIdentifier } from '../../security.js'

export type IssuedOtp = { challengeId: string; expiresInSeconds: number; resendAfterSeconds: number; developmentCode?: string }
export type OtpReservation = { challengeId: string; email: string; reservationId: string }

const fixedWindowScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {current, redis.call('TTL', KEYS[1])}`

const installScript = `
local current = redis.call('GET', KEYS[1])
if ARGV[1] == '__none__' then
  if current then return {'stale'} end
elseif current ~= ARGV[1] then
  return {'stale'}
end
if current then redis.call('DEL', KEYS[3]) end
redis.call('HSET', KEYS[2], 'code_hash', ARGV[3], 'email', ARGV[4], 'attempts', '0', 'status', 'active')
redis.call('EXPIRE', KEYS[2], ARGV[5])
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[5])
return {'installed'}`

// Development issues no email and replaces the current challenge in one operation.
const replaceDevelopmentScript = `
local current = redis.call('GET', KEYS[1])
if current then redis.call('DEL', 'auth:otp:challenge:' .. current) end
redis.call('HSET', KEYS[2], 'code_hash', ARGV[2], 'email', ARGV[3], 'attempts', '0', 'status', 'active')
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
return {'installed'}`

const reserveScript = `
if redis.call('EXISTS', KEYS[1]) == 0 then return {'missing'} end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return {'missing'} end
if redis.call('HGET', KEYS[1], 'status') == 'reserved' then return {'already_reserved'} end
if redis.call('HGET', KEYS[1], 'code_hash') == ARGV[2] then
  local email = redis.call('HGET', KEYS[1], 'email')
  redis.call('HSET', KEYS[1], 'status', 'reserved', 'reservation', ARGV[4])
  return {'verified', email}
end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts >= tonumber(ARGV[3]) then
  redis.call('DEL', KEYS[1]); redis.call('DEL', KEYS[2]); return {'locked'}
end
return {'invalid', tostring(attempts)}`

const finalizeScript = `
if redis.call('HGET', KEYS[1], 'reservation') ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
if redis.call('GET', KEYS[2]) == ARGV[2] then redis.call('DEL', KEYS[2]) end
return 1`

const releaseScript = `
if redis.call('HGET', KEYS[1], 'reservation') ~= ARGV[1] then return 0 end
if redis.call('GET', KEYS[2]) == ARGV[2] then
  redis.call('HSET', KEYS[1], 'status', 'active'); redis.call('HDEL', KEYS[1], 'reservation')
else
  redis.call('DEL', KEYS[1])
end
return 1`

const rollbackIssueScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end
if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
redis.call('DEL', KEYS[3])
return 1`

const deleteIfValueScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`

export class OtpService {
  constructor(
    private readonly redis: Redis,
    private readonly emailSender: OtpEmailSender,
    private readonly settings: Settings,
  ) {}

  private emailKey(email: string) { return keyedIdentifier(email, this.settings.rateLimitPepper) }
  private ipKey(ip: string) { return keyedIdentifier(ip, this.settings.rateLimitPepper) }

  private async takeLimit(key: string, maximum: number) {
    const [current, ttl] = await this.redis.eval(
      fixedWindowScript,
      1,
      key,
      this.settings.otpRateLimitWindowSeconds,
    ) as [number, number]
    if (Number(current) <= maximum) return
    throw new AuthError('rate_limited', 'Too many attempts. Wait before trying again.', 429, Math.max(1, Number(ttl)))
  }

  async issue(email: string, ip: string): Promise<IssuedOtp> {
    const emailKey = this.emailKey(email)
    const challengeId = generateOpaqueToken()
    if (this.settings.environment === 'development') {
      const code = generateOtpCode()
      await this.redis.eval(
        replaceDevelopmentScript,
        2,
        `auth:otp:active:${emailKey}`,
        `auth:otp:challenge:${challengeId}`,
        challengeId,
        hashOtp(challengeId, code, this.settings.otpPepper),
        email,
        this.settings.otpTtlSeconds,
      )
      return {
        challengeId,
        expiresInSeconds: this.settings.otpTtlSeconds,
        resendAfterSeconds: 0,
        developmentCode: code,
      }
    }
    const cooldownKey = `auth:otp:cooldown:${emailKey}`
    const acquired = await this.redis.set(cooldownKey, challengeId, 'EX', this.settings.otpResendCooldownSeconds, 'NX')
    if (!acquired) {
      throw new AuthError('rate_limited', 'Wait before requesting another code.', 429, Math.max(1, await this.redis.ttl(cooldownKey)))
    }

    try {
      await this.takeLimit(`auth:otp:request:ip:${this.ipKey(ip)}`, this.settings.otpIpRequestsPerWindow)
      await this.takeLimit(`auth:otp:request:email:${emailKey}`, this.settings.otpEmailRequestsPerWindow)
    } catch (error) {
      await this.redis.eval(deleteIfValueScript, 1, cooldownKey, challengeId)
      throw error
    }

    const code = generateOtpCode()
    const activeKey = `auth:otp:active:${emailKey}`
    const previous = await this.redis.get(activeKey)
    const previousKey = previous ? `auth:otp:challenge:${previous}` : 'auth:otp:challenge:unused'
    const challengeKey = `auth:otp:challenge:${challengeId}`
    let installResult: string[]
    try {
      installResult = await this.redis.eval(
        installScript,
        3,
        activeKey,
        challengeKey,
        previousKey,
        previous ?? '__none__',
        challengeId,
        hashOtp(challengeId, code, this.settings.otpPepper),
        email,
        this.settings.otpTtlSeconds,
      ) as string[]
    } catch (error) {
      await this.redis.eval(deleteIfValueScript, 1, cooldownKey, challengeId)
      throw error
    }
    if (installResult[0] !== 'installed') {
      // The active challenge changed between GET and the atomic install. The
      // request owns this cooldown claim and must release it on a stale issue.
      await this.redis.eval(deleteIfValueScript, 1, cooldownKey, challengeId)
      throw new AuthError('rate_limited', 'A newer code is already active. Wait before trying again.', 429, this.settings.otpResendCooldownSeconds)
    }

    try {
      await this.emailSender.sendOtp({ to: email, code, challengeId, expiresInSeconds: this.settings.otpTtlSeconds })
    } catch (error) {
      await this.redis.eval(rollbackIssueScript, 3, cooldownKey, activeKey, challengeKey, challengeId)
      if (error instanceof EmailDeliveryError) {
        throw new AuthError('email_delivery_unavailable', 'Unable to send a code right now. Try again shortly.', 503)
      }
      throw error
    }
    return { challengeId, expiresInSeconds: this.settings.otpTtlSeconds, resendAfterSeconds: this.settings.otpResendCooldownSeconds }
  }

  async reserve(challengeId: string, code: string, ip: string): Promise<OtpReservation> {
    await this.takeLimit(`auth:otp:verify:ip:${this.ipKey(ip)}`, this.settings.otpVerifyAttemptsPerIpWindow)
    const challengeKey = `auth:otp:challenge:${challengeId}`
    const email = await this.redis.hget(challengeKey, 'email')
    if (!email) throw invalidCode()
    const reservationId = generateOpaqueToken()
    const result = await this.redis.eval(
      reserveScript,
      2,
      challengeKey,
      `auth:otp:active:${this.emailKey(email)}`,
      challengeId,
      hashOtp(challengeId, code, this.settings.otpPepper),
      this.settings.otpMaxAttempts,
      reservationId,
    ) as string[]
    if (result[0] === 'verified') return { challengeId, email: String(result[1]), reservationId }
    if (result[0] === 'locked') throw new AuthError('code_attempts_exhausted', 'Too many incorrect attempts. Request a new code.', 429, this.settings.otpResendCooldownSeconds)
    throw invalidCode()
  }

  async finalize(reservation: OtpReservation) {
    const result = await this.redis.eval(
      finalizeScript,
      2,
      `auth:otp:challenge:${reservation.challengeId}`,
      `auth:otp:active:${this.emailKey(reservation.email)}`,
      reservation.reservationId,
      reservation.challengeId,
    )
    return Number(result) === 1
  }

  async release(reservation: OtpReservation) {
    const result = await this.redis.eval(
      releaseScript,
      2,
      `auth:otp:challenge:${reservation.challengeId}`,
      `auth:otp:active:${this.emailKey(reservation.email)}`,
      reservation.reservationId,
      reservation.challengeId,
    )
    return Number(result) === 1
  }

  async close() { await this.redis.quit() }
}
