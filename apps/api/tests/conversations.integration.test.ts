import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { loadSettings } from '../src/config.js'
import { Database } from '../src/db/database.js'
import { AgentRunRepository, AuthRepository } from '../src/db/repository.js'
import { schema } from '../src/db/schema.js'
import { seedApplication } from '../src/db/seeder.js'
import { SessionManager } from '../src/modules/auth/sessions.js'
import { AgentRunExecutor } from '../src/modules/agent-control-plane.js'
import type { AiClient } from '../src/modules/conversations.js'

const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
const pool = new Pool({
  connectionString: settings.databaseUrl,
  max: 2,
  connectionTimeoutMillis: 1_000,
})
let database: Database

const providerFrame = (
  runId: string,
  turnId: string,
  sequence: number,
  type: string,
  data: Record<string, unknown>,
) => `event: ${type}\ndata: ${JSON.stringify({
  version: 2,
  sequence,
  run_id: runId,
  turn_id: turnId,
  type,
  data,
})}\n\n`

const ai: AiClient = async (input) => {
  const runId = String(input.run_id)
  const turnId = String(input.turn_id)
  return new Response([
    providerFrame(runId, turnId, 1, 'turn.started', { model: input.model }),
    providerFrame(runId, turnId, 2, 'reasoning.delta', { delta: 'Checked the request.' }),
    providerFrame(runId, turnId, 3, 'step.started', {
      step: {
        id: 'search-1', kind: 'web_search', status: 'in_progress',
        label: 'Web search', query: 'current source',
      },
    }),
    providerFrame(runId, turnId, 4, 'step.completed', {
      step: {
        id: 'search-1', kind: 'web_search', status: 'completed',
        label: 'Web search', query: 'current source',
        sources: [{ title: 'Example', url: 'https://example.com/source' }],
      },
    }),
    providerFrame(runId, turnId, 5, 'browser.frame', {
      frame: {
        base64: 'cG5n', mime_type: 'image/png', captured_at: '2026-08-30T17:00:00Z',
      },
    }),
    providerFrame(runId, turnId, 6, 'text.delta', {
      delta: 'A **streamed** answer.\n\n```ts\nconst ready = true\n```',
    }),
    providerFrame(runId, turnId, 7, 'turn.completed', { model: input.model }),
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
      const persistedFrames = await pool.query<{ count: string }>(
        `select count(*) from agent_events e
         join agent_runs r on r.id = e.run_id
         where r.conversation_id = $1 and e.type = 'browser.frame'`,
        [conversation.id],
      )
      expect(Number(persistedFrames.rows[0].count)).toBe(0)

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
      expect(Number(seededRows.rows[0].count)).toBe(336)

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
      expect(transcript).toHaveLength(7)
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
      expect(persisted.messages).toHaveLength(8)
    } finally {
      await pool.query('delete from users where id = $1', [owner.id])
    }
  })

  it('terminalizes cancellation once when execution and recovery race', async () => {
    const owner = await authenticatedUser('agent-cancel-owner')
    const cancellableAi: AiClient = async (input, signal) => {
      const encoder = new TextEncoder()
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(providerFrame(
            String(input.run_id), String(input.turn_id), 1,
            'turn.started', { model: input.model },
          )))
          const abort = () => controller.error(new Error('aborted'))
          if (signal.aborted) abort()
          else signal.addEventListener('abort', abort, { once: true })
        },
      }), { headers: { 'content-type': 'text/event-stream' } })
    }
    const executor = new AgentRunExecutor(database, cancellableAi)
    const app = createApp(settings, {
      database,
      sessions: new SessionManager(settings),
      agentRuns: executor,
      otp: {} as never,
      google: {} as never,
    })
    const request = (path: string, init: RequestInit = {}) => app.handle(new Request(
      `http://localhost${path}`,
      { ...init, headers: { cookie: owner.cookie, ...init.headers } },
    ))

    try {
      const started = await request('/conversations/turns', {
        method: 'POST',
        headers: { origin: settings.webOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Cancel this run', model: 'gpt-5.6-luna',
          reasoning_effort: 'medium', speed: 'standard',
        }),
      })
      expect(started.status).toBe(200)
      const created = await pool.query<{ id: string }>(
        'select id from agent_runs where user_id = $1 order by created_at desc limit 1', [owner.id],
      )
      const runId = created.rows[0].id
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const state = await request(`/agent-runs/${runId}`)
        if ((await state.json() as { status: string }).status === 'running') break
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      const cancelled = await request(`/agent-runs/${runId}/cancel`, {
        method: 'POST',
        headers: { origin: settings.webOrigin },
      })
      expect(cancelled.status).toBe(202)
      await Promise.all([executor.recover(), executor.recover(), executor.recover()])

      let finalStatus = ''
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const state = await request(`/agent-runs/${runId}`)
        finalStatus = (await state.json() as { status: string }).status
        if (finalStatus === 'cancelled') break
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(finalStatus).toBe('cancelled')
      await executor.recover()
      const terminalEvents = await pool.query<{ count: string }>(
        `select count(*) from agent_events
         where run_id = $1 and type = 'turn.failed' and data #>> '{error,code}' = 'cancelled'`,
        [runId],
      )
      expect(Number(terminalEvents.rows[0].count)).toBe(1)
    } finally {
      await executor.close()
      await pool.query('delete from users where id = $1', [owner.id])
    }
  })

  it('validates model capabilities and durably pauses, replays, and resumes an AI v2 run', async () => {
    const owner = await authenticatedUser('agent-run-owner')
    const calls: Record<string, unknown>[] = []
    let releaseResumed!: () => void
    const resumedGate = new Promise<void>((resolve) => { releaseResumed = resolve })
    const v2Ai: AiClient = async (input) => {
      calls.push(input)
      const runId = String(input.run_id)
      const turnId = String(input.turn_id)
      const v2Frame = (sequence: number, type: string, data: Record<string, unknown>) =>
        `event: ${type}\ndata: ${JSON.stringify({
          version: 2, sequence, run_id: runId, turn_id: turnId, type, data,
        })}\n\n`
      const resumed = input.resume !== undefined
      if (resumed) {
        const encoder = new TextEncoder()
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode([
              v2Frame(1, 'turn.started', {
                model: input.model,
                checkpoint: {
                  id: 'checkpoint-after-resume',
                  phase: 'runnable',
                  content: 'Waiting. Recovered.',
                  pending_question: null,
                  resume_consumed: true,
                },
              }),
              v2Frame(2, 'text.delta', { delta: ' Resumed.' }),
            ].join('')))
            void resumedGate.then(() => {
              controller.enqueue(encoder.encode(v2Frame(3, 'turn.completed', { model: input.model })))
              controller.close()
            })
          },
        }), { headers: { 'content-type': 'text/event-stream' } })
      }
      return new Response([
            v2Frame(1, 'turn.started', { model: input.model }),
            v2Frame(2, 'plan.updated', {
              plan: [{ id: 'inspect', title: 'Inspect the task', status: 'in_progress' }],
            }),
            v2Frame(3, 'text.delta', { delta: 'Waiting.' }),
            v2Frame(4, 'user.input_required', {
              question: { question_id: 'question-1', prompt: 'Continue?' },
            }),
          ].join(''), {
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    const app = createApp(settings, {
      database,
      sessions: new SessionManager(settings),
      ai: v2Ai,
      otp: {} as never,
      google: {} as never,
    })
    const request = (path: string, init: RequestInit = {}) => app.handle(new Request(
      `http://localhost${path}`,
      { ...init, headers: { cookie: owner.cookie, ...init.headers } },
    ))

    try {
      const catalog = await request('/models')
      expect(catalog.status).toBe(200)
      expect(await catalog.json()).toMatchObject({
        models: [
          { id: 'gpt-5.6-sol', provider: 'openai' },
          { id: 'gpt-5.6-terra', provider: 'openai' },
          { id: 'gpt-5.6-luna', provider: 'openai' },
          { id: 'grok-4.6', provider: 'xai' },
          { id: 'grok-4.3', provider: 'xai' },
        ],
      })

      const invalid = await request('/conversations/turns', {
        method: 'POST',
        headers: { origin: settings.webOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Must not create a run', model: 'grok-4.6',
          reasoning_effort: 'high', speed: 'fast',
        }),
      })
      expect(invalid.status).toBe(400)
      const invalidRuns = await pool.query<{ count: string }>(
        'select count(*) from agent_runs where user_id = $1', [owner.id],
      )
      expect(Number(invalidRuns.rows[0].count)).toBe(0)

      const started = await request('/conversations/turns', {
        method: 'POST',
        headers: { origin: settings.webOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Pause for input', model: 'grok-4.6',
          reasoning_effort: 'high', speed: 'standard',
        }),
      })
      const initial = await parseEvents(started) as Array<{
        sequence: string; run_id: string; type: string; data: Record<string, unknown>
      }>
      expect(initial.map((event) => event.type)).toEqual([
        'turn.started', 'plan.updated', 'text.delta', 'user.input_required',
      ])
      expect(initial.every((event) => event.run_id === initial[0].run_id)).toBe(true)
      expect(initial.map((event) => BigInt(event.sequence))).toEqual(
        [...initial].map((event) => BigInt(event.sequence)).sort((left, right) => left < right ? -1 : 1),
      )
      const runId = initial[0].run_id

      const waiting = await request(`/agent-runs/${runId}`)
      const waitingState = await waiting.json() as {
        workspace_id: string
        conversation_id: string
        turn_id: string
        status: string
        last_event_sequence: string
      }
      expect(waitingState).toMatchObject({
        status: 'waiting',
        model: 'grok-4.6',
        provider: 'xai',
        reasoning_effort: 'high',
        speed: 'standard',
        plan: [{ id: 'inspect', title: 'Inspect the task', status: 'in_progress' }],
        pending_question: { question_id: 'question-1', prompt: 'Continue?' },
      })
      const staleClaim = await database.transaction((db) => new AgentRunRepository(db).get(runId))
      expect(staleClaim?.executionToken).toMatch(/^[0-9a-f-]{36}$/)

      const conversationWhileWaiting = await request(`/conversations/${waitingState.conversation_id}`)
      expect(await conversationWhileWaiting.json()).toMatchObject({
        active_run: {
          id: runId,
          turn_id: waitingState.turn_id,
          status: 'waiting',
          last_event_sequence: waitingState.last_event_sequence,
          plan: [{ id: 'inspect', title: 'Inspect the task', status: 'in_progress' }],
          pending_question: { question_id: 'question-1', prompt: 'Continue?' },
          browser_projection: null,
          model: 'grok-4.6',
          provider: 'xai',
          reasoning_effort: 'high',
          speed: 'standard',
        },
      })

      const replay = await request(`/agent-runs/${runId}/events?after=${initial[0].sequence}`)
      const replayBody = await replay.json() as {
        events: Array<{ type: string }>
        has_more: boolean
        next_cursor: string
      }
      expect(replayBody.events.map((event) => event.type)).toEqual([
        'plan.updated', 'text.delta', 'user.input_required',
      ])
      expect(replayBody.has_more).toBe(false)
      expect(BigInt(replayBody.next_cursor)).toBeGreaterThan(BigInt(initial[0].sequence))

      const answer = ['Yes', 'Use staging']
      const resumed = await request(`/agent-runs/${runId}/resume`, {
        method: 'POST',
        headers: { origin: settings.webOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ question_id: 'question-1', answer }),
      })
      expect(resumed.status).toBe(202)
      const retriedResume = await request(`/agent-runs/${runId}/resume`, {
        method: 'POST',
        headers: { origin: settings.webOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ question_id: 'question-1', answer }),
      })
      expect(retriedResume.status).toBe(202)

      let runningState: { status: string } | undefined
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const response = await request(`/agent-runs/${runId}`)
        runningState = await response.json() as { status: string }
        if (runningState.status === 'running') break
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(runningState).toMatchObject({ status: 'running' })
      const currentClaim = await database.transaction((db) => new AgentRunRepository(db).get(runId))
      expect(currentClaim?.executionToken).not.toBe(staleClaim!.executionToken)
      expect(await database.transaction((db) =>
        new AgentRunRepository(db).renewLease(runId, staleClaim!.executionToken!))).toBeUndefined()
      await expect(database.transaction((db) =>
        new AgentRunRepository(db).appendEvent(staleClaim!, 'text.delta', { delta: 'stale' })))
        .rejects.toThrow('agent_run_lease_lost')
      await expect(database.transaction((db) =>
        new AgentRunRepository(db).setAssistant(staleClaim!, { content: 'stale' })))
        .rejects.toThrow('agent_run_lease_lost')

      releaseResumed()
      let completed: Response | undefined
      for (let attempt = 0; attempt < 50; attempt += 1) {
        completed = await request(`/agent-runs/${runId}`)
        const state = await completed.clone().json() as { status: string }
        if (state.status === 'completed') break
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(await completed!.json()).toMatchObject({ status: 'completed' })
      const reloaded = await request(`/conversations/${waitingState.conversation_id}`)
      expect(await reloaded.json()).toMatchObject({
        plan: [{ id: 'inspect', title: 'Inspect the task', status: 'in_progress' }],
        active_run: null,
      })
      expect(calls).toHaveLength(2)
      expect(calls[0]).toMatchObject({
        version: 2,
        run_id: runId,
        workspace_id: waitingState.workspace_id,
        model: 'grok-4.6',
        reasoning_effort: 'high',
        speed: 'standard',
      })
      expect(calls[1]).toMatchObject({
        version: 2,
        run_id: runId,
        workspace_id: waitingState.workspace_id,
        resume: { question_id: 'question-1', answer },
      })
      expect(calls[1].messages).toEqual(expect.arrayContaining([
        { role: 'user', content: '- Yes\n- Use staging' },
      ]))

      const persistedResume = await pool.query<{
        resume_input: null
        execution_token: string
      }>('select resume_input, execution_token from agent_runs where id = $1', [runId])
      expect(persistedResume.rows[0].resume_input).toBeNull()
      expect(persistedResume.rows[0].execution_token).not.toBe(staleClaim!.executionToken)
      const reconciled = await pool.query<{
        reconciled_checkpoint_id: string
        content: string
      }>(
        `select r.reconciled_checkpoint_id, m.content
         from agent_runs r join messages m on m.id = r.assistant_message_id
         where r.id = $1`,
        [runId],
      )
      expect(reconciled.rows[0]).toEqual({
        reconciled_checkpoint_id: 'checkpoint-after-resume',
        content: 'Waiting. Recovered. Resumed.',
      })
      const resumedMessages = await pool.query<{ content: string }>(
        `select content from messages
         where conversation_id = $1 and role = 'user'
         order by created_at, id`,
        [waitingState.conversation_id],
      )
      expect(resumedMessages.rows.map(({ content }) => content)).toEqual([
        'Pause for input',
        '- Yes\n- Use staging',
      ])

      const nextTurn = await request(`/conversations/${waitingState.conversation_id}/turns`, {
        method: 'POST',
        headers: { origin: settings.webOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Continue the task', model: 'grok-4.6',
          reasoning_effort: 'high', speed: 'standard',
        }),
      })
      expect(nextTurn.status).toBe(200)
      const nextTurnEvents = await parseEvents(nextTurn)
      expect(nextTurnEvents[0].data.plan).toEqual([{
        id: 'inspect', title: 'Inspect the task', status: 'in_progress',
      }])
      expect(calls).toHaveLength(3)
      expect(calls[2].task_plan).toEqual([{
        id: 'inspect', title: 'Inspect the task', status: 'in_progress',
      }])

      const replayStart = BigInt((await pool.query<{ sequence: string }>(
        'select max(sequence)::text as sequence from agent_events where run_id = $1', [runId],
      )).rows[0].sequence)
      await pool.query(
        `insert into agent_events (run_id, turn_id, type, data)
         select $1, $2, 'step.updated', jsonb_build_object('index', value)
         from generate_series(1, 1005) as value`,
        [runId, waitingState.turn_id],
      )
      await pool.query(
        `update agent_runs set last_event_sequence = (
           select max(sequence) from agent_events where run_id = $1
         ) where id = $1`,
        [runId],
      )
      const firstPage = await request(`/agent-runs/${runId}/events?after=${replayStart}`)
      const firstPageBody = await firstPage.json() as {
        events: Array<{ sequence: string }>
        has_more: boolean
        next_cursor: string
      }
      expect(firstPageBody.events).toHaveLength(1000)
      expect(firstPageBody.has_more).toBe(true)
      expect(firstPageBody.next_cursor).toBe(firstPageBody.events.at(-1)?.sequence)
      const secondPage = await request(
        `/agent-runs/${runId}/events?after=${firstPageBody.next_cursor}`,
      )
      const secondPageBody = await secondPage.json() as {
        events: Array<{ sequence: string }>
        has_more: boolean
        next_cursor: string
      }
      expect(secondPageBody.events).toHaveLength(5)
      expect(secondPageBody.has_more).toBe(false)
    } finally {
      await pool.query('delete from users where id = $1', [owner.id])
    }
  })
})
