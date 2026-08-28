import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { schema } from '../schema.js'
import { attachIdlePoolErrorHandler, type DatabaseDriver, type QueryClient, type QueryRow } from './types.js'

export async function createNodePostgresDatabase(databaseUrl: string): Promise<DatabaseDriver> {
  const [{ Pool }, { drizzle }] = await Promise.all([
    import('pg'),
    import('drizzle-orm/node-postgres'),
  ])
  const client = new Pool({ connectionString: databaseUrl, max: 10 })
  attachIdlePoolErrorHandler(client, 'node-postgres')
  return {
    client,
    db: drizzle(client, { schema: (await import('../schema.js')).schema }) as NodePgDatabase<typeof schema>,
  }
}

export async function createNodePostgresQueryClient(databaseUrl: string): Promise<QueryClient> {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  attachIdlePoolErrorHandler(pool, 'node-postgres')
  return {
    async query<T extends QueryRow = QueryRow>(text: string) {
      const result = await pool.query<T>(text)
      return { rows: result.rows }
    },
    end: () => pool.end(),
  }
}
