import { Redis } from 'ioredis'
import { createApp, nodeSocketPeer } from './app.js'
import { loadSettings } from './config.js'
import { Database } from './db/database.js'
import { ResendOtpEmailSender } from './email.js'
import { GoogleOAuthService } from './modules/auth/oauth.js'
import { OtpService } from './modules/auth/otp.js'
import { SessionManager } from './modules/auth/sessions.js'
import { createLogger, safeError } from './logger.js'
import { AgentRunExecutor, RedisAgentEventFanout } from './modules/agent-control-plane.js'
import { createAiClient } from './modules/conversations.js'
import { createShutdown } from './shutdown.js'

const settings = loadSettings()
const logger = createLogger(settings)
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
app.listen(Number(new URL(settings.apiOrigin).port || 8000))
logger.info({ event: 'api_started' }, 'api_started')

const shutdown = createShutdown({
  stopServer: () => app.server ? app.stop(true) : undefined,
  closeResources: [async () => {
    await agentRuns.close()
    await eventFanout.close()
    await redis.quit()
    await database.close()
  }],
})
const close = () => {
  logger.info({ event: 'api_shutdown_started' }, 'api_shutdown_started')
  void shutdown().then(
    () => {
      logger.info({ event: 'api_shutdown_completed' }, 'api_shutdown_completed')
      process.exit(0)
    },
    (error) => {
      logger.error({ ...safeError(error), event: 'api_shutdown_failed' }, 'api_shutdown_failed')
      process.exit(1)
    },
  )
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
