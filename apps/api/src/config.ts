import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { Buffer } from 'node:buffer'
import dotenv from 'dotenv'

// Resolve the repository environment file from this module rather than from
// process.cwd(). This keeps every API entrypoint consistent when invoked from
// a workspace, a deployment directory, or a test runner.
export const repositoryEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url))
dotenv.config({ path: repositoryEnvPath, override: false, quiet: true })

export type Environment = 'development' | 'test' | 'production'
export type Settings = {
  environment: Environment
  databaseUrl: string
  redisUrl: string
  webBaseUrl: string
  apiBaseUrl: string
  sessionSecret: string
  otpPepper: string
  rateLimitPepper: string
  sessionTtlSeconds: number
  otpTtlSeconds: number
  otpResendCooldownSeconds: number
  otpMaxAttempts: number
  otpEmailRequestsPerWindow: number
  otpIpRequestsPerWindow: number
  otpVerifyAttemptsPerIpWindow: number
  otpRateLimitWindowSeconds: number
  googleClientId: string
  googleClientSecret: string
  googleRedirectUri: string
  resendApiKey: string
  resendFrom: string
  sessionCookieName: string
  secureCookies: boolean
  webOrigin: string
  apiOrigin: string
  aiBaseUrl: string
  aiServiceToken: string
  codexBinary: string
  codexHomeRoot: string | null
  codexLoginMode: 'browser' | 'device'
  githubClientId: string
  githubClientSecret: string
  githubRedirectUri: string
  githubTokenEncryptionKey: Buffer | null
  githubMcpUrl: string
}

const isPlaceholder = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith('replace-with-') || normalized.startsWith('your-') ||
    normalized.startsWith('example-') ||
    ['re_example', 'example.apps.googleusercontent.com', 'changeme', 'change-me'].includes(normalized)
}

const requiredValue = (env: NodeJS.ProcessEnv, key: string) => {
  const value = env[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

const authenticationPolicy = {
  sessionTtlSeconds: 2_592_000,
  otpTtlSeconds: 600,
  otpResendCooldownSeconds: 60,
  otpMaxAttempts: 5,
  otpEmailRequestsPerWindow: 5,
  otpIpRequestsPerWindow: 20,
  otpVerifyAttemptsPerIpWindow: 50,
  otpRateLimitWindowSeconds: 900,
} as const

const parseHttpUrl = (value: string, name: string, origin: boolean) => {
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error(`${name} must be a valid HTTP URL`) }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error(`${name} must be a valid HTTP URL`)
  }
  if (origin && (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/')) {
    throw new Error(`${name} must be an origin without a path, query, or credentials`)
  }
  return parsed
}

const normalizeOrigin = (value: string, name: string) => parseHttpUrl(value.replace(/\/$/, ''), name, true).origin

const parseDatabaseUrl = (value: string) => {
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL') }
  if (!['postgresql:', 'postgresql+psycopg:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('DATABASE_URL must use postgresql:// or postgresql+psycopg://')
  }
  return value.replace(/^postgresql\+psycopg:/i, 'postgresql:')
}

const isNeonHostname = (databaseUrl: string) => {
  const hostname = new URL(databaseUrl).hostname.toLowerCase()
  return hostname === 'neon.tech' || hostname.endsWith('.neon.tech')
}

const parseRedisUrl = (value: string) => {
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('REDIS_URL must be a valid Redis URL') }
  if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('REDIS_URL must use redis:// or rediss://')
  }
  return value
}

