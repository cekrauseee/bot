import { readFile } from 'node:fs/promises'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { loadSettings } from '../src/config.js'
import { checkDatabase } from '../src/db/check.js'
import { projectWorkspacePath } from '../src/modules/projects.js'

describe('database checker integration', () => {
  it('checks a freshly migrated PostgreSQL schema end to end', async () => {
    const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
    const pool = new Pool({
      connectionString: settings.databaseUrl,
      max: 1,
      connectionTimeoutMillis: 1_000,
    })
    try {
      const { drizzle } = await import('drizzle-orm/node-postgres')
      const { schema } = await import('../src/db/schema.js')
      await migrate(drizzle(pool, { schema }), {
        migrationsFolder: new URL('../drizzle/', import.meta.url).pathname,
      })
      await expect(checkDatabase(settings.databaseUrl)).resolves.toBeUndefined()
    } finally {
      await pool.end()
    }
  })

  it('backfills workspace paths in temporary shadow tables and rolls back', async () => {
    const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
    const pool = new Pool({
      connectionString: settings.databaseUrl,
      max: 1,
      connectionTimeoutMillis: 1_000,
    })
    const client = await pool.connect()
    const projectId = '00000000-0000-4000-8000-000000000041'
    const runId = '00000000-0000-4000-8000-000000000042'
    const slug = '𐐀'.repeat(60) + '-existing'
    try {
      await client.query('begin')
      await client.query('create temporary table projects (id uuid primary key, slug text)')
      await client.query('create temporary table agent_runs (id uuid primary key)')
      await client.query('insert into projects (id, slug) values ($1, $2)', [projectId, slug])
      await client.query('insert into agent_runs (id) values ($1)', [runId])
      const migration = await readFile(
        new URL('../drizzle/0006_yellow_scorpion.sql', import.meta.url),
        'utf8',
      )
      await client.query(migration)

      const project = await client.query<{ workspace_path: string }>(
        'select workspace_path from projects where id = $1', [projectId],
      )
      expect(project.rows[0].workspace_path).toBe(projectWorkspacePath(projectId, slug))
      const run = await client.query<{ working_directory: string }>(
        'select working_directory from agent_runs where id = $1', [runId],
      )
      expect(run.rows[0].working_directory).toBe('/workspace')
      const columns = await client.query<{ relname: string; attname: string; attnotnull: boolean }>(
        `select c.relname, a.attname, a.attnotnull
         from pg_class c join pg_attribute a on a.attrelid = c.oid
         where c.relnamespace = pg_my_temp_schema() and c.relname in ('projects', 'agent_runs')
           and a.attname in ('workspace_path', 'working_directory')`,
      )
      expect(columns.rows).toEqual(expect.arrayContaining([
        { relname: 'projects', attname: 'workspace_path', attnotnull: true },
        { relname: 'agent_runs', attname: 'working_directory', attnotnull: true },
      ]))
    } finally {
      try {
        await client.query('rollback')
      } finally {
        client.release()
        await pool.end()
      }
    }
  })
})
