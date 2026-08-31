import { describe, expect, it } from 'vitest'

import {
  findTurnOperation,
  releaseTurnOperation,
  rekeyTurnOperation,
  type TurnOperationRegistry,
} from './turn-operation-registry'

describe('turn operation ownership', () => {
  it('moves a new-conversation operation to the server ID without replacing or aborting it', () => {
    const controller = new AbortController()
    const registry: TurnOperationRegistry = new Map([[
      'operation',
      { operationId: 'operation', controller, identity: { kind: 'new' } },
    ]])

    const rekeyed = rekeyTurnOperation(
      registry,
      'operation',
      { kind: 'existing', id: 'server-id' },
    )

    expect(rekeyed?.controller).toBe(controller)
    expect(controller.signal.aborted).toBe(false)
    expect(findTurnOperation(registry, { kind: 'new' })).toBeUndefined()
    expect(findTurnOperation(registry, { kind: 'existing', id: 'server-id' }))
      .toMatchObject({ operationId: 'operation' })
  })

  it('releases a stopped operation before an immediate resend registers', () => {
    const stoppedController = new AbortController()
    const registry: TurnOperationRegistry = new Map([[
      'stopped-operation',
      {
        operationId: 'stopped-operation',
        controller: stoppedController,
        identity: { kind: 'existing', id: 'conversation' },
      },
    ]])

    const stopped = releaseTurnOperation(registry, 'stopped-operation')
    stopped?.controller.abort()

    expect(stoppedController.signal.aborted).toBe(true)
    expect(findTurnOperation(registry, { kind: 'existing', id: 'conversation' }))
      .toBeUndefined()

    const resendController = new AbortController()
    registry.set('resend-operation', {
      operationId: 'resend-operation',
      controller: resendController,
      identity: { kind: 'existing', id: 'conversation' },
    })

    expect(findTurnOperation(registry, { kind: 'existing', id: 'conversation' }))
      .toMatchObject({ operationId: 'resend-operation' })
    expect(resendController.signal.aborted).toBe(false)
  })
})