const parseGithubKey = (value: string | undefined) => {
  if (!value?.trim()) return null
  const key = Buffer.from(value.trim(), 'base64')
  if (key.length !== 32 || key.toString('base64') !== value.trim()) {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  }
  return key
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const environment = requiredValue(env, 'ENVIRONMENT')
  if (!['development', 'test', 'production'].includes(environment)) throw new Error('ENVIRONMENT is invalid')
  const databaseUrl = parseDatabaseUrl(requiredValue(env, 'DATABASE_URL'))
  const redisUrl = parseRedisUrl(requiredValue(env, 'REDIS_URL'))
  const webOrigin = normalizeOrigin(requiredValue(env, 'WEB_BASE_URL'), 'WEB_BASE_URL')
  const apiOrigin = normalizeOrigin(requiredValue(env, 'API_BASE_URL'), 'API_BASE_URL')
  const aiBaseUrl = normalizeOrigin(requiredValue(env, 'AI_BASE_URL'), 'AI_BASE_URL')
  const redirectValue = requiredValue(env, 'GOOGLE_REDIRECT_URI')
  const redirectUri = parseHttpUrl(redirectValue, 'GOOGLE_REDIRECT_URI', false)
  if (redirectUri.username || redirectUri.password || redirectUri.search || redirectUri.hash) {
    throw new Error('GOOGLE_REDIRECT_URI must not contain credentials, query, or fragment')
  }
  const githubClientId = env.GITHUB_OAUTH_CLIENT_ID?.trim() ?? ''
  const githubClientSecret = env.GITHUB_OAUTH_CLIENT_SECRET?.trim() ?? ''
  if (Boolean(githubClientId) !== Boolean(githubClientSecret)) {
    throw new Error('GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET must be provided together')
  }
  const githubRedirectUri = env.GITHUB_OAUTH_REDIRECT_URI?.trim() || `${apiOrigin}/auth/github/callback`
  const githubRedirect = parseHttpUrl(githubRedirectUri, 'GITHUB_OAUTH_REDIRECT_URI', false)
  if (githubRedirect.username || githubRedirect.password || githubRedirect.search || githubRedirect.hash) {
    throw new Error('GITHUB_OAUTH_REDIRECT_URI must not contain credentials, query, or fragment')
  }
  const githubMcpUrl = env.GITHUB_MCP_URL?.trim() || 'https://api.githubcopilot.com/mcp/'
  const parsedGithubMcp = parseHttpUrl(githubMcpUrl, 'GITHUB_MCP_URL', false)
  if (parsedGithubMcp.protocol !== 'https:' || parsedGithubMcp.hostname !== 'api.githubcopilot.com') {
    throw new Error('GITHUB_MCP_URL must use the official GitHub MCP HTTPS endpoint')
  }
  const githubTokenEncryptionKey = parseGithubKey(env.GITHUB_TOKEN_ENCRYPTION_KEY)
  if (environment === 'production' && githubClientId && (!githubTokenEncryptionKey || githubRedirect.protocol !== 'https:' || githubRedirect.origin !== apiOrigin)) {
    throw new Error('production GitHub OAuth requires an encryption key and HTTPS API callback')
  }
  const secrets = {
    sessionSecret: requiredValue(env, 'SESSION_SECRET'),
    otpPepper: requiredValue(env, 'OTP_PEPPER'),
    rateLimitPepper: requiredValue(env, 'RATE_LIMIT_PEPPER'),
  }
  if (environment === 'production') {
    if (!isNeonHostname(databaseUrl)) throw new Error('production DATABASE_URL must target a Neon host (*.neon.tech)')
    const values = Object.values(secrets)
    if (values.some((value) => value.length < 32 || value.startsWith('development-') || isPlaceholder(value)) || new Set(values).size !== values.length) {
      throw new Error('production authentication secrets must be unique and at least 32 characters')
    }
    if (!env.GOOGLE_CLIENT_ID || isPlaceholder(env.GOOGLE_CLIENT_ID) || !env.GOOGLE_CLIENT_SECRET || isPlaceholder(env.GOOGLE_CLIENT_SECRET)) {
      throw new Error('Google OAuth credentials are required in production')
    }
    if (!env.RESEND_API_KEY || isPlaceholder(env.RESEND_API_KEY)) throw new Error('RESEND_API_KEY is required in production')
    if (!env.AI_SERVICE_TOKEN || env.AI_SERVICE_TOKEN.length < 32 || isPlaceholder(env.AI_SERVICE_TOKEN)) throw new Error('AI_SERVICE_TOKEN is required in production')
    if (new URL(webOrigin).protocol !== 'https:' || new URL(apiOrigin).protocol !== 'https:' || redirectUri.protocol !== 'https:') {
      throw new Error('production web, API, and Google redirect URLs must use HTTPS')
    }
    if (redirectUri.origin !== apiOrigin || redirectUri.pathname !== '/auth/google/callback') {
      throw new Error('production Google redirect URI must use the API origin and callback path')
    }
    if (env.RESEND_FROM !== undefined && (!env.RESEND_FROM.trim() || !env.RESEND_FROM.includes('@'))) {
      throw new Error('RESEND_FROM must contain a valid sender address')
    }
  }
  const configuredCodexHome = env.CODEX_HOME_ROOT?.trim()
  if (configuredCodexHome && !isAbsolute(configuredCodexHome)) {
    throw new Error('CODEX_HOME_ROOT must be an absolute path')
  }
  const codexBinary = env.CODEX_BINARY?.trim() || 'codex'
  if (codexBinary.includes('\0')) throw new Error('CODEX_BINARY is invalid')
  const configuredLoginMode = env.CODEX_LOGIN_MODE?.trim()
  if (configuredLoginMode !== undefined && configuredLoginMode !== 'browser' && configuredLoginMode !== 'device') {
    throw new Error('CODEX_LOGIN_MODE must be browser or device')
  }
  const codexLoginMode = configuredLoginMode ?? (environment === 'production' ? 'device' : 'browser')
  return {
    environment: environment as Environment, databaseUrl, redisUrl,
    webBaseUrl: webOrigin, apiBaseUrl: apiOrigin, ...secrets,
    ...authenticationPolicy,
    googleClientId: env.GOOGLE_CLIENT_ID ?? '', googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    googleRedirectUri: redirectUri.toString(),
    resendApiKey: env.RESEND_API_KEY ?? '', resendFrom: requiredValue(env, 'RESEND_FROM'),
    sessionCookieName: environment === 'production' ? '__Host-mybot_session' : 'mybot_session',
    secureCookies: environment === 'production', webOrigin, apiOrigin,
    aiBaseUrl, aiServiceToken: requiredValue(env, 'AI_SERVICE_TOKEN'),
    codexBinary,
    codexLoginMode,
    codexHomeRoot: configuredCodexHome || (environment === 'production'
      ? null
      : join(tmpdir(), 'my-bot-codex')),
    githubClientId,
    githubClientSecret,
    githubRedirectUri: githubRedirect.toString(),
    githubTokenEncryptionKey,
    githubMcpUrl: parsedGithubMcp.toString(),
  }
}
