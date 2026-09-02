import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Redis } from 'ioredis'
import type { Settings } from '../../config.js'
import { AuthError } from '../../errors.js'

const TTL_SECONDS = 300
const key = (id: string) => `auth:desktop:transaction:${id}`

export type DesktopTransaction = {
  transactionId: string
  clientSecret: string
  verificationUrl: string
  expiresInSeconds: number
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex')

/** Short-lived, one-time browser handoff state. Secrets are never placed in URLs. */
export class DesktopAuthService {
  constructor(private readonly redis: Redis, private readonly settings: Settings) {}

  async start(): Promise<DesktopTransaction> {
    const transactionId = randomBytes(24).toString('base64url')
    const clientSecret = randomBytes(48).toString('base64url')
    await this.redis.hset(key(transactionId), 'secret_hash', digest(clientSecret), 'status', 'pending')
    await this.redis.expire(key(transactionId), TTL_SECONDS)
    return {
      transactionId,
      clientSecret,
      verificationUrl: `${this.settings.webBaseUrl}/sign?desktop_transaction=${encodeURIComponent(transactionId)}`,
      expiresInSeconds: TTL_SECONDS,
    }
  }

  async approve(transactionId: string, userId: string) {
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(transactionId) || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
      throw new AuthError('invalid_desktop_transaction', 'This desktop sign-in request is invalid or expired.', 400)
    }
    const result = await this.redis.eval(`
      local status = redis.call('HGET', KEYS[1], 'status')
      if status ~= 'pending' then return 0 end
      redis.call('HSET', KEYS[1], 'status', 'approved', 'user_id', ARGV[1])
      return 1
    `, 1, key(transactionId), userId)
    if (Number(result) !== 1) throw new AuthError('invalid_desktop_transaction', 'This desktop sign-in request is invalid or expired.', 400)
  }

  async exchange(transactionId: string, clientSecret: string) {
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(transactionId) || !clientSecret) return undefined
    const raw = await this.redis.hgetall(key(transactionId))
    if (!raw.secret_hash || !raw.status || raw.status !== 'approved') return undefined
    const expected = Buffer.from(raw.secret_hash, 'hex')
    const actual = Buffer.from(digest(clientSecret), 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined
    const result = await this.redis.eval(`
      if redis.call('HGET', KEYS[1], 'status') ~= 'approved' then return false end
      local userId = redis.call('HGET', KEYS[1], 'user_id')
      redis.call('DEL', KEYS[1])
      return userId or false
    `, 1, key(transactionId))
    return typeof result === 'string' && result.length > 0 ? result : undefined
  }
}
