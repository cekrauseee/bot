import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { loadSettings } from '../config.js'
import { migrationFolderPath, resolveMigrationsFolder } from './migrations.js'
import { schema } from './schema.js'

const settings = loadSettings()
const client = postgres(settings.databaseUrl, { max: 1 })
try {
  const migrationsFolder = await resolveMigrationsFolder()
  await migrate(drizzle(client, { schema }), {
    migrationsFolder: migrationFolderPath(migrationsFolder),
  })
  console.log('database migrations applied')
} finally {
  await client.end({ timeout: 2 })
}
