export const testEnvironment = {
  ENVIRONMENT: 'test',
  DATABASE_URL: 'postgresql://mybot:mybot@localhost:5434/mybot',
  REDIS_URL: 'redis://localhost:6380/0',
  WEB_BASE_URL: 'http://localhost:5173',
  API_BASE_URL: 'http://localhost:8000',
  AI_BASE_URL: 'http://localhost:8001',
  SESSION_SECRET: 'test-session-secret-that-is-at-least-32-characters',
  OTP_PEPPER: 'test-otp-pepper-that-is-at-least-32-characters',
  RATE_LIMIT_PEPPER: 'test-rate-limit-pepper-that-is-at-least-32-characters',
  AI_SERVICE_TOKEN: 'test-ai-service-token-that-is-at-least-32-characters',
  GOOGLE_REDIRECT_URI: 'http://localhost:8000/auth/google/callback',
  RESEND_FROM: 'myBot <test@example.com>',
}

export const resolvedTestEnvironment = () => Object.fromEntries(
  Object.entries(testEnvironment).map(([key, fallback]) => [key, process.env[key] ?? fallback]),
)
