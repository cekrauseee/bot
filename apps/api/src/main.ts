import { Redis } from 'ioredis'
import { createApp, nodeSocketPeer } from './app.js'
import { loadSettings } from './config.js'
import { Database } from './db/database.js'
import { ResendOtpEmailSender } from './email.js'
import { GoogleOAuthService } from './modules/auth/oauth.js'
import { OtpService } from './modules/auth/otp.js'
import { SessionManager } from './modules/auth/sessions.js'
import { AgentRunExecutor, RedisAgentEventFanout } from './modules/agent-control-plane.js'
import { createAiClient } from './modules/conversations.js'

const settings = loadSettings()
const database = await Database.create(settings)
const redis = new Redis(settings.redisUrl, { lazyConnect: true })
const eventPublisher = new Redis(settings.redisUrl, { lazyConnect: true })
const eventSubscriber = new Redis(settings.redisUrl, { lazyConnect: true })
await Promise.all([redis.connect(), eventPublisher.connect(), eventSubscriber.connect()])
const eventFanout = new RedisAgentEventFanout(eventPublisher, eventSubscriber)
await eventFanout.connect()
const agentRuns = new AgentRunExecutor(database, createAiClient(settings), undefined, eventFanout)

const app = createApp(
  settings,
  {
    database,
    otp: new OtpService(redis, new ResendOtpEmailSender(settings.resendApiKey, settings.resendFrom), settings),
    sessions: new SessionManager(settings),
    google: new GoogleOAuthService(redis, settings),
    agentRuns,
  },
  nodeSocketPeer,
)
let stopHttpServer: () => Promise<void> = async () => undefined
app.listen(Number(new URL(settings.apiOrigin).port || 8000), (server) => {
  stopHttpServer = async () => { await server.stop() }
})
console.log('myBot API listening')

let closing = false
const close = async () => {
  if (closing) return
  closing = true
  await stopHttpServer()
  await agentRuns.close()
  await eventFanout.close()
  await redis.quit()
  await database.close()
  process.exit(0)
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
