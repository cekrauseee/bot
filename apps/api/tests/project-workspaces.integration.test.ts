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
import { SessionManager } from '../src/modules/auth/sessions.js'
import { AgentRunExecutor, type PublicAgentEvent } from '../src/modules/agent-control-plane.js'
import { projectWorkspacePath } from '../src/modules/projects.js'
import type { AiClient } from '../src/modules/conversations.js'

const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
const pool = new Pool({
  connectionString: settings.databaseUrl,
  max: 2,
  connectionTimeoutMillis: 1_000,
})
let database: Database

const frame = (
  input: Record<string, unknown>,
  sequence: number,
  type: string,
  data: Record<string, unknown>,
) => `event: ${type}\ndata: ${JSON.stringify({
  version: 2,
  sequence,
  run_id: input.run_id,
  turn_id: input.turn_id,
  type,
  data,
})}\n\n`

const providerResponse = (input: Record<string, unknown>) => new Response([
  frame(input, 1, 'turn.started', { model: input.model }),
  frame(input, 2, 'text.delta', { delta: 'Done.' }),
  frame(input, 3, 'turn.completed', { model: input.model }),
].join(''), { headers: { 'content-type': 'text/event-stream' } })

const parseEvents = async (response: Response) => (await response.text())
  .split(/\r?\n\r?\n/)
  .filter(Boolean)
  .map((block) => JSON.parse(
    block.split(/\r?\n/).find((line) => line.startsWith('data:'))!.slice(5).trim(),
  ) as PublicAgentEvent)
const cookieValue = (cookie: string) => cookie.split(';', 1)[0]
const jsonHeaders = { origin: settings.webOrigin, 'content-type': 'application/json' }
type RequestApp = (path: string, init?: RequestInit) => Promise<Response>

async function authenticatedUser(label: string) {
  const sessions = new SessionManager(settings)
  const email = `${label}-${randomUUID()}@example.com`
  const issued = await database.transaction(async (db) => {
    const repository = new AuthRepository(db)
    const owner = await repository.getOrCreateEmailUser(email, { emailVerifiedAt: new Date() })
    const session = await sessions.issue(repository, owner.id)
    return { owner, session }
  })
  return {
    id: issued.owner.id,
    cookie: cookieValue(sessions.cookie(issued.session.token)),
  }
}

function requestFor(executor: AgentRunExecutor, cookie: string): RequestApp {
  const app = createApp(settings, {
    database,
    sessions: new SessionManager(settings),
    agentRuns: executor,
    otp: {} as never,
    google: {} as never,
  })
  return (path, init = {}) => app.handle(new Request(`http://localhost${path}`, {
    ...init,
    headers: { cookie, ...init.headers },
  }))
}

async function createProject(request: RequestApp, name: string) {
  const response = await request('/projects', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ name }),
  })
  expect(response.status).toBe(201)
  const project = await response.json() as { id: string; slug: string; workspace_path: string }
  expect(project.workspace_path).toBe(projectWorkspacePath(project.id, project.slug))
  return project
}

async function assignProject(request: RequestApp, conversationId: string, projectId: string) {
  const response = await request(`/conversations/${conversationId}/project`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ project_id: projectId }),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ id: conversationId, project_id: projectId })
}

async function deleteProject(userId: string, projectId: string) {
  const deleted = await pool.query(
    'delete from projects where id = $1 and user_id = $2',
    [projectId, userId],
  )
  expect(deleted.rowCount).toBe(1)
}

async function startTurn(
  request: RequestApp,
  message: string,
  conversationId?: string,
) {
  const path = conversationId
    ? `/conversations/${conversationId}/turns`
    : '/conversations/turns'
  const response = await request(path, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      message, model: 'gpt-5.6-sol', reasoning_effort: 'medium', speed: 'standard',
    }),
  })
  expect(response.status).toBe(200)
  const events = await parseEvents(response)
  expect(events[0]?.type).toBe('turn.started')
  expect(events.at(-1)?.type).toBe('turn.completed')
  return {
    runId: events[0].run_id,
    conversation: events[0].data.conversation as { id: string; project_id: string | null },
  }
}

async function runWorkspace(userId: string, runId: string) {
  const run = await pool.query<{ working_directory: string; workspace_id: string }>(
    'select working_directory, workspace_id from agent_runs where id = $1 and user_id = $2',
    [runId, userId],
  )
  expect(run.rows).toHaveLength(1)
  return run.rows[0]
}

