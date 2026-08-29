import { loadSettings } from '../config.js'
import { Database } from './database.js'
import { seedApplication } from './seeder.js'

const settings = loadSettings()
if (settings.environment === 'production') {
  throw new Error('Database seeding is disabled in production')
}

const database = await Database.create(settings)
try {
  const result = await database.transaction((db) => seedApplication(db, {
    email: process.env.MYBOT_SEED_USER_EMAIL,
  }))
  console.log(
    `seeded ${result.conversationCount} conversations and ${result.messageCount} messages (${result.target})`,
  )
} finally {
  await database.close()
}
