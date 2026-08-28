import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { loadSettings } from '../config.js'
import { schema } from './schema.js'

const settings = loadSettings()
const client = postgres(settings.databaseUrl, { max: 1 })
try {
  await migrate(drizzle(client, { schema }), {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
  console.log('database migrations applied')
} finally {
  await client.end({ timeout: 2 })
}
