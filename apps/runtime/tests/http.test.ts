import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RuntimeToolRequest } from '../src/contracts.js'
import { createRuntimeServer } from '../src/http.js'
import { createFakeRuntimeProvider } from '../src/providers/fake.js'
import { RuntimeService } from '../src/service.js'

const body = {
  version: 2,
  operation_id: 'list-operation',
  run_id: 'run-1',
  conversation_id: 'conversation-1',
  user_id: 'user-1',
  workspace_id: 'workspace-1',
  tool: 'filesystem.list',
  arguments: { path: '/workspace' },
}

describe('runtime HTTP boundary', () => {
  const servers: Array<ReturnType<typeof createRuntimeServer>> = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
    vi.restoreAllMocks()
  })

  it('resolves a project context over HTTP while retaining shared-workspace access', async () => {
    const provider = createFakeRuntimeProvider()
    const service = new RuntimeService({ providerFactory: async () => provider })
    const server = createRuntimeServer({ service, serviceToken: 'service-secret' })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const post = (input: Record<string, unknown>) => fetch(`http://127.0.0.1:${port}/tools`, {
      method: 'POST',
      headers: { authorization: 'Bearer service-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, ...input }),
    })
    try {
      const written = await post({
        operation_id: 'project-write', working_directory: '/workspace/projects/site',
        tool: 'filesystem.write', arguments: { path: 'notes.md', content: 'shared notes' },
      })
      expect(written.status).toBe(200)
      expect(await written.json()).toEqual({ result: { path: '/workspace/projects/site/notes.md', written: true } })
      const read = await post({
        operation_id: 'root-read', run_id: 'run-2', conversation_id: 'conversation-2',
        tool: 'filesystem.read', arguments: { path: '/workspace/projects/site/notes.md' },
      })
      expect(read.status).toBe(200)
      expect(await read.json()).toMatchObject({ result: { content: 'shared notes' } })
      const shell = await post({
        operation_id: 'project-shell', working_directory: '/workspace/projects/site',
        tool: 'shell.exec', arguments: { command: 'pwd', argv: [] },
      })
      expect(shell.status).toBe(200)
      expect(await shell.json()).toMatchObject({ result: { cwd: '/workspace/projects/site' } })
    } finally {
      await service.dispose()
    }
  })

  it.each([
    ['shell.exec', { command: 'printf', argv: ['must not execute'] }],
    ['browser.click', { selector: '#submit' }],
  ] as const)('never dispatches queued %s after the client disconnects', async (tool, args) => {
    const provider = createFakeRuntimeProvider()
    const service = new RuntimeService({ providerFactory: async () => provider })
    const workspace = await service.workspaces.get(body.workspace_id)
    const blocked = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const predecessor = workspace.runExclusive(async () => {
      entered.resolve()
      await blocked.promise
    })
    await entered.promise

    const queued = Promise.withResolvers<AbortSignal>()
    const settled = Promise.withResolvers<void>()
    const runExclusive = workspace.runExclusive.bind(workspace)
    vi.spyOn(workspace, 'runExclusive').mockImplementation((operation, signal) => {
      const result = runExclusive(operation, signal)
      if (signal) {
        queued.resolve(signal)
        void result.then(() => settled.resolve(), () => settled.resolve())
      }
      return result
    })
    const journal = vi.spyOn(provider.operationJournal, 'createExclusive')
    const server = createRuntimeServer({ service, serviceToken: 'service-secret' })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const controller = new AbortController()
    const requestBody: RuntimeToolRequest = { ...body, version: 2, tool, arguments: { ...args }, operation_id: 'cancelled-operation' }
    const response = fetch(`http://127.0.0.1:${port}/tools`, {
      method: 'POST',
      headers: { authorization: 'Bearer service-secret', 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    }).catch((error: unknown) => error)

    let successorRan = false
    let successor: Promise<void> | undefined
    try {
      const signal = await queued.promise
      const aborted = once(signal, 'abort')
      controller.abort()
      await aborted
      expect(await response).toMatchObject({ name: 'AbortError' })

      // A cancelled queue slot must neither bypass its predecessor nor strand followers.
      successor = workspace.runExclusive(async () => { successorRan = true })
      await Promise.resolve()
      expect(successorRan).toBe(false)
      expect(journal).not.toHaveBeenCalled()
      blocked.resolve()
      await Promise.all([predecessor, settled.promise, successor])

      expect(successorRan).toBe(true)
      expect(journal).not.toHaveBeenCalled()
      expect(provider.shell.calls).toEqual([])
      expect(provider.browsers.size).toBe(0)
    } finally {
      controller.abort()
      blocked.resolve()
      await predecessor
      await successor
      await service.dispose()
    }
  })

  it('does not abort execution when a normal response closes', async () => {
    const service = new RuntimeService({ providerFactory: async () => createFakeRuntimeProvider() })
    const execute = vi.spyOn(service, 'execute')
    const server = createRuntimeServer({ service, serviceToken: 'service-secret' })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const response = await fetch(`http://127.0.0.1:${port}/tools`, {
      method: 'POST',
      headers: { authorization: 'Bearer service-secret', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(200)
    await response.json()
    expect(execute.mock.calls[0]?.[1]?.aborted).toBe(false)
  })

  it('requires the service token and returns only normalized JSON', async () => {
    const service = new RuntimeService({ providerFactory: async () => createFakeRuntimeProvider() })
    const server = createRuntimeServer({ service, serviceToken: 'service-secret' })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port

    const unauthorized = await fetch(`http://127.0.0.1:${port}/tools`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized.', retryable: false } })

    const authorized = await fetch(`http://127.0.0.1:${port}/tools`, { method: 'POST', headers: { authorization: 'Bearer service-secret', 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect(authorized.status).toBe(200)
    expect(await authorized.json()).toEqual({ result: { path: '/workspace', entries: [] } })
  })

  it('does not require provider credentials to start', async () => {
    const service = new RuntimeService({ providerFactory: async () => { throw new Error('provider must not be called') } })
    const server = createRuntimeServer({ service, serviceToken: 'service-secret' })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const health = await fetch(`http://127.0.0.1:${port}/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok', service: 'runtime' })

    const ready = await fetch(`http://127.0.0.1:${port}/ready`)
    expect(ready.status).toBe(503)
    expect(await ready.json()).toEqual({ status: 'unavailable', service: 'runtime', reason: 'provider_credentials_missing' })
  })

  it('reports readiness separately when provider credentials are configured', async () => {
    const service = new RuntimeService({ providerFactory: async () => createFakeRuntimeProvider() })
    const server = createRuntimeServer({ service, serviceToken: 'service-secret', isReady: () => true })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port

    const ready = await fetch(`http://127.0.0.1:${port}/ready`)
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({ status: 'ready', service: 'runtime' })
  })
})
