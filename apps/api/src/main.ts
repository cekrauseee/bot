import { Redis } from 'ioredis'
import { createApp, nodeSocketPeer } from './app.js'
import { loadSettings } from './config.js'
import { Database } from './db/database.js'
import { ResendOtpEmailSender } from './email.js'
import { GoogleOAuthService } from './modules/auth/oauth.js'
import { OtpService } from './modules/auth/otp.js'
import { DesktopAuthService } from './modules/auth/desktop.js'
import { SessionManager } from './modules/auth/sessions.js'
import { CodexAppServerManager } from './modules/codex-app-server.js'
import { DatabaseProviderConnectionSettings } from './modules/provider-connections.js'
import { GithubConnectionService } from './modules/github-connection.js'
import { createLogger, safeError } from './logger.js'
import { AgentRunExecutor, RedisAgentEventFanout } from './modules/agent-control-plane.js'
import { createAiClient, createTitleClient } from './modules/conversations.js'
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
const providerConnectionSettings = new DatabaseProviderConnectionSettings(database)
const github = new GithubConnectionService(database, redis, settings)
const agentRuns = new AgentRunExecutor(
  database,
  createAiClient(settings),
  undefined,
  eventFanout,
  createTitleClient(settings),
  async (userId) => {
    if (!github.configured) return undefined
    const active = await providerConnectionSettings.isActive(userId, 'github')
    if (!active) return undefined
    try {
      const token = await github.accessToken(userId)
      return token
        ? { server_url: settings.githubMcpUrl, authorization: token, allowed_tools: ['search_repositories', 'get_file_contents'] }
        : undefined
    } catch {
      return undefined
    }
  },
)
const codex = settings.codexHomeRoot
  ? new CodexAppServerManager({
      binary: settings.codexBinary,
      homeRoot: settings.codexHomeRoot,
      identityKey: settings.sessionSecret,
      loginMode: settings.codexLoginMode,
    })
  : undefined
const app = createApp(
  settings,
  {
    database,
    otp: new OtpService(redis, new ResendOtpEmailSender(settings.resendApiKey, settings.resendFrom), settings),
    sessions: new SessionManager(settings),
    desktopAuth: new DesktopAuthService(redis, settings),
    google: new GoogleOAuthService(redis, settings),
    github,
    agentRuns,
    providerConnectionAdapters: {
      'openai-codex': {
        provider: 'openai',
        loginMode: settings.codexLoginMode,
        adapter: codex,
      },
      github: {
        provider: 'github',
        loginMode: 'browser',
        adapter: github,
      },
    },
    providerConnectionSettings,
  },
  nodeSocketPeer,
)
app.listen(Number(new URL(settings.apiOrigin).port || 8000))
logger.info({ event: 'api_started' }, 'api_started')

const shutdown = createShutdown({
  stopServer: () => app.server ? app.stop(true) : undefined,
  closeResources: [async () => {
    await agentRuns.close()
    await codex?.close()
    await github.close()
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
