import { loadSettings } from '../config.js'
import { Database } from './database.js'
import { seedApplication } from './seeder.js'
import { createLogger } from '../logger.js'

const settings = loadSettings()
const logger = createLogger(settings)
if (settings.environment === 'production') {
  throw new Error('Database seeding is disabled in production')
}

const database = await Database.create(settings)
try {
  const result = await database.transaction((db) => seedApplication(db, {
    email: process.env.MYBOT_SEED_USER_EMAIL,
  }))
  logger.info({ event: 'database_seed_completed', conversation_count: result.conversationCount,
    message_count: result.messageCount, seed_target: result.target }, 'database_seed_completed')
} finally {
  await database.close()
}
