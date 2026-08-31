import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { FilesystemProvider, RuntimeToolRequest } from '../src/contracts.js'
import { OPERATION_JOURNAL_ROOT } from '../src/internal-paths.js'
import { FakeFilesystem, createFakeRuntimeProvider, type FakeRuntimeProvider } from '../src/providers/fake.js'
import { RuntimeService } from '../src/service.js'

function request(
  tool: RuntimeToolRequest['tool'],
  args: Record<string, unknown>,
  operationId: string,
  workspaceId = 'workspace-1',
): RuntimeToolRequest {
  return {
    version: 2,
    operation_id: operationId,
    run_id: 'run-1',
    conversation_id: 'conversation-1',
    user_id: 'user-1',
    workspace_id: workspaceId,
    tool,
    arguments: args as RuntimeToolRequest['arguments'],
  }
}

describe('durable operation journal', () => {
  it('replays a completed result without executing the side effect again', async () => {
    const provider = createFakeRuntimeProvider()
    const service = serviceFor(provider)
    const invocation = request('shell.exec', { command: 'printf', argv: ['hello'], cwd: '/workspace' }, 'shell-call-1')

    const first = await service.execute(invocation)
    const replay = await service.execute(invocation)

    expect(replay).toEqual(first)
    expect(provider.shell.calls).toHaveLength(1)
  })

  it('requires manual recovery for an ambiguous shell crash window', async () => {
    const provider = createFakeRuntimeProvider()
    const originalExec = provider.shell.exec.bind(provider.shell)
    provider.shell.exec = async (...args) => {
      await originalExec(...args)
      throw new Error('simulated process loss after the command')
    }
    const service = serviceFor(provider)
    const invocation = request('shell.exec', { command: 'touch', argv: ['marker'], cwd: '/workspace' }, 'shell-crash-1')

    await expect(service.execute(invocation)).rejects.toMatchObject({ code: 'operation_failed' })
    await expect(service.execute(invocation)).rejects.toMatchObject({ code: 'manual_recovery_required', retryable: false })
    expect(provider.shell.calls).toHaveLength(1)
  })

  it('requires manual recovery for an ambiguous browser navigation', async () => {
    const provider = createFakeRuntimeProvider()
    const browser = provider.browserFor('run-1')
    const originalOpen = browser.open.bind(browser)
    browser.open = async (url) => {
      await originalOpen(url)
      throw new Error('simulated process loss after navigation')
    }
    const service = serviceFor(provider)
    const invocation = request('browser.open', { url: 'https://example.com' }, 'browser-open-crash-1')

    await expect(service.execute(invocation)).rejects.toMatchObject({ code: 'operation_failed' })
    await expect(service.execute(invocation)).rejects.toMatchObject({ code: 'manual_recovery_required' })
    expect(browser.calls).toEqual([{ command: 'open', args: ['https://example.com/'] }])
  })

  it('rejects an operation id reused with a different canonical payload', async () => {
    const provider = createFakeRuntimeProvider()
    const service = serviceFor(provider)
    await service.execute(request('shell.exec', { command: 'printf', argv: ['one'], cwd: '/workspace' }, 'conflicting-call'))

    await expect(service.execute(
      request('shell.exec', { command: 'printf', argv: ['two'], cwd: '/workspace' }, 'conflicting-call'),
    )).rejects.toMatchObject({ code: 'idempotency_conflict', retryable: false })
    expect(provider.shell.calls).toHaveLength(1)
  })

  it('fingerprints normalized arguments instead of superficial request spelling', async () => {
    const provider = createFakeRuntimeProvider()
    const browser = provider.browserFor('run-1')
    browser.frame = { base64: 'cG5n', mime_type: 'image/png', captured_at: '2026-08-30T12:00:00.000Z' }
    const service = serviceFor(provider)

    const first = await service.execute(request('browser.open', { url: 'https://example.com' }, 'normalized-open'))
    const replay = await service.execute(request('browser.open', { url: 'https://example.com/' }, 'normalized-open'))

    expect(first.result).toMatchObject({
      url: 'https://example.com/',
      browser_frame: { base64: 'cG5n', mime_type: 'image/png' },
    })
    expect(replay.result).toMatchObject({ url: 'https://example.com/' })
    expect(replay.result).not.toHaveProperty('browser_frame')
    expect(browser.calls).toHaveLength(1)

    const digest = createHash('sha256').update('normalized-open').digest('hex')
    const record = await provider.operationJournal.read(`${OPERATION_JOURNAL_ROOT}/v1/${digest.slice(0, 2)}/${digest}.json`)
    expect(record).not.toContain('browser_frame')
    expect(record).not.toContain('cG5n')
  })

  it('scopes the same operation id independently to each workspace', async () => {
    const providers = new Map<string, FakeRuntimeProvider>()
    const service = new RuntimeService({
      providerFactory: async (workspaceId) => {
        const provider = createFakeRuntimeProvider()
        providers.set(workspaceId, provider)
        return provider
      },
    })
    const args = { command: 'printf', argv: ['hello'], cwd: '/workspace' }

    await service.execute(request('shell.exec', args, 'shared-id', 'workspace-a'))
    await service.execute(request('shell.exec', args, 'shared-id', 'workspace-b'))

    expect(providers.get('workspace-a')?.shell.calls).toHaveLength(1)
    expect(providers.get('workspace-b')?.shell.calls).toHaveLength(1)
  })

  it('replays from the durable filesystem after service re-instantiation', async () => {
    const durableFilesystem = new FakeFilesystem()
    const firstProvider = createFakeRuntimeProvider(durableFilesystem)
    const invocation = request('shell.exec', { command: 'printf', argv: ['persisted'], cwd: '/workspace' }, 'restart-call')
    const first = await serviceFor(firstProvider).execute(invocation)

    const restartedProvider = createFakeRuntimeProvider(durableFilesystem)
    const replay = await serviceFor(restartedProvider).execute(invocation)

    expect(replay).toEqual(first)
    expect(firstProvider.shell.calls).toHaveLength(1)
    expect(restartedProvider.shell.calls).toHaveLength(0)
  })

  it('reruns an identical convergent filesystem write after an ambiguous completion', async () => {
    const durableFilesystem = new FakeFilesystem()
    let failAfterWrite = true
    const filesystem: FilesystemProvider = {
      list: (path) => durableFilesystem.list(path),
      read: (path) => durableFilesystem.read(path),
      write: async (path, content) => {
        await durableFilesystem.write(path, content)
        if (path === '/workspace/notes.txt' && failAfterWrite) {
          failAfterWrite = false
          throw new Error('simulated loss after the convergent write')
        }
      },
    }
    const service = serviceFor(createFakeRuntimeProvider(filesystem, durableFilesystem))
    const invocation = request('filesystem.write', { path: 'notes.txt', content: 'same content' }, 'write-crash-1')

    await expect(service.execute(invocation)).rejects.toMatchObject({ code: 'operation_failed' })
    await expect(service.execute(invocation)).resolves.toEqual({ result: { path: '/workspace/notes.txt', written: true } })
    await expect(durableFilesystem.read('/workspace/notes.txt')).resolves.toBe('same content')
  })

  it('keeps journal metadata outside the public workspace and does not persist write payloads', async () => {
    const filesystem = new FakeFilesystem()
    const service = serviceFor(createFakeRuntimeProvider(filesystem))
    const operationId = 'secret-write'
    await service.execute(request('filesystem.write', { path: 'notes.txt', content: 'private-value-never-journaled' }, operationId))

    const listing = await service.execute(request('filesystem.list', { path: '/workspace' }, 'root-list'))
    expect(listing.result).toMatchObject({ entries: [{ name: 'notes.txt' }] })
    expect(JSON.stringify(listing)).not.toContain('/var/lib/mybot')
    await expect(service.execute(request('filesystem.read', { path: OPERATION_JOURNAL_ROOT }, 'internal-read'))).rejects.toMatchObject({ code: 'invalid_request' })

    const digest = createHash('sha256').update(operationId).digest('hex')
    const record = await filesystem.read(`${OPERATION_JOURNAL_ROOT}/v1/${digest.slice(0, 2)}/${digest}.json`)
    expect(record).not.toContain('private-value-never-journaled')
  })

  it('does not replay an oversized side-effect result', async () => {
    const provider = createFakeRuntimeProvider()
    provider.shell.exec = async (command, argv, cwd) => {
      provider.shell.calls.push({ command, argv: [...argv], cwd })
      return { command, argv: [...argv], cwd, exitCode: 0, stdout: 'x'.repeat(1_000_000), stderr: '' }
    }
    const service = serviceFor(provider)
    const invocation = request('shell.exec', { command: 'generate-output', argv: [], cwd: '/workspace' }, 'large-result')

    await expect(service.execute(invocation)).rejects.toMatchObject({ code: 'manual_recovery_required' })
    await expect(service.execute(invocation)).rejects.toMatchObject({ code: 'manual_recovery_required' })
    expect(provider.shell.calls).toHaveLength(1)
  })
})

function serviceFor(provider: FakeRuntimeProvider): RuntimeService {
  return new RuntimeService({ providerFactory: async () => provider })
}
