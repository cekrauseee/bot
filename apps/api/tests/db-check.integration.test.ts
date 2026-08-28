import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { loadSettings } from '../src/config.js'
import { checkDatabase } from '../src/db/check.js'

describe('database checker integration', () => {
  it('checks a freshly migrated PostgreSQL schema end to end', async () => {
    const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
    const pool = new Pool({ connectionString: settings.databaseUrl, max: 1, connectionTimeoutMillis: 1_000 })
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
})
