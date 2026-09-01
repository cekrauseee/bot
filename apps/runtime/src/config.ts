import { createVercelProviderFactory, hasVercelCredentials } from './providers/vercel.js'
import type { ProviderFactory } from './providers/types.js'

export interface RuntimeConfig {
  readonly port: number
  readonly serviceToken: string | undefined
  readonly provider: 'vercel'
  readonly providerReady: boolean
  readonly providerFactory: ProviderFactory
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsedPort = Number(env.RUNTIME_PORT ?? 8002)
  const serviceToken = env.RUNTIME_SERVICE_TOKEN || undefined
  if (env.NODE_ENV === 'production' && (!serviceToken || serviceToken.length < 32 || /\s/.test(serviceToken))) {
    throw new Error('RUNTIME_SERVICE_TOKEN must be a non-whitespace value of at least 32 characters in production.')
  }
  return {
    port: Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65_536 ? parsedPort : 8002,
    serviceToken,
    provider: 'vercel',
    providerReady: hasVercelCredentials(env),
    providerFactory: createVercelProviderFactory({ namespace: env.RUNTIME_ENVIRONMENT, env }),
  }
}
