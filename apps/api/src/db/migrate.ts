import { loadSettings } from '../config.js'
import { migrationFolderPath, resolveMigrationsFolder } from './migrations.js'

const settings = loadSettings()
const migrationsFolder = await resolveMigrationsFolder()

if (settings.environment === 'production') {
  const { createNeonDatabase } = await import('./drivers/neon.js')
  const { migrate } = await import('drizzle-orm/neon-serverless/migrator')
  const { db, client } = await createNeonDatabase(settings.databaseUrl)
  try {
    await migrate(db, { migrationsFolder: migrationFolderPath(migrationsFolder) })
    console.log('database migrations applied')
  } finally {
    await client.end()
  }
} else {
  const { createNodePostgresDatabase } = await import('./drivers/node-postgres.js')
  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  const { db, client } = await createNodePostgresDatabase(settings.databaseUrl)
  try {
    await migrate(db, { migrationsFolder: migrationFolderPath(migrationsFolder) })
    console.log('database migrations applied')
  } finally {
    await client.end()
  }
}
