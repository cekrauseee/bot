import type { Settings } from '../config.js'
import type { PgTransactionConfig } from 'drizzle-orm/pg-core'
import type { Db, DatabaseClient } from './drivers/types.js'

export type { Db } from './drivers/types.js'

export type DatabaseDriverName = 'neon' | 'node-postgres'

export const databaseDriverFor = (environment: Settings['environment']): DatabaseDriverName =>
  environment === 'production' ? 'neon' : 'node-postgres'

export class Database {
  private constructor(
    readonly client: DatabaseClient,
    readonly db: Db,
  ) {}

  /** Select exactly one runtime driver; the unused driver module is never loaded. */
  static async create(settings: Settings): Promise<Database> {
    if (databaseDriverFor(settings.environment) === 'neon') {
      const { createNeonDatabase } = await import('./drivers/neon.js')
      const { db, client } = await createNeonDatabase(settings.databaseUrl)
      return new Database(client, db)
    }
    const { createNodePostgresDatabase } = await import('./drivers/node-postgres.js')
    const { db, client } = await createNodePostgresDatabase(settings.databaseUrl)
    return new Database(client, db)
  }

  async transaction<T>(
    callback: (db: Db) => Promise<T>,
    config?: PgTransactionConfig,
  ): Promise<T> {
    return this.db.transaction(async (transaction) => callback(transaction as Db), config)
  }

  get handle(): Db { return this.db }

  async close() {
    await this.client.end()
  }
}
