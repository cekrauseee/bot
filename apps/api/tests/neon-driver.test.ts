import { describe, expect, it, vi } from 'vitest'

const { neonConfig, FakePool } = vi.hoisted(() => {
  const config = {
    webSocketConstructor: undefined as unknown,
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
  it('configures the Node WebSocket constructor', async () => {
    const { createNeonDatabase } = await import('../src/db/drivers/neon.js')

    await createNeonDatabase('postgresql://user:password@ep-test.us-east-1.aws.neon.tech/mybot')

    expect(neonConfig.webSocketConstructor).toBeTypeOf('function')
  })
})
