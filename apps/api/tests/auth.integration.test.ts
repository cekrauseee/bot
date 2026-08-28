import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Redis } from 'ioredis'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadSettings } from '../src/config.js'
import { Database } from '../src/db/database.js'
import { AuthRepository } from '../src/db/repository.js'
import { schema } from '../src/db/schema.js'
import { OtpService } from '../src/modules/auth/otp.js'
import { SessionManager } from '../src/modules/auth/sessions.js'
import { EmailDeliveryError } from '../src/email.js'

class DelayedActiveLookupRedis extends Redis {
  private resolveLookupStarted!: () => void
  private resolveAllowLookup!: () => void
  private delayed = false
  readonly lookupStarted = new Promise<void>((resolve) => { this.resolveLookupStarted = resolve })
  readonly allowLookup = new Promise<void>((resolve) => { this.resolveAllowLookup = resolve })

  override async get(key: string) {
    const value = await super.get(key)
    if (key.startsWith('auth:otp:active:') && !this.delayed) {
      this.delayed = true
      this.resolveLookupStarted()
      await this.allowLookup
    }
    return value
  }

  releaseLookup() { this.resolveAllowLookup() }
}

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380/0')
redisUrl.pathname = '/15'
const settings = loadSettings({
  ...process.env,
  ENVIRONMENT: 'test',
  REDIS_URL: redisUrl.toString(),
})

