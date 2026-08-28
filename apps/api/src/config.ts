import { isIP } from 'node:net'

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
  trustedProxyHosts: string[]
  resendApiKey: string
  resendFrom: string
  sessionCookieName: string
  secureCookies: boolean
  webOrigin: string
  apiOrigin: string
}

const developmentSecrets = {
  sessionSecret: 'development-session-secret-change-before-production',
  otpPepper: 'development-otp-pepper-change-before-production',
  rateLimitPepper: 'development-rate-limit-pepper-change-before-production',
}

const isPlaceholder = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith('replace-with-') || normalized.startsWith('your-') ||
    normalized.startsWith('example-') ||
    ['re_example', 'example.apps.googleusercontent.com', 'changeme', 'change-me'].includes(normalized)
}

const positiveInteger = (env: NodeJS.ProcessEnv, key: string, fallback: number) => {
  const value = Number(env[key] ?? fallback)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`)
  return value
}

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
  const normalized = value.replace(/^postgresql\+psycopg:\/\//, 'postgresql://')
  let parsed: URL
  try { parsed = new URL(normalized) } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL') }
  if (parsed.protocol !== 'postgresql:' || !parsed.hostname) {
    throw new Error('DATABASE_URL must use postgresql:// or postgresql+psycopg://')
  }
  return normalized
}

const parseRedisUrl = (value: string) => {
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('REDIS_URL must be a valid Redis URL') }
  if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('REDIS_URL must use redis:// or rediss://')
  }
  return value
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const environment = env.ENVIRONMENT ?? 'development'
  if (!['development', 'test', 'production'].includes(environment)) throw new Error('ENVIRONMENT is invalid')
  const databaseUrl = parseDatabaseUrl(env.DATABASE_URL ?? 'postgresql://mybot:mybot@localhost:5434/mybot')
  const redisUrl = parseRedisUrl(env.REDIS_URL ?? 'redis://localhost:6380/0')
  const webOrigin = normalizeOrigin(env.WEB_BASE_URL ?? 'http://localhost:5173', 'WEB_BASE_URL')
  const apiOrigin = normalizeOrigin(env.API_BASE_URL ?? 'http://localhost:8000', 'API_BASE_URL')
  const redirectValue = env.GOOGLE_REDIRECT_URI ?? `${apiOrigin}/auth/google/callback`
  const redirectUri = parseHttpUrl(redirectValue, 'GOOGLE_REDIRECT_URI', false)
  if (redirectUri.username || redirectUri.password || redirectUri.search || redirectUri.hash) {
    throw new Error('GOOGLE_REDIRECT_URI must not contain credentials, query, or fragment')
  }
  const trustedProxyHosts = (env.TRUSTED_PROXY_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean)
  if (trustedProxyHosts.some((host) => host.includes('/') || isIP(host) === 0)) {
    throw new Error('TRUSTED_PROXY_HOSTS must contain individual IP addresses')
  }
  const secrets = {
    sessionSecret: env.SESSION_SECRET ?? developmentSecrets.sessionSecret,
    otpPepper: env.OTP_PEPPER ?? developmentSecrets.otpPepper,
    rateLimitPepper: env.RATE_LIMIT_PEPPER ?? developmentSecrets.rateLimitPepper,
  }
  if (environment === 'production') {
    const values = Object.values(secrets)
    if (values.some((value) => value.length < 32 || value.startsWith('development-') || isPlaceholder(value)) || new Set(values).size !== values.length) {
      throw new Error('production authentication secrets must be unique and at least 32 characters')
    }
    if (!env.GOOGLE_CLIENT_ID || isPlaceholder(env.GOOGLE_CLIENT_ID) || !env.GOOGLE_CLIENT_SECRET || isPlaceholder(env.GOOGLE_CLIENT_SECRET)) {
      throw new Error('Google OAuth credentials are required in production')
    }
    if (!env.RESEND_API_KEY || isPlaceholder(env.RESEND_API_KEY)) throw new Error('RESEND_API_KEY is required in production')
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
  return {
    environment: environment as Environment, databaseUrl, redisUrl,
    webBaseUrl: webOrigin, apiBaseUrl: apiOrigin, ...secrets,
    sessionTtlSeconds: positiveInteger(env, 'SESSION_TTL_SECONDS', 2_592_000),
    otpTtlSeconds: positiveInteger(env, 'OTP_TTL_SECONDS', 600),
    otpResendCooldownSeconds: positiveInteger(env, 'OTP_RESEND_COOLDOWN_SECONDS', 60),
    otpMaxAttempts: positiveInteger(env, 'OTP_MAX_ATTEMPTS', 5),
    otpEmailRequestsPerWindow: positiveInteger(env, 'OTP_EMAIL_REQUESTS_PER_WINDOW', 5),
    otpIpRequestsPerWindow: positiveInteger(env, 'OTP_IP_REQUESTS_PER_WINDOW', 20),
    otpVerifyAttemptsPerIpWindow: positiveInteger(env, 'OTP_VERIFY_ATTEMPTS_PER_IP_WINDOW', 50),
    otpRateLimitWindowSeconds: positiveInteger(env, 'OTP_RATE_LIMIT_WINDOW_SECONDS', 900),
    googleClientId: env.GOOGLE_CLIENT_ID ?? '', googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    googleRedirectUri: redirectUri.toString(), trustedProxyHosts,
    resendApiKey: env.RESEND_API_KEY ?? '', resendFrom: env.RESEND_FROM ?? 'myBot <mybot@cekrause.eu>',
    sessionCookieName: environment === 'production' ? '__Host-mybot_session' : 'mybot_session',
    secureCookies: environment === 'production', webOrigin, apiOrigin,
  }
}
