import { Redis } from 'ioredis'
import { createApp, nodeSocketPeer } from './app.js'
import { loadSettings } from './config.js'
import { Database } from './db/database.js'
import { ResendOtpEmailSender } from './email.js'
import { GoogleOAuthService } from './modules/auth/oauth.js'
import { OtpService } from './modules/auth/otp.js'
import { SessionManager } from './modules/auth/sessions.js'

const settings = loadSettings()
const database = await Database.create(settings)
const redis = new Redis(settings.redisUrl, { lazyConnect: true })
await redis.connect()

const app = createApp(
  settings,
  {
    database,
    otp: new OtpService(redis, new ResendOtpEmailSender(settings.resendApiKey, settings.resendFrom), settings),
    sessions: new SessionManager(settings),
    google: new GoogleOAuthService(redis, settings),
  },
  nodeSocketPeer,
)
app.listen(Number(new URL(settings.apiOrigin).port || 8000))
console.log('myBot API listening')

const close = async () => {
  await redis.quit()
  await database.close()
  process.exit(0)
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
