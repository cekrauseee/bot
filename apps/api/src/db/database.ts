import postgres, { type Sql } from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { Settings } from '../config.js'
import { schema } from './schema.js'

export type Db = ReturnType<typeof drizzle<typeof schema>>

export class Database {
  readonly client: Sql
  readonly db: Db

  constructor(settings: Settings) {
    this.client = postgres(settings.databaseUrl, { max: 10 })
    this.db = drizzle(this.client, { schema })
  }

  async transaction<T>(callback: (db: Db) => Promise<T>): Promise<T> {
    return this.db.transaction(async (transaction) => callback(transaction as unknown as Db))
  }

  async close() {
    await this.client.end({ timeout: 2 })
  }
}
