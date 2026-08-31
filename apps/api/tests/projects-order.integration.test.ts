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

const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
const pool = new Pool({ connectionString: settings.databaseUrl, max: 2, connectionTimeoutMillis: 1_000 })
let database: Database

const cookieValue = (cookie: string) => cookie.split(';', 1)[0]

describe('persistent project ordering', () => {
  beforeAll(async () => {
    database = await Database.create(settings)
    await migrate(drizzle(pool, { schema }), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })
  })
  afterAll(async () => {
    await database.close()
    await pool.end()
  })

  it('persists exact reorder, rejects invalid sets atomically, and preserves order on rename', async () => {
    const sessions = new SessionManager(settings)
    const ownerEmail = `project-order-${randomUUID()}@example.com`
    const otherEmail = `project-order-other-${randomUUID()}@example.com`
    const issued = await database.transaction(async (db) => {
      const auth = new AuthRepository(db)
      const owner = await auth.getOrCreateEmailUser(ownerEmail, { emailVerifiedAt: new Date() })
      const other = await auth.getOrCreateEmailUser(otherEmail, { emailVerifiedAt: new Date() })
      const session = await sessions.issue(auth, owner.id)
      return { owner, other, cookie: cookieValue(sessions.cookie(session.token)) }
    })
    const app = createApp(settings, { database, sessions, otp: {} as never, google: {} as never })
    const request = (path: string, init: RequestInit = {}) => app.handle(new Request(`http://localhost${path}`, {
      ...init,
      headers: { cookie: issued.cookie, origin: settings.webOrigin, 'content-type': 'application/json', ...init.headers },
    }))
    const create = async (name: string, cookie = issued.cookie) => app.handle(new Request('http://localhost/projects', {
      method: 'POST', headers: { cookie, origin: settings.webOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    }))
    try {
      const first = await (await create('First')).json() as { id: string; updated_at: string }
      const second = await (await create('Second')).json() as { id: string }
      const third = await (await create('Third')).json() as { id: string }
      const otherProject = await database.transaction(async (db) => {
        const { ProjectRepository } = await import('../src/db/repository.js')
        return new ProjectRepository(db).create(issued.other.id, 'Foreign', 'foreign')
      })
      const order = [third.id, first.id, second.id]
      const reordered = await request('/projects/order', { method: 'PATCH', body: JSON.stringify({ project_ids: order }) })
      expect(reordered.status).toBe(200)
      const reorderedBody = await reordered.json() as { projects: Array<Record<string, unknown>> }
      expect(reorderedBody).toMatchObject({ projects: [
        { id: third.id, sort_order: 0 }, { id: first.id, sort_order: 1 }, { id: second.id, sort_order: 2 },
      ] })
      const firstOrderUpdatedAt = reorderedBody.projects.find((project) => project.id === first.id)!.order_updated_at
      const invalidSets = [[first.id, first.id, second.id], [first.id, second.id], [first.id, second.id, randomUUID()], [first.id, second.id, otherProject!.id]]
      for (const project_ids of invalidSets) {
        expect((await request('/projects/order', { method: 'PATCH', body: JSON.stringify({ project_ids }) })).status).toBe(409)
      }
      expect((await request('/projects/order', { method: 'PATCH', body: JSON.stringify({ project_ids: order }), headers: { origin: 'https://evil.example' } })).status).toBe(403)
      const newest = await (await create('Newest')).json() as { id: string }
      const withNewest = await (await request('/projects')).json() as { projects: Array<{ id: string; sort_order: number | null }> }
      expect(withNewest.projects.map((project) => project.id)).toEqual([newest.id, ...order])
      expect(withNewest.projects[0].sort_order).toBeNull()
      const renamed = await request(`/projects/${first.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'First renamed' }) })
      expect(renamed.status).toBe(200)
      const reloaded = await (await request('/projects')).json() as { projects: Array<Record<string, unknown>> }
      expect(reloaded.projects.find((project) => project.id === first.id)).toMatchObject({ sort_order: 1, order_updated_at: firstOrderUpdatedAt })
      expect((await request(`/projects/${third.id}`, { method: 'DELETE' })).status).toBe(204)
      expect((await request('/projects/order', { method: 'PATCH', body: JSON.stringify({ project_ids: order }) })).status).toBe(409)
      expect((await request('/projects/order', { method: 'PATCH', body: JSON.stringify({ project_ids: order }), headers: { cookie: 'invalid' } })).status).toBe(401)
    } finally {
      await pool.query('delete from users where id = any($1::uuid[])', [[issued.owner.id, issued.other.id]])
    }
  })
})
