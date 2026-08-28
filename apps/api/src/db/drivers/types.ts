import type { NeonDatabase } from 'drizzle-orm/neon-serverless'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { schema } from '../schema.js'

/** The database surface shared by the local and Neon Drizzle drivers. */
export type Db = NodePgDatabase<typeof schema> | NeonDatabase<typeof schema>

export type DatabaseClient = {
  end(): Promise<void>
}

export type DatabaseDriver = {
  db: Db
  client: DatabaseClient
}

export type IdlePool = {
  on(event: 'error', listener: () => void): unknown
}

/** Report idle-client failures without ever serializing driver errors or URLs. */
export function attachIdlePoolErrorHandler(pool: IdlePool, label: 'Neon' | 'node-postgres') {
  pool.on('error', () => {
    console.error(`${label} database pool idle-client error`)
  })
}

export type QueryRow = Record<string, unknown>

export type QueryClient = {
  query<T extends QueryRow = QueryRow>(text: string): Promise<{ rows: T[] }>
  end(): Promise<void>
}
