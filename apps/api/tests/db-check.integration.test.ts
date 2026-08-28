import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { loadSettings } from '../src/config.js'
import { checkDatabase } from '../src/db/check.js'
import { schema } from '../src/db/schema.js'

const enabled = process.env.RUN_API_INTEGRATION === '1'
const describeIntegration = describe.skipIf(!enabled)

describeIntegration('database checker integration', () => {
  it('checks a freshly migrated PostgreSQL schema end to end', async () => {
    const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
    const sql = postgres(settings.databaseUrl, { max: 1, connect_timeout: 1 })
    try {
      await migrate(drizzle(sql, { schema }), {
        migrationsFolder: new URL('../drizzle/', import.meta.url).pathname,
      })
      await expect(checkDatabase(settings.databaseUrl)).resolves.toBeUndefined()
    } finally {
      await sql.end({ timeout: 2 })
    }
  })
})
