import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { loadSettings } from '../src/config.js'
import { Database } from '../src/db/database.js'
import { AuthRepository, ConversationRepository, ProjectRepository } from '../src/db/repository.js'
import { schema } from '../src/db/schema.js'
import { seedApplication } from '../src/db/seeder.js'
import { seedConversations } from '../src/db/seed-data.js'
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

  it('retries only the latest owned failed response without duplicating its prompt', async () => {
    const owner = await authenticatedUser('retry-owner')
    const other = await authenticatedUser('retry-other')
    let attempts = 0
    const retryAi: AiClient = async (input, signal) => {
      attempts += 1
      if (attempts > 1) return ai(input, signal)
      return new Response([
        providerFrame(String(input.turn_id), 0, 'turn.started', {}),
        providerFrame(String(input.turn_id), 1, 'turn.failed', {
          error: { code: 'provider_error', message: 'Temporary provider failure.', retryable: true },
        }),
      ].join(''))
    }
    const app = createApp(settings, {
      database, sessions: new SessionManager(settings), ai: retryAi,
      otp: {} as never, google: {} as never,
    })
    const input = { message: 'Keep this question once', model: 'gpt-5.6-sol', reasoning_effort: 'medium', speed: 'standard' }
    const post = (path: string, body: object, cookie = owner.cookie) => app.handle(new Request(`http://localhost${path}`, {
      method: 'POST', headers: { cookie, origin: settings.webOrigin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }))
    try {
      const first = await parseEvents(await post('/conversations/turns', input))
      expect(first.at(-1)?.type).toBe('turn.failed')
      const id = (first[0].data.conversation as { id: string }).id
      const assistantId = (first[0].data.assistant_message as { id: string }).id
      const retry = { ...input, retry_of: assistantId }
      const path = `/conversations/${id}/turns`
      expect((await post(path, retry, other.cookie)).status).toBe(404)
      expect((await post(path, { ...retry, message: 'A different question' })).status).toBe(409)
      const retried = await post(path, retry)
      expect(retried.status).toBe(200)
      const events = await parseEvents(retried)
      expect(events.at(-1)?.type).toBe('turn.completed')
      expect((events[0].data.assistant_message as { id: string }).id).toBe(assistantId)
      const detail = await app.handle(new Request(`http://localhost/conversations/${id}`, { headers: { cookie: owner.cookie } }))
      const stored = await detail.json() as { messages: Array<{ role: string; content: string; status: string }> }
      expect(stored.messages).toHaveLength(2)
      expect(stored.messages[0]).toMatchObject({ role: 'user', content: input.message })
      expect(stored.messages[1]).toMatchObject({ role: 'assistant', status: 'completed' })
      expect((await post(path, retry)).status).toBe(409)
      expect(attempts).toBe(2)
    } finally {
      await pool.query('delete from users where id = any($1::uuid[])', [[owner.id, other.id]])
    }
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
        activities: [
          {
            id: 'reasoning-2', type: 'text', content: 'Checked the request.', lastSequence: 2,
          },
          {
            id: 'search-1',
            type: 'search',
            query: 'current source',
            results: [{ title: 'Example', domain: 'example.com' }],
          },
        ],
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

  it('creates user-owned projects and moves conversations between them', async () => {
    const owner = await authenticatedUser('project-owner')
    const other = await authenticatedUser('project-other')
    const app = createApp(settings, {
      database,
      sessions: new SessionManager(settings),
      ai,
      otp: {} as never,
      google: {} as never,
    })

    try {
      expect((await app.handle(new Request('http://localhost/projects'))).status).toBe(401)

      const started = await app.handle(new Request('http://localhost/conversations/turns', {
        method: 'POST',
        headers: {
          cookie: owner.cookie,
          origin: settings.webOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Conversation ready to group',
          model: 'gpt-5.6-sol',
          reasoning_effort: 'medium',
          speed: 'standard',
        }),
      }))
      const conversation = (await parseEvents(started))[0].data.conversation as {
        id: string
        project_id: string | null
      }
      expect(conversation.project_id).toBeNull()

      const create = (name: string, cookie = owner.cookie) => app.handle(new Request(
        'http://localhost/projects',
        {
          method: 'POST',
          headers: {
            cookie,
            origin: settings.webOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name }),
        },
      ))
      const firstResponse = await create('  Résumé   Review  ')
      expect(firstResponse.status).toBe(201)
      const first = await firstResponse.json() as { id: string; name: string; slug: string }
      expect(first).toMatchObject({ name: 'Résumé Review', slug: 'resume-review' })
      expect((await create('Résumé Review')).status).toBe(409)

      const otherProjectResponse = await create('Private project', other.cookie)
      const otherProject = await otherProjectResponse.json() as { id: string }

      const assign = (projectId: string | null) => app.handle(new Request(
        `http://localhost/conversations/${conversation.id}/project`,
        {
          method: 'PATCH',
          headers: {
            cookie: owner.cookie,
            origin: settings.webOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ project_id: projectId }),
        },
      ))

      expect((await assign(otherProject.id)).status).toBe(404)
      const firstMove = await assign(first.id)
      expect(firstMove.status).toBe(200)
      expect(await firstMove.json()).toMatchObject({
        id: conversation.id,
        project_id: first.id,
      })

      const secondResponse = await create('Release planning')
      const second = await secondResponse.json() as { id: string }
      const secondMove = await assign(second.id)
      expect(secondMove.status).toBe(200)
      expect(await secondMove.json()).toMatchObject({ project_id: second.id })

      const recentMove = await assign(null)
      expect(recentMove.status).toBe(200)
      expect(await recentMove.json()).toMatchObject({ project_id: null })

      const projects = await app.handle(new Request('http://localhost/projects', {
        headers: { cookie: owner.cookie },
      }))
      expect(projects.status).toBe(200)
      expect(await projects.json()).toMatchObject({
        projects: [
          { id: second.id, name: 'Release planning', slug: 'release-planning' },
          { id: first.id, name: 'Résumé Review', slug: 'resume-review' },
        ],
      })

      const conversations = await app.handle(new Request('http://localhost/conversations', {
        headers: { cookie: owner.cookie },
      }))
      expect(await conversations.json()).toMatchObject({
        conversations: [{ id: conversation.id, project_id: null }],
      })

      const renamed = await app.handle(new Request(
        `http://localhost/projects/${first.id}`,
        {
          method: 'PATCH',
          headers: {
            cookie: owner.cookie,
            origin: settings.webOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: '  Product   Review  ' }),
        },
      ))
      expect(renamed.status).toBe(200)
      expect(await renamed.json()).toMatchObject({
        id: first.id, name: 'Product Review', slug: 'product-review',
      })

      const collision = await app.handle(new Request(
        `http://localhost/projects/${first.id}`,
        {
          method: 'PATCH',
          headers: {
            cookie: owner.cookie,
            origin: settings.webOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: 'Release planning' }),
        },
      ))
      expect(collision.status).toBe(409)
      expect(await collision.json()).toMatchObject({ detail: { code: 'project_exists' } })

      const hiddenRename = await app.handle(new Request(
        `http://localhost/projects/${first.id}`,
        {
          method: 'PATCH',
          headers: {
            cookie: other.cookie,
            origin: settings.webOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: 'Hidden rename' }),
        },
      ))
      expect(hiddenRename.status).toBe(404)

      const moved = await assign(first.id)
      expect(moved.status).toBe(200)
      const deletedProject = await app.handle(new Request(
        `http://localhost/projects/${first.id}`,
        { method: 'DELETE', headers: { cookie: owner.cookie, origin: settings.webOrigin } },
      ))
      expect(deletedProject.status).toBe(204)
      const preserved = await app.handle(new Request(
        `http://localhost/conversations/${conversation.id}`,
        { headers: { cookie: owner.cookie } },
      ))
      expect(preserved.status).toBe(200)
      expect(await preserved.json()).toMatchObject({ project_id: null })

      const hiddenDelete = await app.handle(new Request(
        `http://localhost/projects/${second.id}`,
        { method: 'DELETE', headers: { cookie: other.cookie, origin: settings.webOrigin } },
      ))
      expect(hiddenDelete.status).toBe(404)
    } finally {
      await pool.query('delete from users where id = any($1::uuid[])', [[owner.id, other.id]])
    }
  })

  it('seeds idempotently and continues without sending local IDs to the AI service', async () => {
    const owner = await authenticatedUser('seed-owner')
    // Both seed passes must precede the real turn created below.
    const now = new Date(Date.now() - 86_400_000)
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
      expect(Number(seededRows.rows[0].count)).toBe(first.messageCount)

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
      const seededMessages = seedConversations.find((conversation) => conversation.key === 'markdown-reference')!.messages
      expect(transcript.slice(0, -1)).toEqual(seededMessages.map(({ role, content }) => ({ role, content })))
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
      expect(persisted.messages).toHaveLength(seededMessages.length + 2)
    } finally {
      await pool.query('delete from users where id = $1', [owner.id])
    }
  })

  it('persists pin state and order without changing recency or project ownership', async () => {
    const owner = await authenticatedUser('pin-owner')
    const other = await authenticatedUser('pin-other')
    const app = createApp(settings, { database, sessions: new SessionManager(settings), ai, otp: {} as never, google: {} as never })
    const created = await database.transaction(async (db) => {
      const conversations = new ConversationRepository(db)
      const projects = new ProjectRepository(db)
      const project = await projects.create(owner.id, 'Pinned project', 'pinned-project')
      const first = await conversations.create(owner.id, 'First pinned')
      const second = await conversations.create(owner.id, 'Second pinned')
      const third = await conversations.create(owner.id, 'Third pinned')
      const fourth = await conversations.create(owner.id, 'Fourth pinned')
      const foreignUser = await new AuthRepository(db).findUserByEmail(other.email)
      const foreign = await conversations.create(foreignUser!.id, 'Foreign conversation')
      await conversations.assignProject(owner.id, first.id, project!.id)
      return { first, second, third, fourth, foreign, project: project! }
    })
    try {
      const patch = (path: string, body: object, cookie = owner.cookie, origin = settings.webOrigin) => app.handle(new Request(`http://localhost${path}`, {
        method: 'PATCH', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
      }))
      const firstBefore = created.first.updatedAt.toISOString()
      const firstPinned = await patch(`/conversations/${created.first.id}/pin`, { pinned: true })
      expect(firstPinned.status).toBe(200)
      const firstPinTimestamp = (await firstPinned.json() as Record<string, unknown>).pin_updated_at
      const secondPinned = await patch(`/conversations/${created.second.id}/pin`, { pinned: true })
      expect(secondPinned.status).toBe(200)
      const secondPinTimestamp = (await secondPinned.json() as Record<string, unknown>).pin_updated_at
      expect(firstPinTimestamp).toEqual(expect.any(String))
      expect(secondPinTimestamp).toEqual(expect.any(String))
      expect((await patch(`/conversations/${created.third.id}/pin`, { pinned: true }, owner.cookie, 'https://evil.example')).status).toBe(403)
      const concurrent = await Promise.all([
        patch(`/conversations/${created.third.id}/pin`, { pinned: true }),
        patch(`/conversations/${created.fourth.id}/pin`, { pinned: true }),
      ])
      expect(concurrent.map((response) => response.status)).toEqual([200, 200])
      const firstPin = await (await app.handle(new Request('http://localhost/conversations', { headers: { cookie: owner.cookie } }))).json() as { conversations: Array<Record<string, unknown>> }
      expect(firstPin.conversations.find((row) => row.id === created.first.id)).toMatchObject({
        pinned_order: 1, project_id: created.project.id, updated_at: firstBefore,
      })
      const invalid = await patch('/conversations/pinned-order', { conversation_ids: [created.first.id] })
      expect(invalid.status).toBe(409)
      const beforeInvalid = firstPin.conversations.map((row) => [row.id, row.pinned_order])
      for (const ids of [
        [created.first.id, created.first.id, created.second.id, created.third.id, created.fourth.id],
        [created.first.id, created.foreign.id, created.second.id, created.third.id, created.fourth.id],
        [created.first.id, created.second.id, created.third.id, created.fourth.id, randomUUID()],
      ]) {
        expect((await patch('/conversations/pinned-order', { conversation_ids: ids })).status).toBe(409)
      }
      const afterInvalid = await (await app.handle(new Request('http://localhost/conversations', { headers: { cookie: owner.cookie } }))).json() as { conversations: Array<Record<string, unknown>> }
      expect(afterInvalid.conversations.map((row) => [row.id, row.pinned_order])).toEqual(beforeInvalid)
      expect((await patch(`/conversations/${created.first.id}/project`, { project_id: created.project.id })).status).toBe(409)
      expect((await patch(`/conversations/${created.first.id}/project`, { project_id: null })).status).toBe(409)
      expect((await patch('/conversations/pinned-order', { conversation_ids: [created.first.id, created.second.id, created.third.id, created.fourth.id] }, owner.cookie, 'https://evil.example')).status).toBe(403)
      const idempotent = await patch(`/conversations/${created.first.id}/pin`, { pinned: true })
      expect((await idempotent.json() as Record<string, unknown>).pin_updated_at).toBe(firstPinTimestamp)
      const reordered = await patch('/conversations/pinned-order', { conversation_ids: [created.second.id, created.first.id] })
      expect(reordered.status).toBe(409)
      const reorderedAll = await patch('/conversations/pinned-order', { conversation_ids: [created.second.id, created.first.id, created.fourth.id, created.third.id] })
      expect(await reorderedAll.json()).toMatchObject({ conversations: [
        { id: created.second.id, pinned_order: 1 }, { id: created.first.id, pinned_order: 2 },
        { id: created.fourth.id, pinned_order: 3 }, { id: created.third.id, pinned_order: 4 },
      ] })
      expect((await patch(`/conversations/${created.first.id}/pin`, { pinned: false })).status).toBe(200)
      const unpinned = await (await app.handle(new Request(`http://localhost/conversations/${created.first.id}`, { headers: { cookie: owner.cookie } }))).json() as Record<string, unknown>
      expect(new Date(String(unpinned.pin_updated_at)).getTime()).toBeGreaterThan(new Date(String(firstPinTimestamp)).getTime())
      const reloaded = await (await app.handle(new Request(`http://localhost/conversations/${created.first.id}`, { headers: { cookie: owner.cookie } }))).json() as Record<string, unknown>
      expect(reloaded).toMatchObject({ pinned_order: null, project_id: created.project.id, updated_at: firstBefore })
      expect((await patch(`/conversations/${created.first.id}/pin`, { pinned: true }, other.cookie)).status).toBe(404)
    } finally {
      await pool.query('delete from users where id = any($1::uuid[])', [[owner.id, other.id]])
    }
  })

  it('renames an owned conversation with a monotonic title clock', async () => {
    const owner = await authenticatedUser('rename-owner')
    const other = await authenticatedUser('rename-other')
    const app = createApp(settings, { database, sessions: new SessionManager(settings), ai, otp: {} as never, google: {} as never })
    const created = await database.transaction(async (db) => {
      const conversations = new ConversationRepository(db)
      const projects = new ProjectRepository(db)
      const project = await projects.create(owner.id, 'Rename project', 'rename-project')
      const conversation = await conversations.create(owner.id, 'Original title')
      await conversations.assignProject(owner.id, conversation.id, project!.id)
      return { conversation, project: project! }
    })
    const patch = (cookie: string, origin: string, title: string) => app.handle(new Request(`http://localhost/conversations/${created.conversation.id}`, {
      method: 'PATCH', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({ title }),
    }))
    try {
      const before = created.conversation.updatedAt.toISOString()
      expect((await patch(owner.cookie, settings.webOrigin, '   A   normalized   title   ')).status).toBe(200)
      const renamed = await (await app.handle(new Request(`http://localhost/conversations/${created.conversation.id}`, { headers: { cookie: owner.cookie } }))).json() as Record<string, unknown>
      expect(renamed).toMatchObject({ title: 'A normalized title', project_id: created.project.id, pinned_order: null, updated_at: before })
      const clock = renamed.title_updated_at
      expect((await patch(owner.cookie, settings.webOrigin, 'A normalized title')).status).toBe(200)
      const same = await (await app.handle(new Request(`http://localhost/conversations/${created.conversation.id}`, { headers: { cookie: owner.cookie } }))).json() as Record<string, unknown>
      expect(same.title_updated_at).toBe(clock)
      expect((await patch(owner.cookie, settings.webOrigin, '   ')).status).toBe(400)
      expect((await patch(owner.cookie, settings.webOrigin, 'x'.repeat(121))).status).toBe(422)
      expect((await patch(other.cookie, settings.webOrigin, 'Other')).status).toBe(404)
      expect((await patch(owner.cookie, 'https://evil.example', 'CSRF')).status).toBe(403)
      expect((await app.handle(new Request(`http://localhost/conversations/${created.conversation.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Unauthenticated' }) }))).status).toBe(401)
      await patch(owner.cookie, settings.webOrigin, 'Second title')
      const later = await (await app.handle(new Request(`http://localhost/conversations/${created.conversation.id}`, { headers: { cookie: owner.cookie } }))).json() as Record<string, unknown>
      expect(new Date(String(later.title_updated_at)).getTime()).toBeGreaterThan(new Date(String(clock)).getTime())
    } finally {
      await pool.query('delete from users where id = any($1::uuid[])', [[owner.id, other.id]])
    }
  })
})
