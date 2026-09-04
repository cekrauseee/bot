import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import WebSocket from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ACTIVE_RUN_DISCOVERY_RECONCILE_INTERVAL_MS,
  AGENT_RUN_SOCKET_RECONCILE_INTERVAL_MS,
  createApp,
} from '../src/app.js'
import { loadSettings } from '../src/config.js'
import { Database } from '../src/db/database.js'
import { AuthRepository, AgentRunRepository, ConversationRepository } from '../src/db/repository.js'
import { schema } from '../src/db/schema.js'
import { SessionManager } from '../src/modules/auth/sessions.js'

const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
const pool = new Pool({ connectionString: settings.databaseUrl, max: 3, connectionTimeoutMillis: 1_000 })
let database: Database

const cookieValue = (cookie: string) => cookie.split(';', 1)[0]

describe('durable run WebSocket delivery', () => {
  beforeAll(async () => {
    database = await Database.create(settings)
    await migrate(drizzle(pool, { schema }), {
      migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    })
  })

  afterAll(async () => {
    await database.close()
    await pool.end()
  })

  it('repairs a missed fanout wake from the PostgreSQL tail through terminal', async () => {
    expect(AGENT_RUN_SOCKET_RECONCILE_INTERVAL_MS).toBeLessThan(2_000)
    expect(ACTIVE_RUN_DISCOVERY_RECONCILE_INTERVAL_MS).toBeGreaterThan(0)

    const sessions = new SessionManager(settings)
    const email = `run-ws-${randomUUID()}@example.com`
    const setup = await database.transaction(async (db) => {
      const auth = new AuthRepository(db)
      const user = await auth.getOrCreateEmailUser(email, { emailVerifiedAt: new Date() })
      const session = await sessions.issue(auth, user.id)
      const conversation = await new ConversationRepository(db).create(user.id, 'WebSocket recovery', {
        model: 'gpt-5.6-sol', reasoningEffort: 'medium', speed: 'standard',
      })
      const turn = await new ConversationRepository(db).addTurn(conversation.id, 'Recover this turn', {
        model: 'gpt-5.6-sol', reasoningEffort: 'medium', speed: 'standard',
      })
      const repository = new AgentRunRepository(db)
      const queued = await repository.create({
        id: randomUUID(), turnId: randomUUID(), userId: user.id,
        conversationId: conversation.id, assistantMessageId: turn.assistant.id,
        model: 'gpt-5.6-sol', provider: 'openai', reasoningEffort: 'medium', speed: 'standard',
      })
      const run = await repository.claim(queued.id)
      if (!run) throw new Error('run_claim_failed')
      const started = await repository.appendEvent(run, 'turn.started', {})
      return { cookie: cookieValue(sessions.cookie(session.token)), run, started }
    })

    const app = createApp(settings, {
      database,
      sessions,
      otp: {} as never,
      google: {} as never,
      ai: async () => new Response('', { headers: { 'content-type': 'text/event-stream' } }),
    })
    const server = await new Promise<any>((resolve) =>
      app.listen({ port: 0, hostname: '127.0.0.1' }, resolve))
    const nodeServer = server.node.server
    if (!nodeServer.listening) {
      await new Promise((resolve) => nodeServer.once('listening', resolve))
    }
    const address = nodeServer.address() as { port: number }
    const socket = new WebSocket(
      `ws://127.0.0.1:${address.port}/agent-runs/${setup.run.id}/subscribe?after=${setup.started.sequence.toString()}`,
      { headers: { Cookie: setup.cookie, Origin: settings.webOrigin } },
    )
    const messages: Array<{ sequence: string; type: string }> = []
    const terminal = new Promise<void>((resolve, reject) => {
      socket.on('open', resolve)
      socket.on('error', reject)
    })

    try {
      await terminal
      const delivered = new Promise<void>((resolve, reject) => {
        socket.on('message', (value) => {
          try {
            const event = JSON.parse(value.toString()) as { sequence: string; type: string }
            messages.push({ sequence: event.sequence, type: event.type })
            if (event.type === 'turn.completed') resolve()
          } catch (error) {
            reject(error)
          }
        })
        socket.on('error', reject)
      })

      // Persist directly and deliberately do not publish to this process hub.
      // The socket must receive these only from periodic PostgreSQL repair.
      await database.transaction(async (db) => {
        const repository = new AgentRunRepository(db)
        await repository.appendEvent(setup.run, 'reasoning.delta', { delta: 'Recovered.' })
        await repository.appendEvent(setup.run, 'text.delta', { delta: 'Done.' })
        await repository.appendEvent(setup.run, 'turn.completed', {}, {
          status: 'completed', completedAt: new Date(), leaseExpiresAt: null,
        })
      })

      await delivered
      expect(messages.map(({ type }) => type)).toEqual([
        'reasoning.delta', 'text.delta', 'turn.completed',
      ])
      expect(messages.map(({ sequence }) => BigInt(sequence))).toEqual([
        setup.started.sequence + 1n,
        setup.started.sequence + 2n,
        setup.started.sequence + 3n,
      ])
    } finally {
      socket.close()
      await server.stop()
      await pool.query('delete from users where id = $1::uuid', [setup.run.userId])
    }
  }, 15_000)
})
