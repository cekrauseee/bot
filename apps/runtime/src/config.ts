import { createDockerProviderFactory, hasDockerAccess } from './providers/docker.js'
import { createVercelProviderFactory, hasVercelCredentials } from './providers/vercel.js'
import type { ProviderFactory } from './providers/types.js'

export type RuntimeProviderName = 'docker' | 'vercel'

export interface RuntimeConfig {
  readonly port: number
  readonly serviceToken: string | undefined
  readonly provider: RuntimeProviderName
  readonly providerReady: boolean
  readonly providerUnavailableReason: 'docker_unavailable' | 'provider_credentials_missing'
  readonly providerFactory: ProviderFactory
}

export interface RuntimeConfigDependencies {
  readonly dockerAvailable?: () => boolean
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RuntimeConfigDependencies = {},
): RuntimeConfig {
  const parsedPort = Number(env.RUNTIME_PORT ?? 8002)
  const serviceToken = env.RUNTIME_SERVICE_TOKEN || undefined
  const production = env.ENVIRONMENT === 'production' || env.NODE_ENV === 'production'
  if (production && (!serviceToken || serviceToken.length < 32 || /\s/.test(serviceToken))) {
    throw new Error('RUNTIME_SERVICE_TOKEN must be a non-whitespace value of at least 32 characters in production.')
  }
  const configuredProvider = env.RUNTIME_PROVIDER?.trim()
  if (configuredProvider && configuredProvider !== 'docker' && configuredProvider !== 'vercel') {
    throw new Error('RUNTIME_PROVIDER must be docker or vercel.')
  }
  const provider: RuntimeProviderName = configuredProvider === 'docker' || configuredProvider === 'vercel'
    ? configuredProvider
    : production ? 'vercel' : 'docker'
  if (production && provider !== 'vercel') {
    throw new Error('Production requires RUNTIME_PROVIDER=vercel.')
  }
  const providerReady = provider === 'docker'
    ? (dependencies.dockerAvailable ?? hasDockerAccess)()
    : hasVercelCredentials(env)
  return {
    port: Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65_536 ? parsedPort : 8002,
    serviceToken,
    provider,
    providerReady,
    providerUnavailableReason: provider === 'docker' ? 'docker_unavailable' : 'provider_credentials_missing',
    providerFactory: provider === 'docker'
      ? createDockerProviderFactory({ namespace: env.RUNTIME_ENVIRONMENT })
      : createVercelProviderFactory({ namespace: env.RUNTIME_ENVIRONMENT, env }),
  }
}
