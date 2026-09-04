import { describe, expect, it, vi } from 'vitest'
import {
  AgentEventHub,
  AgentRunExecutor,
  aiDiagnostic,
  parseAgentEvents,
  type AgentEventFanout,
  type AgentEventFanoutEnvelope,
  type PublicAgentEvent,
  settleActivities,
  withGithubMcp,
  upsertActivity,
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
  it('attaches GitHub MCP credentials only to the private AI request shape', () => {
    const request = { version: 2, user_id: runId }
    const configured = withGithubMcp(request, {
      server_url: 'https://api.githubcopilot.com/mcp/',
      authorization: 'in-memory-token',
      allowed_tools: ['search_repositories', 'get_file_contents'],
      account_login: 'octocat',
    })
    expect(configured.github_mcp).toMatchObject({ server_url: 'https://api.githubcopilot.com/mcp/' })
    expect(request).not.toHaveProperty('github_mcp')
    expect(JSON.stringify({ event: 'turn.started', data: {} })).not.toContain('in-memory-token')
  })

  it('omits GitHub MCP when the connection is disconnected, inactive, or unavailable', () => {
    const request = { version: 2, user_id: runId }
    expect(withGithubMcp(request, undefined)).toEqual(request)
  })

  it('retains safe AI quota diagnostics without trusting arbitrary details', () => {
    expect(aiDiagnostic({
      code: 'provider_error',
      error_code: 'insufficient_quota',
      error_summary: 'untrusted provider body',
    })).toEqual({
      error_category: 'provider_quota',
      error_code: 'insufficient_quota',
      error_summary: 'The AI provider quota is exhausted.',
      retryable: false,
    })
    expect(JSON.stringify(aiDiagnostic({ error_code: 'private-provider-body' })))
      .not.toContain('private-provider-body')
  })

  it('parses chunk-safe durable events and transient browser frames', () => {
    const parsed = parseAgentEvents(
      frame(1, 'plan.updated', { plan: [{ id: 'one', status: 'in_progress' }] }) +
      frame(2, 'browser.frame', {
        frame: {
          base64: 'cG5n', mime_type: 'image/png', captured_at: '2026-08-30T17:00:00Z',
        },
      }) +
      'partial',
    )
    expect(parsed.events.map((event) => event.type)).toEqual([
      'plan.updated', 'browser.frame',
    ])
    expect(parsed.events[1]).toMatchObject({ version: 2, run_id: runId, turn_id: turnId })
    expect(parsed.remainder).toBe('partial')
  })

  it('rejects unknown or mismatched provider events', () => {
    expect(() => parseAgentEvents(frame(1, 'provider.native', {}))).toThrow('invalid_provider_event')
    expect(() => parseAgentEvents(frame(1, 'conversation.title.updated', {
      conversation: { id: 'provider-controlled' },
    }))).toThrow('invalid_provider_event')
    expect(() => parseAgentEvents(
      `event: text.delta\ndata: ${JSON.stringify({
        version: 2, sequence: 1, run_id: runId, turn_id: turnId,
        type: 'reasoning.delta', data: { delta: 'no' },
      })}\n\n`,
    )).toThrow('invalid_provider_event')
  })

  it('accepts and persists skill lifecycle activities', () => {
    const activities: Array<Record<string, unknown>> = []
    upsertActivity(activities, 'skill.started', {
      skill: { id: 'github', name: 'GitHub', detail: 'Loading', status: 'in_progress' },
    })
    upsertActivity(activities, 'skill.completed', {
      skill: { id: 'github', name: 'GitHub', detail: 'Loaded', status: 'completed' },
    })
    expect(activities).toEqual([{
      id: 'github', name: 'GitHub', detail: 'Loaded', status: 'completed', event_type: 'skill.completed',
    }])
  })

  it('settles every open activity when a run becomes terminal', () => {
    const activities: Array<Record<string, unknown>> = [
      { id: 'reasoning', type: 'text', content: 'Working' },
      {
        id: 'tool', name: 'filesystem_read', status: 'in_progress',
        event_type: 'tool.started',
      },
      { id: 'search', type: 'search', status: 'completed' },
    ]

    settleActivities(activities, 'failed')

    expect(activities).toEqual([
      { id: 'reasoning', type: 'text', content: 'Working' },
      {
        id: 'tool', name: 'filesystem_read', status: 'failed',
        event_type: 'tool.completed',
      },
      { id: 'search', type: 'search', status: 'completed' },
    ])
  })

  it('replays the latest process-local browser frame to late subscribers', () => {
    const hub = new AgentEventHub()
    const listener = vi.fn()
    hub.publishBrowserFrame(runId, { jpeg: 'frame' })
    const unsubscribe = hub.subscribeFrames(runId, listener)
    unsubscribe()
    hub.publishBrowserFrame(runId, { jpeg: 'ignored' })
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ jpeg: 'frame' })
  })

  it('clears the cached browser frame when the run becomes terminal', () => {
    const hub = new AgentEventHub()
    hub.publishBrowserFrame(runId, { jpeg: 'frame' })
    hub.publish({
      version: 2, sequence: '1', run_id: runId, turn_id: turnId,
      type: 'turn.completed', data: {},
    })
    const listener = vi.fn()
    hub.subscribeFrames(runId, listener)
    expect(listener).not.toHaveBeenCalled()
  })

  it('supports all-event listeners for cross-run discovery', () => {
    const hub = new AgentEventHub()
    const listener = vi.fn()
    const unsubscribe = hub.subscribeAll(listener)
    const event: PublicAgentEvent = {
      version: 2, sequence: '1', run_id: runId, turn_id: turnId,
      type: 'turn.started', data: {},
    }
    hub.publish(event)
    unsubscribe()
    hub.publish({ ...event, sequence: '2' })
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(event)
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
    const frameData = {
      base64: 'cG5n', mime_type: 'image/png', captured_at: '2026-08-30T17:00:00Z',
    }

    await (first as unknown as {
      dispatchBrowserFrame(runId: string, frame: Record<string, unknown>): Promise<void>
    }).dispatchBrowserFrame(runId, frameData)

    second.hub.subscribeFrames(runId, secondListener)
    expect(firstListener).toHaveBeenCalledOnce()
    expect(secondListener).toHaveBeenCalledOnce()
    expect(firstListener).toHaveBeenCalledWith(frameData)
    expect(secondListener).toHaveBeenCalledWith(frameData)
    await first.close()
    await second.close()
  })

  it('fans cancellation to the instance that owns the active controller', async () => {
    const fanout = new InMemoryAgentEventFanout()
    const first = new AgentRunExecutor({} as never, vi.fn() as never, new AgentEventHub(), fanout)
    const second = new AgentRunExecutor({} as never, vi.fn() as never, new AgentEventHub(), fanout)
    const controller = new AbortController()
    ;(second as unknown as { controllers: Map<string, AbortController> })
      .controllers.set(runId, controller)
    const secondStart = vi.spyOn(second, 'start').mockImplementation(() => undefined)
    const firstStart = vi.spyOn(first, 'start').mockImplementation(() => undefined)

    first.cancel(runId)
    await Promise.resolve()

    expect(firstStart).toHaveBeenCalledWith(runId, undefined)
    expect(secondStart).toHaveBeenCalledWith(runId, undefined)
    expect(controller.signal.aborted).toBe(true)
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
