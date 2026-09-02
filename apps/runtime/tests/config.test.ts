import { describe, expect, it } from 'vitest'

import { loadConfig } from '../src/config.js'

describe('runtime configuration', () => {
  it('defaults to the dedicated local runtime port without contacting a provider', () => {
    const config = loadConfig({}, { dockerAvailable: () => true })
    expect(config.port).toBe(8002)
    expect(config.serviceToken).toBeUndefined()
    expect(config.provider).toBe('docker')
    expect(config.providerReady).toBe(true)
  })

  it('reports when the local Docker engine is unavailable', () => {
    const config = loadConfig({}, { dockerAvailable: () => false })
    expect(config.providerReady).toBe(false)
    expect(config.providerUnavailableReason).toBe('docker_unavailable')
  })

  it('requires a strong service token in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/RUNTIME_SERVICE_TOKEN/)
    const config = loadConfig({ NODE_ENV: 'production', RUNTIME_SERVICE_TOKEN: 's'.repeat(32) })
    expect(config.serviceToken).toBe('s'.repeat(32))
    expect(config.provider).toBe('vercel')
    expect(config.providerReady).toBe(false)
  })

  it('supports an explicit Vercel provider in development', () => {
    expect(loadConfig({ RUNTIME_PROVIDER: 'vercel' }).providerReady).toBe(false)
    expect(loadConfig({ RUNTIME_PROVIDER: 'vercel', VERCEL_OIDC_TOKEN: 'present' }).providerReady).toBe(true)
    expect(loadConfig({ RUNTIME_PROVIDER: 'vercel', VERCEL_TOKEN: 'token', VERCEL_TEAM_ID: 'team', VERCEL_PROJECT_ID: 'project' }).providerReady).toBe(true)
  })

  it('rejects unsupported providers and Docker in production', () => {
    expect(() => loadConfig({ RUNTIME_PROVIDER: 'memory' })).toThrow(/RUNTIME_PROVIDER/)
    expect(() => loadConfig({
      ENVIRONMENT: 'production',
      RUNTIME_PROVIDER: 'docker',
      RUNTIME_SERVICE_TOKEN: 's'.repeat(32),
    })).toThrow(/Production requires/)
  })
})
