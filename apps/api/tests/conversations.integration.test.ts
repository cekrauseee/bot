import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { loadSettings } from '../src/config.js'
import { Database } from '../src/db/database.js'
import { AuthRepository } from '../src/db/repository.js'
import { schema } from '../src/db/schema.js'
import { seedApplication } from '../src/db/seeder.js'
import { SessionManager } from '../src/modules/auth/sessions.js'
import type { AiClient } from '../src/modules/conversations.js'

const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
const pool = new Pool({
  connectionString: settings.databaseUrl,
  max: 2,
  connectionTimeoutMillis: 1_000,
})
let database: Database

const providerFrame = (
  turnId: string,
  sequence: number,
  type: string,
  data: Record<string, unknown>,
) => `event: ${type}\ndata: ${JSON.stringify({
  version: 1,
  sequence,
  turn_id: turnId,
  type,
  data,
})}\n\n`

const ai: AiClient = async (input) => {
  const turnId = String(input.turn_id)
  return new Response([
    providerFrame(turnId, 1, 'turn.started', { model: input.model }),
    providerFrame(turnId, 2, 'reasoning.delta', { delta: 'Checked the request.' }),
    providerFrame(turnId, 3, 'step.started', {
      step: {
        id: 'search-1', kind: 'web_search', status: 'in_progress',
        label: 'Web search', query: 'current source',
      },
    }),
    providerFrame(turnId, 4, 'step.completed', {
      step: {
        id: 'search-1', kind: 'web_search', status: 'completed',
        label: 'Web search', query: 'current source',
        sources: [{ title: 'Example', url: 'https://example.com/source' }],
      },
    }),
    providerFrame(turnId, 5, 'text.delta', {
      delta: 'A **streamed** answer.\n\n```ts\nconst ready = true\n```',
    }),
    providerFrame(turnId, 6, 'turn.completed', { model: input.model }),
  ].join(''), { headers: { 'content-type': 'text/event-stream' } })
}

const cookieValue = (cookie: string) => cookie.split(';', 1)[0]

async function authenticatedUser(label: string) {
  const sessions = new SessionManager(settings)
  const email = `${label}-${randomUUID()}@example.com`
  const issued = await database.transaction(async (db) => {
    const repository = new AuthRepository(db)
    const user = await repository.getOrCreateEmailUser(email, { emailVerifiedAt: new Date() })
    const session = await sessions.issue(repository, user.id)
    return { user, session }
  })
  return {
    id: issued.user.id,
    email,
    cookie: cookieValue(sessions.cookie(issued.session.token)),
  }
}

const parseEvents = async (response: Response) => (await response.text())
  .split(/\r?\n\r?\n/)
  .filter(Boolean)
  .map((block) => JSON.parse(
    block.split(/\r?\n/).find((line) => line.startsWith('data:'))!.slice(5).trim(),
  ) as { type: string; data: Record<string, unknown> })

