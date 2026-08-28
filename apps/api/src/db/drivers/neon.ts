import type { NeonDatabase } from 'drizzle-orm/neon-serverless'
import type { schema } from '../schema.js'
import { attachIdlePoolErrorHandler, type DatabaseDriver, type QueryClient, type QueryRow } from './types.js'

export async function createNeonDatabase(databaseUrl: string, wsProxy?: string): Promise<DatabaseDriver> {
  const [{ Pool, neonConfig }, { drizzle }, { default: WebSocket }] = await Promise.all([
    import('@neondatabase/serverless'),
    import('drizzle-orm/neon-serverless'),
    import('ws'),
  ])
  neonConfig.webSocketConstructor = WebSocket
  if (wsProxy) neonConfig.wsProxy = wsProxy
  const client = new Pool({ connectionString: databaseUrl, max: 10 })
  attachIdlePoolErrorHandler(client, 'Neon')
  return {
    client,
    db: drizzle({ client, schema: (await import('../schema.js')).schema }) as NeonDatabase<typeof schema>,
  }
}

export async function createNeonQueryClient(databaseUrl: string, wsProxy?: string): Promise<QueryClient> {
  const [{ Pool, neonConfig }, { default: WebSocket }] = await Promise.all([
    import('@neondatabase/serverless'),
    import('ws'),
  ])
  neonConfig.webSocketConstructor = WebSocket
  if (wsProxy) neonConfig.wsProxy = wsProxy
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  attachIdlePoolErrorHandler(pool, 'Neon')
  return {
    async query<T extends QueryRow = QueryRow>(text: string) {
      const result = await pool.query<T>(text)
      return { rows: result.rows }
    },
    end: () => pool.end(),
  }
}
