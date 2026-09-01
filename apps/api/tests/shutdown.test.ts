import { describe, expect, it, vi } from 'vitest'
import { createShutdown } from '../src/shutdown.js'

describe('API shutdown', () => {
  it('stops the listener before closing resources and runs once', async () => {
    const calls: string[] = []
    const stopServer = vi.fn(async () => { calls.push('server') })
    const closeRedis = vi.fn(async () => { calls.push('redis') })
    const closeDatabase = vi.fn(async () => { calls.push('database') })
    const shutdown = createShutdown({
      stopServer,
      closeResources: [closeRedis, closeDatabase],
    })

    const first = shutdown()
    const second = shutdown()
    expect(second).toBe(first)
    await Promise.all([first, second])

    expect(calls[0]).toBe('server')
    expect(new Set(calls.slice(1))).toEqual(new Set(['redis', 'database']))
    expect(stopServer).toHaveBeenCalledOnce()
    expect(closeRedis).toHaveBeenCalledOnce()
    expect(closeDatabase).toHaveBeenCalledOnce()
  })

  it('attempts every resource close and reports failures', async () => {
    const closeDatabase = vi.fn(async () => {})
    const shutdown = createShutdown({
      stopServer: async () => { throw new Error('server already stopped') },
      closeResources: [async () => { throw new Error('redis failed') }, closeDatabase],
    })

    await expect(shutdown()).rejects.toThrow(/Failed to close API resources/)
    expect(closeDatabase).toHaveBeenCalledOnce()
  })
})
