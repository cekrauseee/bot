import { describe, expect, it, vi } from 'vitest'

const { neonConfig, FakePool } = vi.hoisted(() => {
  const config = {
    webSocketConstructor: undefined as unknown,
    wsProxy: undefined as string | undefined,
  }
  class Pool {
    constructor(readonly options: unknown) {}
    on() {}
    async end() {}
    async query() { return { rows: [] } }
  }
  return { neonConfig: config, FakePool: Pool }
})

vi.mock('@neondatabase/serverless', () => ({ Pool: FakePool, neonConfig }))
vi.mock('drizzle-orm/neon-serverless', () => ({
  drizzle: (options: unknown) => options,
}))
vi.mock('ws', () => ({ default: class WebSocket {} }))

describe('Neon database driver', () => {
  it('passes the configured WebSocket proxy through unchanged', async () => {
    const { createNeonDatabase } = await import('../src/db/drivers/neon.js')
    const proxy = 'my-wsproxy.example.com:8443/v1'

    await createNeonDatabase('postgresql://user:password@ep-test.us-east-1.aws.neon.tech/mybot', proxy)

    expect(neonConfig.wsProxy).toBe(proxy)
    expect(neonConfig.webSocketConstructor).toBeTypeOf('function')
  })
})
