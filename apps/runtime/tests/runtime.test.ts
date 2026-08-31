import { describe, expect, it, vi } from 'vitest'

import { BrowserController } from '../src/browser-control.js'
import { ControlLeaseError, InvalidRequestError } from '../src/errors.js'
import type { BrowserFrameRelay, RuntimeToolRequest, TrustedControlChannel } from '../src/contracts.js'
import { createFakeRuntimeProvider } from '../src/providers/fake.js'
import { RuntimeService } from '../src/service.js'
import { WorkspaceRegistry } from '../src/workspace.js'
import { parseRuntimeRequest } from '../src/validation.js'
import { InMemoryFrameRelay } from '../src/relay.js'

function request(tool: RuntimeToolRequest['tool'], args: Record<string, unknown>, workspace_id = 'workspace-1'): RuntimeToolRequest {
  return { version: 2, operation_id: `${tool}-operation`, run_id: 'run-1', conversation_id: 'conversation-1', user_id: 'user-1', workspace_id, tool, arguments: args as RuntimeToolRequest['arguments'] }
}

describe('runtime contracts and fake provider', () => {
  it('rejects an already cancelled request before creating a workspace or journal claim', async () => {
    const factory = vi.fn(async () => createFakeRuntimeProvider())
    const service = new RuntimeService({ providerFactory: factory })
    const controller = new AbortController()
    controller.abort()

    await expect(service.execute(request('shell.exec', { command: 'printf', argv: ['cancelled'] }), controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(factory).not.toHaveBeenCalled()
  })

  it('rechecks cancellation after an asynchronous journal claim before side-effect dispatch', async () => {
    const provider = createFakeRuntimeProvider()
    const service = new RuntimeService({ providerFactory: async () => provider })
    const controller = new AbortController()
    const claimed = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const createExclusive = provider.operationJournal.createExclusive.bind(provider.operationJournal)
    const claim = vi.spyOn(provider.operationJournal, 'createExclusive').mockImplementation(async (path, content) => {
      const result = await createExclusive(path, content)
      claimed.resolve()
      await release.promise
      return result
    })
    const execution = service.execute(request('shell.exec', { command: 'printf', argv: ['cancelled'] }), controller.signal)
    const rejection = expect(execution).rejects.toMatchObject({ name: 'AbortError' })
    try {
      await claimed.promise
      controller.abort()
      release.resolve()
      await rejection
      expect(provider.shell.calls).toEqual([])
      // A claimed operation remains conservatively journaled; cancellation never deletes it.
      const record = await provider.operationJournal.read(claim.mock.calls[0]![0])
      expect(JSON.parse(record)).toMatchObject({ state: 'started' })
      await expect(service.execute(request('filesystem.list', {}))).resolves.toBeDefined()
    } finally {
      release.resolve()
      claim.mockRestore()
      await service.dispose()
    }
  })

  it('requires an explicit global workspace id', () => {
    const missing = { version: 2, operation_id: 'list-operation', run_id: 'run-1', conversation_id: 'conversation-1', user_id: 'user-1', tool: 'filesystem.list', arguments: {} }
    expect(() => parseRuntimeRequest(missing)).toThrow('workspace_id')
  })

  it('requires the stable operation id', () => {
    const missing = { version: 2, run_id: 'run-1', conversation_id: 'conversation-1', user_id: 'user-1', workspace_id: 'workspace-1', tool: 'filesystem.list', arguments: {} }
    expect(() => parseRuntimeRequest(missing)).toThrow('operation_id')
  })

  it('rejects host paths and traversal before reaching a provider', () => {
    expect(() => parseRuntimeRequest(request('filesystem.read', { path: '../../etc/passwd' }))).toThrow(InvalidRequestError)
    expect(() => parseRuntimeRequest(request('filesystem.read', { path: '/tmp/file' }))).toThrow(InvalidRequestError)
    expect(() => parseRuntimeRequest(request('shell.exec', { command: 'printf', argv: ['hello'], cwd: '/workspace/../tmp' }))).toThrow(InvalidRequestError)
  })

  it('keeps shell command and argv separate', async () => {
    const provider = createFakeRuntimeProvider()
    const service = new RuntimeService({ providerFactory: async () => provider })
    const result = await service.execute(request('shell.exec', { command: 'printf', argv: ['hello world'], cwd: '/workspace' }))
    expect(provider.shell.calls).toEqual([{ command: 'printf', argv: ['hello world'], cwd: '/workspace' }])
    expect(result.result).toMatchObject({ command: 'printf', argv: ['hello world'], cwd: '/workspace' })
  })

  it('redacts labeled secrets from returned file and shell output', async () => {
    const provider = createFakeRuntimeProvider()
    const service = new RuntimeService({ providerFactory: async () => provider })
    await service.execute(request('filesystem.write', { path: 'config.txt', content: 'token=do-not-return' }))
    const file = await service.execute(request('filesystem.read', { path: 'config.txt' }))
    expect(file.result).toMatchObject({ content: 'token=[REDACTED]' })
    const shell = await service.execute(request('shell.exec', { command: 'env', argv: [], cwd: '/workspace' }))
    expect(shell.result).toMatchObject({ command: 'env' })
  })

  it('uses exactly one provider-backed workspace for concurrent calls', async () => {
    const providers: string[] = []
    const provider = createFakeRuntimeProvider()
    const registry = new WorkspaceRegistry(async (workspaceId) => { providers.push(workspaceId); return provider })
    const service = new RuntimeService({ providerFactory: async () => provider, workspaceRegistry: registry })
    await Promise.all([
      service.execute(request('filesystem.write', { path: 'notes.txt', content: 'one' })),
      service.execute(request('filesystem.read', { path: 'notes.txt' })),
    ])
    expect(providers).toEqual(['workspace-1'])
    expect(registry.size()).toBe(1)
  })

  it('shares filesystem state while isolating concurrent browser controllers by run', async () => {
    const provider = createFakeRuntimeProvider()
    const relayRuns: string[] = []
    const service = new RuntimeService({
      providerFactory: async () => provider,
      relayFactory: (_workspaceId, runId) => { relayRuns.push(runId); return undefined },
    })
    const forRun = (
      runId: string,
      operationId: string,
      tool: RuntimeToolRequest['tool'],
      args: Record<string, unknown>,
    ): RuntimeToolRequest => ({ ...request(tool, args), run_id: runId, operation_id: operationId })

    await Promise.all([
      service.execute(forRun('run-a', 'open-a', 'browser.open', { url: 'https://a.example' })),
      service.execute(forRun('run-b', 'open-b', 'browser.open', { url: 'https://b.example' })),
    ])
    const [snapshotA, snapshotB] = await Promise.all([
      service.execute(forRun('run-a', 'snapshot-a', 'browser.snapshot', {})),
      service.execute(forRun('run-b', 'snapshot-b', 'browser.snapshot', {})),
    ])

    expect(snapshotA.result).toMatchObject({ data: { url: 'https://a.example/' } })
    expect(snapshotB.result).toMatchObject({ data: { url: 'https://b.example/' } })
    expect(provider.browsers.size).toBe(2)
    expect(relayRuns).toEqual(['run-a', 'run-b'])

    await service.execute(forRun('run-a', 'write-a', 'filesystem.write', { path: 'shared.txt', content: 'shared' }))
    const shared = await service.execute(forRun('run-b', 'read-b', 'filesystem.read', { path: 'shared.txt' }))
    expect(shared.result).toMatchObject({ content: 'shared' })

    await service.dispose()
    expect(provider.browserFor('run-a').calls.at(-1)).toEqual({ command: 'close', args: [] })
    expect(provider.browserFor('run-b').calls.at(-1)).toEqual({ command: 'close', args: [] })
  })

  it('requires the single current lease for user-controlled input', async () => {
    const provider = createFakeRuntimeProvider()
    const unavailableBrowser = new BrowserController('workspace-1', 'run-1', provider.browserFor('run-1'))
    await unavailableBrowser.open('https://example.com')
    await expect(unavailableBrowser.requestUserControl()).rejects.toThrow('trusted relay')

    const relayBase = new InMemoryFrameRelay()
    const relay: BrowserFrameRelay = {
      trusted: true,
      publish: (frame) => relayBase.publish(frame),
      subscribe: () => relayBase.subscribe(),
      requestHandoff: (leaseId) => relayBase.requestHandoff(leaseId),
      releaseHandoff: (leaseId) => relayBase.releaseHandoff(leaseId),
    }
    const delivered: Array<{ workspaceId: string; runId: string; leaseId: string }> = []
    const channel: TrustedControlChannel = {
      deliverUserControlLease: async (workspaceId, runId, leaseId) => { delivered.push({ workspaceId, runId, leaseId }) },
      revokeUserControlLease: async () => undefined,
    }
    const browser = new BrowserController('workspace-1', 'run-1', provider.browserFor('run-1'), relay, channel)
    await browser.open('https://example.com')
    const handoff = await browser.requestUserControl()
    const leaseId = delivered[0]?.leaseId
    if (!leaseId) throw new Error('trusted channel did not receive a lease')
    expect(delivered[0]).toMatchObject({ workspaceId: 'workspace-1', runId: 'run-1' })
    expect(handoff.status).not.toHaveProperty('leaseId')
    await expect(browser.click('#button')).rejects.toBeInstanceOf(ControlLeaseError)
    await browser.click('#button', leaseId)
    await expect(browser.releaseControl('wrong-lease')).rejects.toBeInstanceOf(ControlLeaseError)
    await browser.releaseControl(leaseId)
    expect(browser.status()).toMatchObject({ control: 'agent', state: 'live' })
  })

  it('projects the normalized browser URL and captured frame from the controller', async () => {
    const provider = createFakeRuntimeProvider()
    const fakeBrowser = provider.browserFor('run-1')
    fakeBrowser.frame = { base64: 'cG5n', mime_type: 'image/png', captured_at: '2026-08-30T12:00:00.000Z' }
    const browser = new BrowserController('workspace-1', 'run-1', fakeBrowser)

    const result = await browser.open('https://example.com/')

    expect(result).toMatchObject({
      operation: 'open',
      url: 'https://example.com/',
      browser_frame: { base64: 'cG5n', mime_type: 'image/png' },
    })
  })

  it('reattaches a recreated controller to the stable run browser session', async () => {
    const provider = createFakeRuntimeProvider()
    const remoteBrowser = provider.browserFor('run-1')
    await new BrowserController('workspace-1', 'run-1', remoteBrowser)
      .open('https://example.com/')

    const recreated = new BrowserController('workspace-1', 'run-1', remoteBrowser)
    await recreated.click('#continue')
    const snapshot = await recreated.snapshot()

    expect(snapshot).toMatchObject({
      operation: 'snapshot',
      data: { url: 'https://example.com/', closed: false },
    })
    expect(remoteBrowser.calls.map(({ command }) => command)).toEqual([
      'open', 'snapshot', 'click', 'snapshot',
    ])
  })

  it('keeps the newest frame when a relay queue is full', async () => {
    const relay = new InMemoryFrameRelay(1)
    await relay.publish({ sequence: 1, jpegBase64: 'one', width: 1, height: 1, capturedAt: '2026-01-01T00:00:00.000Z' })
    const published = await relay.publish({ sequence: 2, jpegBase64: 'two', width: 1, height: 1, capturedAt: '2026-01-01T00:00:01.000Z' })
    expect(published).toMatchObject({ accepted: true, dropped: 1 })
    const frame = await relay.subscribe()[Symbol.asyncIterator]().next()
    expect(frame.value).toMatchObject({ sequence: 2 })
  })
})