describe('PostgreSQL project workspace integration', () => {
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

  it('uses /workspace by default and snapshots a project workspace into the next run', async () => {
    const owner = await authenticatedUser('workspace-root')
    const calls: Record<string, unknown>[] = []
    const ai: AiClient = async (input) => {
      calls.push(input)
      return providerResponse(input)
    }
    const executor = new AgentRunExecutor(database, ai)
    const request = requestFor(executor, owner.cookie)

    try {
      const root = await startTurn(request, 'Root')
      const rootWorkspace = await runWorkspace(owner.id, root.runId)
      expect(root.conversation.project_id).toBeNull()
      expect(rootWorkspace.working_directory).toBe('/workspace')
      expect(calls[0]).toMatchObject({ version: 2, ...rootWorkspace })

      const project = await createProject(request, 'Café 🚀')
      await assignProject(request, root.conversation.id, project.id)
      const next = await startTurn(request, 'Project', root.conversation.id)
      const projectWorkspace = {
        working_directory: project.workspace_path,
        workspace_id: rootWorkspace.workspace_id,
      }
      expect(await runWorkspace(owner.id, next.runId)).toEqual(projectWorkspace)
      expect(calls).toHaveLength(2)
      expect(calls[1]).toMatchObject({ version: 2, ...projectWorkspace })
    } finally {
      await executor.close()
      await pool.query('delete from users where id = $1', [owner.id])
    }
  })

  it('keeps completed run directories stable while moves, renames, and deletion happen', async () => {
    const owner = await authenticatedUser('workspace-durable')
    const calls: Record<string, unknown>[] = []
    const ai: AiClient = async (input) => {
      calls.push(input)
      return providerResponse(input)
    }
    let executor = new AgentRunExecutor(database, ai)
    let request = requestFor(executor, owner.cookie)

    try {
      const first = await createProject(request, 'Alpha')
      const second = await createProject(request, 'Beta')
      const root = await startTurn(request, 'Start')
      const conversationId = root.conversation.id
      const workspaceId = (await runWorkspace(owner.id, root.runId)).workspace_id
      await assignProject(request, conversationId, first.id)
      const firstRun = await startTurn(request, 'Use Alpha', conversationId)
      const firstWorkspace = {
        working_directory: first.workspace_path,
        workspace_id: workspaceId,
      }
      expect(calls[1]).toMatchObject({ version: 2, ...firstWorkspace })

      await assignProject(request, conversationId, second.id)
      const renamed = await pool.query<{ workspace_path: string }>(
        `update projects set name = $1, slug = $2
         where id = $3 and user_id = $4 returning workspace_path`,
        ['Alpha renamed', 'alpha-renamed', first.id, owner.id],
      )
      expect(renamed.rows).toEqual([{ workspace_path: first.workspace_path }])
      await deleteProject(owner.id, first.id)
      expect(await runWorkspace(owner.id, firstRun.runId)).toEqual(firstWorkspace)

      await executor.close()
      executor = new AgentRunExecutor(database, ai)
      request = requestFor(executor, owner.cookie)

      const recreated = await createProject(request, 'Alpha renamed')
      expect(recreated.id).not.toBe(first.id)
      expect(recreated.workspace_path).not.toBe(first.workspace_path)
      const moved = await startTurn(request, 'Follow Beta', conversationId)
      const secondWorkspace = {
        working_directory: second.workspace_path,
        workspace_id: workspaceId,
      }
      expect(await runWorkspace(owner.id, moved.runId)).toEqual(secondWorkspace)
      expect(calls[2]).toMatchObject({ version: 2, ...secondWorkspace })

      await deleteProject(owner.id, second.id)
      expect(await runWorkspace(owner.id, moved.runId)).toEqual(secondWorkspace)
      const next = await startTurn(request, 'Root again', conversationId)
      const rootWorkspace = { working_directory: '/workspace', workspace_id: workspaceId }
      expect(next.conversation.project_id).toBeNull()
      expect(await runWorkspace(owner.id, next.runId)).toEqual(rootWorkspace)
      expect(calls).toHaveLength(4)
      expect(calls[3]).toMatchObject({ version: 2, ...rootWorkspace })
    } finally {
      await executor.close()
      await pool.query('delete from users where id = $1', [owner.id])
    }
  })
})
