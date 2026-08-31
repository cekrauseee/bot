import { describe, expect, it, vi } from 'vitest'
import {
  AgentEventHub,
  AgentRunExecutor,
  parseAgentEvents,
  type AgentEventFanout,
  type AgentEventFanoutEnvelope,
  type PublicAgentEvent,
} from '../src/modules/agent-control-plane.js'

const runId = '00000000-0000-4000-8000-000000000001'
const turnId = '00000000-0000-4000-8000-000000000002'

const frame = (sequence: number, type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({
    version: 2, sequence, run_id: runId, turn_id: turnId, type, data,
  })}\n\n`

class InMemoryAgentEventFanout implements AgentEventFanout {
  private readonly listeners = new Set<(envelope: AgentEventFanoutEnvelope) => void>()

  async publish(envelope: AgentEventFanoutEnvelope) {
    for (const listener of this.listeners) listener(envelope)
  }

  subscribe(listener: (envelope: AgentEventFanoutEnvelope) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

describe('durable agent event contract', () => {
  it('parses chunk-safe AI v2 events including the nonterminal input pause', () => {
    const parsed = parseAgentEvents(
      frame(1, 'plan.updated', { plan: [{ id: 'one', status: 'in_progress' }] }) +
      frame(2, 'user.input_required', { question: { question_id: 'q-1', prompt: 'Continue?' } }) +
      frame(3, 'browser.frame', {
        frame: {
          base64: 'cG5n', mime_type: 'image/png', captured_at: '2026-08-30T17:00:00Z',
        },
      }) +
      'partial',
    )
    expect(parsed.events.map((event) => event.type)).toEqual([
      'plan.updated', 'user.input_required', 'browser.frame',
    ])
    expect(parsed.events[1]).toMatchObject({ version: 2, run_id: runId, turn_id: turnId })
    expect(parsed.remainder).toBe('partial')
  })

  it('rejects unknown or mismatched provider events', () => {
    expect(() => parseAgentEvents(frame(1, 'provider.native', {}))).toThrow('invalid_provider_event')
    expect(() => parseAgentEvents(
      `event: text.delta\ndata: ${JSON.stringify({
        version: 2, sequence: 1, run_id: runId, turn_id: turnId,
        type: 'reasoning.delta', data: { delta: 'no' },
      })}\n\n`,
    )).toThrow('invalid_provider_event')
  })

  it('keeps browser frames in process-local fanout only', () => {
    const hub = new AgentEventHub()
    const listener = vi.fn()
    const unsubscribe = hub.subscribeFrames(runId, listener)
    hub.publishBrowserFrame(runId, { jpeg: 'frame' })
    unsubscribe()
    hub.publishBrowserFrame(runId, { jpeg: 'ignored' })
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ jpeg: 'frame' })
  })

  it('fans committed events across instances without duplicating the publishing instance', async () => {
    const fanout = new InMemoryAgentEventFanout()
    const first = new AgentRunExecutor({} as never, vi.fn() as never, new AgentEventHub(), fanout)
    const second = new AgentRunExecutor({} as never, vi.fn() as never, new AgentEventHub(), fanout)
    const firstListener = vi.fn()
    const secondListener = vi.fn()
    first.hub.subscribe(runId, firstListener)
    second.hub.subscribe(runId, secondListener)
    const event: PublicAgentEvent = {
      version: 2,
      sequence: '41',
      run_id: runId,
      turn_id: turnId,
      type: 'text.delta',
      data: { delta: 'committed' },
    }

    await (first as unknown as { dispatch(event: PublicAgentEvent): Promise<void> }).dispatch(event)

    expect(firstListener).toHaveBeenCalledOnce()
    expect(secondListener).toHaveBeenCalledOnce()
    expect(firstListener).toHaveBeenCalledWith(event)
    expect(secondListener).toHaveBeenCalledWith(event)
    await first.close()
    await second.close()
  })

  it('fans transient browser frames across instances without persisting a sequence', async () => {
    const fanout = new InMemoryAgentEventFanout()
    const first = new AgentRunExecutor({} as never, vi.fn() as never, new AgentEventHub(), fanout)
    const second = new AgentRunExecutor({} as never, vi.fn() as never, new AgentEventHub(), fanout)
    const firstListener = vi.fn()
    const secondListener = vi.fn()
    first.hub.subscribeFrames(runId, firstListener)
    second.hub.subscribeFrames(runId, secondListener)
    const frameData = {
      base64: 'cG5n', mime_type: 'image/png', captured_at: '2026-08-30T17:00:00Z',
    }

    await (first as unknown as {
      dispatchBrowserFrame(runId: string, frame: Record<string, unknown>): Promise<void>
    }).dispatchBrowserFrame(runId, frameData)

    expect(firstListener).toHaveBeenCalledOnce()
    expect(secondListener).toHaveBeenCalledOnce()
    expect(firstListener).toHaveBeenCalledWith(frameData)
    expect(secondListener).toHaveBeenCalledWith(frameData)
    await first.close()
    await second.close()
  })

  it('detaches throwing local listeners while healthy local and remote listeners continue', async () => {
    const fanout = new InMemoryAgentEventFanout()
    const first = new AgentRunExecutor({} as never, vi.fn() as never, new AgentEventHub(), fanout)
    const second = new AgentRunExecutor({} as never, vi.fn() as never, new AgentEventHub(), fanout)
    const throwing = vi.fn(() => { throw new Error('socket closed') })
    const healthy = vi.fn()
    const remote = vi.fn()
    first.hub.subscribe(runId, throwing)
    first.hub.subscribe(runId, healthy)
    second.hub.subscribe(runId, remote)
    const event: PublicAgentEvent = {
      version: 2, sequence: '42', run_id: runId, turn_id: turnId,
      type: 'text.delta', data: { delta: 'committed' },
    }

    await expect(
      (first as unknown as { dispatch(event: PublicAgentEvent): Promise<void> }).dispatch(event),
    ).resolves.toBeUndefined()
    await (first as unknown as { dispatch(event: PublicAgentEvent): Promise<void> }).dispatch({
      ...event, sequence: '43',
    })

    expect(throwing).toHaveBeenCalledOnce()
    expect(healthy).toHaveBeenCalledTimes(2)
    expect(remote).toHaveBeenCalledTimes(2)
    await first.close()
    await second.close()
  })

  it('runs bounded periodic recovery and stops the sweeper cleanly', async () => {
    vi.useFakeTimers()
    try {
      const executor = new AgentRunExecutor({} as never, vi.fn() as never)
      const recover = vi.spyOn(executor, 'recover').mockResolvedValue(0)
      executor.startRecoverySweeper(100, 7)
      await vi.advanceTimersByTimeAsync(0)
      expect(recover).toHaveBeenCalledWith(7)
      await vi.advanceTimersByTimeAsync(300)
      expect(recover).toHaveBeenCalledTimes(4)
      await executor.close()
      await vi.advanceTimersByTimeAsync(300)
      expect(recover).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('serializes slow recovery and waits for recovery and execution before closing', async () => {
    vi.useFakeTimers()
    try {
      let releaseRecovery!: () => void
      let releaseExecution!: () => void
      const recoveryGate = new Promise<void>((resolve) => { releaseRecovery = resolve })
      const executionGate = new Promise<void>((resolve) => { releaseExecution = resolve })
      const transaction = vi.fn(async () => {
        await recoveryGate
        return []
      })
      const executor = new AgentRunExecutor({ transaction } as never, vi.fn() as never)
      const execute = vi.spyOn(
        executor as unknown as { execute(runId: string): Promise<void> },
        'execute',
      ).mockImplementation(() => executionGate)
      const controller = new AbortController()
      ;(executor as unknown as { controllers: Map<string, AbortController> })
        .controllers.set(runId, controller)

      executor.start(runId)
      await vi.advanceTimersByTimeAsync(0)
      executor.startRecoverySweeper(100, 7)
      await vi.advanceTimersByTimeAsync(300)
      expect(transaction).toHaveBeenCalledOnce()

      let closed = false
      const close = executor.close().then(() => { closed = true })
      expect(controller.signal.aborted).toBe(true)
      expect(closed).toBe(false)
      executor.start('00000000-0000-4000-8000-000000000003')

      releaseRecovery()
      await vi.advanceTimersByTimeAsync(0)
      expect(closed).toBe(false)
      expect(execute).toHaveBeenCalledOnce()

      releaseExecution()
      await close
      await vi.advanceTimersByTimeAsync(300)
      expect(transaction).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