describe('PostgreSQL conversation flow', () => {
  beforeAll(async () => {
    await pool.query('select 1')
    database = await Database.create(settings)
    await migrate(drizzle(pool, { schema }), {
      migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    })
  })

  afterAll(async () => {
    await database.close()
    await pool.end()
  })

  it('persists, reloads, protects, and deletes a streamed conversation', async () => {
    const owner = await authenticatedUser('conversation-owner')
    const other = await authenticatedUser('conversation-other')
    const sessions = new SessionManager(settings)
    const app = createApp(settings, {
      database,
      sessions,
      ai,
      otp: {} as never,
      google: {} as never,
    })

    try {
      expect((await app.handle(new Request('http://localhost/conversations'))).status).toBe(401)

      const started = await app.handle(new Request('http://localhost/conversations/turns', {
        method: 'POST',
        headers: {
          cookie: owner.cookie,
          origin: settings.webOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: '  First persistent conversation  ',
          model: 'gpt-5.6-sol',
          reasoning_effort: 'medium',
          speed: 'fast',
        }),
      }))
      expect(started.status).toBe(200)
      const stream = await parseEvents(started)
      expect(stream.map((event) => event.type)).toEqual([
        'turn.started',
        'reasoning.delta',
        'step.started',
        'step.completed',
        'text.delta',
        'turn.completed',
      ])
      const conversation = stream[0].data.conversation as { id: string; title: string }
      expect(conversation.title).toBe('First persistent conversation')

      const list = await app.handle(new Request('http://localhost/conversations', {
        headers: { cookie: owner.cookie },
      }))
      expect(list.status).toBe(200)
      expect(await list.json()).toMatchObject({
        conversations: [{ id: conversation.id, title: conversation.title }],
      })

      const detail = await app.handle(new Request(
        `http://localhost/conversations/${conversation.id}`,
        { headers: { cookie: owner.cookie } },
      ))
      expect(detail.status).toBe(200)
      const persisted = await detail.json() as {
        messages: Array<Record<string, unknown>>
      }
      expect(persisted.messages).toHaveLength(2)
      expect(persisted.messages[0]).toMatchObject({
        role: 'user', content: 'First persistent conversation', status: 'completed',
      })
      expect(persisted.messages[1]).toMatchObject({
        role: 'assistant',
        content: 'A **streamed** answer.\n\n```ts\nconst ready = true\n```',
        reasoning: 'Checked the request.',
        status: 'completed',
        model: 'gpt-5.6-sol',
        reasoning_effort: 'medium',
        speed: 'fast',
        activities: [{
          id: 'search-1',
          type: 'search',
          query: 'current source',
          results: [{ title: 'Example', domain: 'example.com' }],
        }],
      })

      const hidden = await app.handle(new Request(
        `http://localhost/conversations/${conversation.id}`,
        { headers: { cookie: other.cookie } },
      ))
      expect(hidden.status).toBe(404)

      await pool.query(
        `update messages set status = 'streaming'
         where conversation_id = $1 and role = 'assistant'`,
        [conversation.id],
      )
      const activeDelete = await app.handle(new Request(
        `http://localhost/conversations/${conversation.id}`,
        { method: 'DELETE', headers: { cookie: owner.cookie, origin: settings.webOrigin } },
      ))
      expect(activeDelete.status).toBe(409)
      const activeTurn = await app.handle(new Request(
        `http://localhost/conversations/${conversation.id}/turns`,
        {
          method: 'POST',
          headers: {
            cookie: owner.cookie,
            origin: settings.webOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: 'Concurrent turn', model: 'gpt-5.6-luna',
            reasoning_effort: 'low', speed: 'standard',
          }),
        },
      ))
      expect(activeTurn.status).toBe(409)

      await pool.query(
        `update messages set status = 'completed' where conversation_id = $1`,
        [conversation.id],
      )
      const deleted = await app.handle(new Request(
        `http://localhost/conversations/${conversation.id}`,
        { method: 'DELETE', headers: { cookie: owner.cookie, origin: settings.webOrigin } },
      ))
      expect(deleted.status).toBe(204)
      const missing = await app.handle(new Request(
        `http://localhost/conversations/${conversation.id}`,
        { headers: { cookie: owner.cookie } },
      ))
      expect(missing.status).toBe(404)
    } finally {
      await pool.query('delete from users where id = any($1::uuid[])', [[owner.id, other.id]])
    }
  })

  it('seeds idempotently and continues without sending local IDs to the AI service', async () => {
    const owner = await authenticatedUser('seed-owner')
    const now = new Date()
    let aiInput: Record<string, unknown> | undefined
    const inspectingAi: AiClient = async (input, signal) => {
      aiInput = input
      return ai(input, signal)
    }
    const app = createApp(settings, {
      database,
      sessions: new SessionManager(settings),
      ai: inspectingAi,
      otp: {} as never,
      google: {} as never,
    })

    try {
      const first = await database.transaction((db) => seedApplication(db, {
        email: owner.email,
        now,
      }))
      const second = await database.transaction((db) => seedApplication(db, {
        email: owner.email,
        now: new Date(now.getTime() + 60_000),
      }))
      expect(first.target).toBe('explicit-email')
      expect(second.conversationIds).toEqual(first.conversationIds)

      const conversationIds = Object.values(first.conversationIds)
      const seededRows = await pool.query<{ count: string }>(
        'select count(*) from messages where conversation_id = any($1::uuid[])',
        [conversationIds],
      )
      expect(Number(seededRows.rows[0].count)).toBe(18)

      const conversationId = first.conversationIds['markdown-reference']
      const continued = await app.handle(new Request(
        `http://localhost/conversations/${conversationId}/turns`,
        {
          method: 'POST',
          headers: {
            cookie: owner.cookie,
            origin: settings.webOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: 'Continue this seeded conversation.',
            model: 'gpt-5.6-sol',
            reasoning_effort: 'medium',
            speed: 'standard',
          }),
        },
      ))
      expect(continued.status).toBe(200)
      expect((await parseEvents(continued)).at(-1)?.type).toBe('turn.completed')

      const transcript = aiInput?.messages as Array<Record<string, unknown>>
      expect(transcript).toHaveLength(5)
      expect(transcript.at(-1)).toEqual({
        role: 'user',
        content: 'Continue this seeded conversation.',
      })
      for (const message of transcript) {
        expect(Object.keys(message)).toEqual(['role', 'content'])
        expect(message).not.toHaveProperty('id')
        expect(message).not.toHaveProperty('response_id')
      }

      const detail = await app.handle(new Request(
        `http://localhost/conversations/${conversationId}`,
        { headers: { cookie: owner.cookie } },
      ))
      expect(detail.status).toBe(200)
      const persisted = await detail.json() as { messages: unknown[] }
      expect(persisted.messages).toHaveLength(6)
    } finally {
      await pool.query('delete from users where id = $1', [owner.id])
    }
  })
})
