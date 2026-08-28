import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { Redis } from 'ioredis'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadSettings } from '../src/config.js'
import { Database } from '../src/db/database.js'
import { AuthRepository } from '../src/db/repository.js'
import { schema } from '../src/db/schema.js'
import { OtpService } from '../src/modules/auth/otp.js'
import { SessionManager } from '../src/modules/auth/sessions.js'

const enabled = process.env.RUN_API_INTEGRATION === '1'
const describeIntegration = describe.skipIf(!enabled)
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380/0')
redisUrl.pathname = '/15'
const settings = loadSettings({
  ...process.env,
  ENVIRONMENT: 'test',
  REDIS_URL: redisUrl.toString(),
})

describeIntegration('PostgreSQL and Redis authentication', () => {
  const sql = postgres(settings.databaseUrl, { max: 2, connect_timeout: 1 })
  const redis = new Redis(settings.redisUrl, { lazyConnect: true, connectTimeout: 1_000 })
  const database = new Database(settings)
  const sent: Array<{ to: string; code: string; challengeId: string }> = []
  const sender = {
    sendOtp: async (input: { to: string; code: string; challengeId: string }) => {
      sent.push(input)
    },
  }
  const emailsToDelete = new Set<string>()
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    await sql`select 1`
    await redis.connect()
    await migrate(drizzle(sql, { schema }), {
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
      await sql`delete from users where email = ${email}`
    }
    emailsToDelete.clear()
  })

  afterAll(async () => {
    await redis.flushdb()
    await redis.quit()
    await database.close()
    await sql.end({ timeout: 2 })
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
    const rows = await sql`select count(*)::int as count from users where email = ${email}`
    expect(rows[0].count).toBe(1)
  })
})