describe('PostgreSQL and Redis authentication', () => {
  const pool = new Pool({ connectionString: settings.databaseUrl, max: 2, connectionTimeoutMillis: 1_000 })
  const redis = new Redis(settings.redisUrl, { lazyConnect: true, connectTimeout: 1_000 })
  let database: Database
  const sent: Array<{ to: string; code: string; challengeId: string }> = []
  const sender = {
    sendOtp: async (input: { to: string; code: string; challengeId: string }) => {
      sent.push(input)
    },
  }
  const emailsToDelete = new Set<string>()
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    await pool.query('select 1')
    await redis.connect()
    database = await Database.create(settings)
    await migrate(drizzle(pool, { schema }), {
      migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    })
    app = createApp(settings, {
      database,
      otp: new OtpService(redis, sender, settings),
      sessions: new SessionManager(settings),
      google: {} as never,
    })
  })

  beforeEach(async () => {
    sent.length = 0
    await redis.flushdb()
  })

  afterEach(async () => {
    for (const email of emailsToDelete) {
      await pool.query('delete from users where email = $1', [email])
    }
    emailsToDelete.clear()
  })

  afterAll(async () => {
    await redis.flushdb()
    await redis.quit()
    await database.close()
    await pool.end()
  })

  it('requests and verifies one OTP, then revokes only that session', async () => {
    const email = `otp-${randomUUID()}@example.com`
    emailsToDelete.add(email)
    const requested = await app.handle(new Request('http://localhost/auth/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: settings.webOrigin },
      body: JSON.stringify({ email: email.toUpperCase() }),
    }))
    expect(requested.status).toBe(202)
    const challenge = await requested.json() as { challenge_id: string }

    const verified = await app.handle(new Request('http://localhost/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: settings.webOrigin },
      body: JSON.stringify({ challenge_id: challenge.challenge_id, code: sent[0].code }),
    }))
    expect(verified.status).toBe(200)
    expect((await verified.json() as { user: { email: string } }).user.email).toBe(email)

    const cookie = verified.headers.get('set-cookie')!
    expect((await app.handle(new Request('http://localhost/auth/session', { headers: { cookie } }))).status).toBe(200)
    expect((await app.handle(new Request('http://localhost/auth/sign-out', {
      method: 'POST',
      headers: { cookie, origin: settings.webOrigin },
    }))).status).toBe(204)
    expect((await app.handle(new Request('http://localhost/auth/session', { headers: { cookie } }))).status).toBe(401)
  })

  it('allows exactly one concurrent reservation for a code', async () => {
    const email = `concurrency-${randomUUID()}@example.com`
    const otp = new OtpService(redis, sender, settings)
    const issued = await otp.issue(email, '192.0.2.10')
    const code = sent[0].code

    const results = await Promise.allSettled([
      otp.reserve(issued.challengeId, code, '192.0.2.11'),
      otp.reserve(issued.challengeId, code, '192.0.2.12'),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'invalid_code' })
    await otp.finalize((fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof otp.reserve>>>).value)
  })

  it('locks a challenge after the configured number of incorrect codes', async () => {
    const email = `lockout-${randomUUID()}@example.com`
    const otp = new OtpService(redis, sender, settings)
    const issued = await otp.issue(email, '192.0.2.20')
    const wrongCode = sent[0].code === '000000' ? '111111' : '000000'

    for (let attempt = 1; attempt < settings.otpMaxAttempts; attempt += 1) {
      await expect(otp.reserve(issued.challengeId, wrongCode, '192.0.2.20'))
        .rejects.toMatchObject({ code: 'invalid_code' })
    }
    await expect(otp.reserve(issued.challengeId, wrongCode, '192.0.2.20'))
      .rejects.toMatchObject({ code: 'code_attempts_exhausted' })
    await expect(otp.reserve(issued.challengeId, sent[0].code, '192.0.2.20'))
      .rejects.toMatchObject({ code: 'invalid_code' })
  })

  it('enforces resend cooldown and replaces the previous active challenge', async () => {
    const email = `replacement-${randomUUID()}@example.com`
    const otp = new OtpService(redis, sender, settings)
    const first = await otp.issue(email, '192.0.2.21')
    const firstCode = sent[0].code
    await expect(otp.issue(email, '192.0.2.21')).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: expect.any(Number),
    })

    const cooldownKeys = await redis.keys('auth:otp:cooldown:*')
    await redis.del(...cooldownKeys)
    const second = await otp.issue(email, '192.0.2.21')
    await expect(otp.reserve(first.challengeId, firstCode, '192.0.2.21'))
      .rejects.toMatchObject({ code: 'invalid_code' })
    const reservation = await otp.reserve(second.challengeId, sent[1].code, '192.0.2.21')
    expect(await otp.finalize(reservation)).toBe(true)
  })

  it('releases a reservation without losing its challenge TTL', async () => {
    const email = `release-${randomUUID()}@example.com`
    const otp = new OtpService(redis, sender, settings)
    const issued = await otp.issue(email, '192.0.2.22')
    const challengeKey = `auth:otp:challenge:${issued.challengeId}`
    const before = await redis.ttl(challengeKey)
    const reservation = await otp.reserve(issued.challengeId, sent[0].code, '192.0.2.22')
    const reserved = await redis.ttl(challengeKey)
    expect(reserved).toBeGreaterThan(0)
    expect(reserved).toBeLessThanOrEqual(before)
    expect(await otp.release(reservation)).toBe(true)
    const released = await redis.ttl(challengeKey)
    expect(released).toBeGreaterThan(0)
    expect(released).toBeLessThanOrEqual(reserved)

    const replay = await otp.reserve(issued.challengeId, sent[0].code, '192.0.2.22')
    expect(await otp.finalize(replay)).toBe(true)
    expect(await redis.exists(challengeKey)).toBe(0)
  })

  it('rejects delayed stale issuance while preserving the newer challenge', async () => {
    const delayedRedis = new DelayedActiveLookupRedis(settings.redisUrl, { lazyConnect: true, connectTimeout: 1_000 })
    await delayedRedis.connect()
    try {
      const email = `stale-${randomUUID()}@example.com`
      const otp = new OtpService(delayedRedis, sender, settings)
      const firstTask = otp.issue(email, '192.0.2.23')
      await delayedRedis.lookupStarted
      const cooldownKeys = await delayedRedis.keys('auth:otp:cooldown:*')
      await delayedRedis.del(...cooldownKeys)

      const second = await otp.issue(email, '192.0.2.23')
      expect(sent[0].challengeId).toBe(second.challengeId)
      delayedRedis.releaseLookup()
      await expect(firstTask).rejects.toMatchObject({ code: 'rate_limited' })
      const activeKeys = await delayedRedis.keys('auth:otp:active:*')
      expect(activeKeys).toHaveLength(1)
      expect(await delayedRedis.get(activeKeys[0])).toBe(second.challengeId)
    } finally {
      delayedRedis.releaseLookup()
      await delayedRedis.quit()
    }
  })

  it('rolls back delivery failure so the next issue can retry', async () => {
    const email = `retry-${randomUUID()}@example.com`
    let fail = true
    const messages: string[] = []
    const failingSender = {
      sendOtp: async (input: { challengeId: string }) => {
        if (fail) {
          fail = false
          throw new EmailDeliveryError('provider unavailable')
        }
        messages.push(input.challengeId)
      },
    }
    const otp = new OtpService(redis, failingSender, settings)
    await expect(otp.issue(email, '192.0.2.24')).rejects.toMatchObject({ code: 'email_delivery_unavailable' })
    const retried = await otp.issue(email, '192.0.2.24')
    expect(messages).toEqual([retried.challengeId])
    expect(await redis.keys('auth:otp:challenge:*')).toHaveLength(1)
  })

  it('links a Google subject to an existing verified email user', async () => {
    const email = `google-${randomUUID()}@example.com`
    emailsToDelete.add(email)
    const subject = `google-${randomUUID()}`

    const ids = await database.transaction(async (db) => {
      const repository = new AuthRepository(db)
      const emailUser = await repository.getOrCreateEmailUser(email, { emailVerifiedAt: new Date() })
      const googleUser = await repository.getOrCreateGoogleUser({
        providerSubject: subject,
        email,
        firstName: 'Person',
        providerEmail: email,
      })
      return [emailUser.id, googleUser.id]
    })

    expect(ids[0]).toBe(ids[1])
    const result = await pool.query<{ count: number }>('select count(*)::int as count from users where email = $1', [email])
    expect(result.rows[0].count).toBe(1)
  })
})
