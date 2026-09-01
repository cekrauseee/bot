import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import type { RuntimeToolRequest } from '../src/contracts.js'
import { IdempotencyConflictError, InvalidRequestError } from '../src/errors.js'
import { OperationJournal } from '../src/operation-journal.js'
import { createFakeRuntimeProvider } from '../src/providers/fake.js'
import { RuntimeService } from '../src/service.js'
import { parseRuntimeRequest } from '../src/validation.js'

const projectPath = '/workspace/projects/my-site-123'

function request(tool: RuntimeToolRequest['tool'], args: RuntimeToolRequest['arguments'], workingDirectory = projectPath): RuntimeToolRequest {
  return {
    version: 2, operation_id: randomUUID(), run_id: 'run-1', conversation_id: 'conversation-1',
    user_id: 'user-1', workspace_id: 'workspace-1', working_directory: workingDirectory,
    tool, arguments: args,
  }
}

describe('project working directories', () => {
  it('prepares the project directory and resolves omitted file and command paths there', async () => {
    const provider = createFakeRuntimeProvider()
    const service = new RuntimeService({ providerFactory: async () => provider })
    const list = await service.execute(parseRuntimeRequest(request('filesystem.list', {})))
    expect(list.result).toEqual({ path: projectPath, entries: [] })
    await service.execute(parseRuntimeRequest(request('shell.exec', { command: 'pwd', argv: [] })))
    expect(provider.shell.calls).toEqual([{ command: 'pwd', argv: [], cwd: projectPath }])
    await service.execute(request('filesystem.write', { path: 'notes.md', content: 'project notes' }))
    expect(await provider.filesystem.read(`${projectPath}/notes.md`)).toBe('project notes')
    expect((await service.execute(request('filesystem.read', { path: 'notes.md' }))).result)
      .toMatchObject({ path: `${projectPath}/notes.md`, content: 'project notes' })
    await service.dispose()
  })

  it('shares absolute workspace paths between project and projectless runs without changing their defaults', async () => {
    const provider = createFakeRuntimeProvider()
    const factory = vi.fn(async () => provider)
    const service = new RuntimeService({ providerFactory: factory })
    await service.execute(request('filesystem.write', { path: 'notes.md', content: 'first project' }))
    await service.execute({
      ...request('filesystem.write', { path: 'notes.md', content: 'second project' }, '/workspace/projects/other'),
      run_id: 'run-2', conversation_id: 'conversation-2',
    })
    expect((await service.execute({
      ...request('filesystem.read', { path: `${projectPath}/notes.md` }, '/workspace'),
      run_id: 'run-3', conversation_id: 'conversation-3',
    })).result).toMatchObject({ content: 'first project' })
    expect(await provider.filesystem.read('/workspace/projects/other/notes.md')).toBe('second project')
    await service.execute(request('shell.exec', { command: 'pwd', argv: [], cwd: '/workspace/projects/other' }))
    expect(provider.shell.calls.at(-1)?.cwd).toBe('/workspace/projects/other')
    expect(factory).toHaveBeenCalledOnce()
    await service.dispose()
  })

  it('keeps old root-context operation IDs replayable with the new envelope', async () => {
    const provider = createFakeRuntimeProvider()
    const write = vi.spyOn(provider.filesystem, 'write')
    const service = new RuntimeService({ providerFactory: async () => provider })
    const legacy = request('filesystem.write', { path: 'notes.md', content: 'existing' })
    delete (legacy as { working_directory?: string }).working_directory
    await service.execute(legacy)
    await service.execute({ ...legacy, working_directory: '/workspace' })
    expect(write.mock.calls.filter(([path]) => path === '/workspace/notes.md')).toHaveLength(1)
    expect(parseRuntimeRequest({ ...legacy, tool: 'filesystem.list', arguments: {} }))
      .toMatchObject({ working_directory: '/workspace', arguments: { path: '/workspace' } })
    await service.dispose()
  })

  it('includes the resolved path in operation identity', async () => {
    const provider = createFakeRuntimeProvider()
    const service = new RuntimeService({ providerFactory: async () => provider })
    const first = request('filesystem.write', { path: 'notes.md', content: 'one' })
    await service.execute(first)
    await expect(service.execute({ ...first, working_directory: '/workspace/projects/other' }))
      .rejects.toBeInstanceOf(IdempotencyConflictError)
    await service.dispose()
  })

  it('replays pre-existing journal records with trailing-slash tool paths unchanged', async () => {
    const provider = createFakeRuntimeProvider()
    const service = new RuntimeService({ providerFactory: async () => provider })
    const legacy = request('filesystem.list', { path: '/workspace/existing/' }, '/workspace')
    delete (legacy as { working_directory?: string }).working_directory
    const result = { path: '/workspace/existing/', entries: [] }
    await new OperationJournal(provider.operationJournal).execute(legacy, async () => result)
    await expect(service.execute({ ...legacy, working_directory: '/workspace' })).resolves.toEqual({ result })
    await service.dispose()
  })

  it('rejects a relative path that exceeds the limit after adding the working directory', () => {
    expect(() => parseRuntimeRequest(request('filesystem.read', { path: 'a'.repeat(4_090) })))
      .toThrow(InvalidRequestError)
  })

  it.each([
    'relative', '/tmp', '/workspace-other', '/workspace/../tmp', '/workspace/a/../b',
    '/workspace/a\\b', '/workspace/a\u0000b', '/workspace/a\nb', '/workspace/a/',
    '/workspace/a/./b', '/workspace//a', '/workspace/' + 'a'.repeat(4_096),
  ])('rejects invalid working directory %j before provisioning', async (workingDirectory) => {
    const factory = vi.fn(async () => createFakeRuntimeProvider())
    const service = new RuntimeService({ providerFactory: factory })
    const input = request('filesystem.list', {}, workingDirectory)
    expect(() => parseRuntimeRequest(input)).toThrow(InvalidRequestError)
    await expect(service.execute(input)).rejects.toBeInstanceOf(InvalidRequestError)
    expect(factory).not.toHaveBeenCalled()
  })

  it('does not allow root file replacement or host paths through a project context', () => {
    for (const path of ['/workspace/', '/workspace/.', '../private', '/etc/passwd', 'C:/host']) {
      expect(() => parseRuntimeRequest(request('filesystem.write', { path, content: 'no' })))
        .toThrow(InvalidRequestError)
    }
  })

  it('does not prepare folders for browser-only actions', async () => {
    const provider = createFakeRuntimeProvider()
    const mkdir = vi.spyOn(provider.filesystem, 'mkdir')
    const service = new RuntimeService({ providerFactory: async () => provider })
    await service.execute(request('browser.open', { url: 'https://example.com' }))
    expect(mkdir).not.toHaveBeenCalled()
    await service.dispose()
  })

  it('does not claim or execute a tool cancelled during directory preparation', async () => {
    const provider = createFakeRuntimeProvider()
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.spyOn(provider.filesystem, 'mkdir').mockImplementation(async () => {
      started.resolve()
      await release.promise
    })
    const claim = vi.spyOn(provider.operationJournal, 'createExclusive')
    const service = new RuntimeService({ providerFactory: async () => provider })
    const controller = new AbortController()
    const rejected = expect(service.execute(request('shell.exec', { command: 'pwd', argv: [] }), controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    controller.abort()
    release.resolve()
    await rejected
    expect(claim).not.toHaveBeenCalled()
    expect(provider.shell.calls).toEqual([])
    await service.dispose()
  })

  it('never overwrites a file when a project directory cannot be prepared', async () => {
    const provider = createFakeRuntimeProvider()
    await provider.filesystem.write(projectPath, 'keep this file')
    const claim = vi.spyOn(provider.operationJournal, 'createExclusive')
    const service = new RuntimeService({ providerFactory: async () => provider })
    await expect(service.execute(request('shell.exec', { command: 'pwd', argv: [] }))).rejects.toThrow()
    expect(await provider.filesystem.read(projectPath)).toBe('keep this file')
    expect(claim).not.toHaveBeenCalled()
    expect(provider.shell.calls).toEqual([])
    await service.dispose()
  })
})
