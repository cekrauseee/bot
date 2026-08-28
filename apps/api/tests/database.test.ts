import { describe, expect, it, vi } from 'vitest'
import { attachIdlePoolErrorHandler } from '../src/db/drivers/types.js'

describe('database pool error handling', () => {
  it('logs only a sanitized idle-client failure label', () => {
    let onError: (() => void) | undefined
    const pool = {
      on: vi.fn((_event: 'error', listener: () => void) => {
        onError = listener
      }),
    }
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    attachIdlePoolErrorHandler(pool, 'Neon')
    onError?.()

    expect(pool.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(errorLog).toHaveBeenCalledWith('Neon database pool idle-client error')
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain('postgresql://')
    errorLog.mockRestore()
  })
})
