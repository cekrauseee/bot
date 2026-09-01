import { describe, expect, it } from 'vitest'

import { loadConfig } from '../src/config.js'

describe('runtime configuration', () => {
  it('defaults to the dedicated local runtime port without contacting a provider', () => {
    const config = loadConfig({})
    expect(config.port).toBe(8002)
    expect(config.serviceToken).toBeUndefined()
    expect(config.providerReady).toBe(false)
  })

  it('requires a strong service token in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/RUNTIME_SERVICE_TOKEN/)
    const config = loadConfig({ NODE_ENV: 'production', RUNTIME_SERVICE_TOKEN: 's'.repeat(32) })
    expect(config.serviceToken).toBe('s'.repeat(32))
  })

  it('reports provider readiness only when Vercel credentials are configured', () => {
    expect(loadConfig({ VERCEL_OIDC_TOKEN: 'present' }).providerReady).toBe(true)
    expect(loadConfig({ VERCEL_TOKEN: 'token', VERCEL_TEAM_ID: 'team', VERCEL_PROJECT_ID: 'project' }).providerReady).toBe(true)
  })
})
