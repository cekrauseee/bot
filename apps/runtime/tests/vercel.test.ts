import { runAgentBrowserCommand } from '@agent-browser/sandbox/vercel'
import { describe, expect, it, vi } from 'vitest'

import { INTERNAL_STAGING_ROOT, OPERATION_JOURNAL_ROOT } from '../src/internal-paths.js'
import {
  createVercelProviderFactory,
  deriveBrowserSessionName,
  deriveSandboxName,
  hasVercelCredentials,
  VERCEL_AGENT_USERNAME,
} from '../src/providers/vercel.js'

interface CommandParams {
  readonly cmd: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly sudo?: boolean
  readonly signal?: AbortSignal
}

interface RecordedCommand extends CommandParams {
  readonly scope: 'agent' | 'sandbox'
}

interface SandboxDoubleOptions {
  readonly agentCanSudo?: boolean
  readonly frame?: Buffer
  readonly lookup?: 'create' | 'existing' | 'resume'
  readonly raceOnCreateUser?: boolean
  readonly userExists?: boolean
}

function commandResult(exitCode = 0, stdout = '', stderr = '') {
  return { exitCode, stdout: async () => stdout, stderr: async () => stderr }
}

function createSandboxDouble(options: SandboxDoubleOptions = {}) {
  const commands: RecordedCommand[] = []
  const browserCommands: Array<{ args: readonly string[]; options?: { json?: boolean; session?: string } }> = []
  const stagedFiles = new Map<string, Buffer>()
  const journalFiles = new Map<string, Buffer>()
  let userExists = options.userExists ?? false
  let createUserCalls = 0
  let getOrCreateCalls = 0
  let installBrowserCalls = 0
  let stopCalls = 0
  let optionsSeen: Record<string, unknown> | undefined

  const agent = {
    username: VERCEL_AGENT_USERNAME,
    homeDir: `/home/${VERCEL_AGENT_USERNAME}`,
    runCommand: async (params: CommandParams) => {
      commands.push({ ...params, scope: 'agent' })
      if (params.cmd === 'sudo') return commandResult(options.agentCanSudo ? 0 : 1, '', options.agentCanSudo ? '' : 'permission denied')
      if (params.cmd === 'node' && params.args?.[0] === '-e') return commandResult(0, '[]')
      if (params.cmd === 'whoami') return commandResult(0, `${VERCEL_AGENT_USERNAME}\n`)
      return commandResult()
    },
    readFileToBuffer: async ({ path }: { path: string }) => stagedFiles.get(path) ?? null,
    writeFiles: async (files: Array<{ path: string; content: string | Uint8Array }>) => {
      for (const file of files) stagedFiles.set(file.path, Buffer.from(file.content))
    },
  }

  const sandbox = {
    fs: {
      stat: async (path: string) => ({
        size: stagedFiles.get(path)?.byteLength ?? 0,
        isFile: () => stagedFiles.has(path),
      }),
    },
    runCommand: async (command: CommandParams | string, commandArgs?: readonly string[], commandOptions?: { signal?: AbortSignal }) => {
      const params = typeof command === 'string' ? { cmd: command, args: commandArgs, ...commandOptions } : command
      commands.push({ ...params, scope: 'sandbox' })
      const args = params.args ?? []
      if (params.cmd === 'id' && args[0] === '-u' && args[1] === VERCEL_AGENT_USERNAME) return commandResult(userExists ? 0 : 1, userExists ? '1001\n' : '')
      if (params.cmd === 'id' && args[0] === '-u' && args[1] === 'vercel') return commandResult(0, '1000\n')
      if (params.cmd === 'id' && args[0] === '-gn') return commandResult(0, `${VERCEL_AGENT_USERNAME}\n`)
      if (params.cmd === 'id' && args[0] === '-nG') return commandResult(0, `${VERCEL_AGENT_USERNAME}\n`)
      if (params.cmd === 'install' && args[0] === '-m') {
        const source = args.at(-2)
        const destination = args.at(-1)
        const content = source ? journalFiles.get(source) : undefined
        if (!destination || !content) return commandResult(1)
        stagedFiles.set(destination, content)
        return commandResult()
      }
      if (params.cmd === 'node' && params.sudo) {
        const stagedPath = args[2]
        const temporaryPath = args[3]
        const targetPath = args[4]
        if (!stagedPath || !temporaryPath || !targetPath) return commandResult(1)
        const content = stagedFiles.get(stagedPath)
        if (!content) return commandResult(1)
        if (temporaryPath.endsWith('.claim') && journalFiles.has(targetPath)) return commandResult(17)
        journalFiles.set(targetPath, content)
        return commandResult()
      }
      if (params.cmd === 'rm') {
        const path = args.at(-1)
        if (path) stagedFiles.delete(path)
      }
      return commandResult()
    },
    createUser: async () => {
      createUserCalls += 1
      userExists = true
      if (options.raceOnCreateUser) throw new Error('user already exists')
      return agent
    },
    asUser: () => agent,
    getDefaultUser: async () => ({ username: 'vercel', group: 'vercel' }),
    readFileToBuffer: async ({ path }: { path: string }) => stagedFiles.get(path) ?? null,
    writeFiles: async (files: Array<{ path: string; content: string | Uint8Array }>) => {
      for (const file of files) stagedFiles.set(file.path, Buffer.from(file.content))
    },
    stop: async () => { stopCalls += 1 },
  }

  const importModule = async (specifier: string): Promise<unknown> => {
    if (specifier === '@vercel/sandbox') {
      return { Sandbox: { getOrCreate: async (lookupOptions: Record<string, unknown>) => {
        getOrCreateCalls += 1
        optionsSeen = lookupOptions
        if (options.lookup === 'create') await (lookupOptions.onCreate as (value: typeof sandbox) => Promise<void>)(sandbox)
        if (options.lookup === 'resume') await (lookupOptions.onResume as (value: typeof sandbox) => Promise<void>)(sandbox)
        return sandbox
      } } }
    }
    return {
      installAgentBrowserInVercelSandbox: async () => { installBrowserCalls += 1 },
      runAgentBrowserCommand: async (_sandbox: unknown, args: readonly string[], commandOptions?: { json?: boolean; session?: string }) => {
        browserCommands.push({ args: [...args], options: commandOptions })
        if (args[0] === 'screenshot') {
          const path = args[1]
          if (!path) throw new Error('missing screenshot path')
          if (options.frame) stagedFiles.set(path, options.frame)
          return { exitCode: 0, stdout: '', stderr: '', json: { data: { path } } }
        }
        return { exitCode: 0, stdout: '', stderr: '', json: { data: { ok: true } } }
      },
    }
  }

  return {
    agent,
    sandbox,
    browserCommands,
    commands,
    importModule,
    journalFiles,
    stagedFiles,
    stats: () => ({ createUserCalls, getOrCreateCalls, installBrowserCalls, optionsSeen, stopCalls }),
  }
}

describe('Vercel provider boundaries', () => {
  it.each(['shell', 'browser'] as const)('forwards cancellation to the installed SDK execution boundary for %s commands', async (kind) => {
    const test = createSandboxDouble({ lookup: 'existing', userExists: true })
    const importModule = async (specifier: string) => specifier === '@agent-browser/sandbox/vercel'
      ? { runAgentBrowserCommand }
      : test.importModule(specifier)
    const provider = await createVercelProviderFactory({ env: { VERCEL_OIDC_TOKEN: 'present' }, importModule })('workspace-1')
    // Complete shared provisioning before testing cancellation of this operation.
    await provider.filesystem.list('/workspace')
    const controller = new AbortController()
    const started = Promise.withResolvers<AbortSignal | undefined>()
    const block = (signal?: AbortSignal) => {
      started.resolve(signal)
      return new Promise<ReturnType<typeof commandResult>>((_resolve, reject) => {
        if (signal?.aborted) reject(signal.reason)
        else signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }
    const spy = kind === 'shell'
      ? vi.spyOn(test.agent, 'runCommand').mockImplementation((params) => block(params.signal))
      : vi.spyOn(test.sandbox, 'runCommand').mockImplementation((command, _args, options) => block(typeof command === 'string' ? options?.signal : command.signal))
    const execution = kind === 'shell'
      ? provider.shell.exec('sleep', ['60'], '/workspace', controller.signal)
      : provider.createBrowser('run-1').click('#submit', controller.signal)
    const rejected = expect(execution).rejects.toMatchObject({ name: 'AbortError' })
    try {
      expect(await started.promise).toBe(controller.signal)
      controller.abort()
      await rejected
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      controller.abort()
      spy.mockRestore()
    }
  })

  it('derives deterministic provider-safe names without raw workspace data', () => {
    const name = deriveSandboxName('prod/eu west', 'workspace/user/with-sensitive-data')
    expect(name).toBe(deriveSandboxName('prod/eu west', 'workspace/user/with-sensitive-data'))
    expect(name).toMatch(/^prod-eu-west-[0-9a-f]{16}$/)
    expect(name).not.toContain('sensitive')
    expect(name.length).toBeLessThanOrEqual(63)
  })

  it('recognizes only safe credential presence', () => {
    expect(hasVercelCredentials({})).toBe(false)
    expect(hasVercelCredentials({ VERCEL_OIDC_TOKEN: 'present' })).toBe(true)
    expect(hasVercelCredentials({ VERCEL_TOKEN: 'present' })).toBe(false)
    expect(hasVercelCredentials({ VERCEL_TOKEN: 'present', VERCEL_PROJECT_ID: 'project' })).toBe(false)
    expect(hasVercelCredentials({ VERCEL_TOKEN: 'present', VERCEL_PROJECT_ID: 'project', VERCEL_TEAM_ID: 'team' })).toBe(true)
  })

  it('provisions a fresh persistent sandbox, isolated agent user, and root-only journal', async () => {
    const test = createSandboxDouble({ lookup: 'create' })
    const factory = createVercelProviderFactory({ env: { VERCEL_OIDC_TOKEN: 'present' }, importModule: test.importModule })
    const provider = await factory('workspace-1')

    await provider.filesystem.list('/workspace')
    await provider.dispose?.()

    expect(test.stats()).toMatchObject({ createUserCalls: 1, getOrCreateCalls: 1, installBrowserCalls: 1, stopCalls: 1 })
    expect(test.stats().optionsSeen).toMatchObject({ persistent: true, resume: true, runtime: 'node24' })
    expect(test.commands).toContainEqual(expect.objectContaining({ scope: 'agent', cmd: 'sudo', args: ['-n', 'true'] }))
    expect(test.commands).toContainEqual(expect.objectContaining({
      scope: 'sandbox',
      cmd: 'install',
      sudo: true,
      args: ['-d', '-m', '0700', '-o', 'root', '-g', 'root', OPERATION_JOURNAL_ROOT],
    }))
    expect(test.commands).toContainEqual(expect.objectContaining({
      scope: 'sandbox',
      cmd: 'install',
      sudo: true,
      args: ['-d', '-m', '0700', '-o', 'vercel', '-g', 'vercel', INTERNAL_STAGING_ROOT],
    }))
  })

  it.each(['existing', 'resume'] as const)('resolves and provisions an %s sandbox before running tools', async (lookup) => {
    const test = createSandboxDouble({ lookup, userExists: true })
    const factory = createVercelProviderFactory({
      env: { VERCEL_OIDC_TOKEN: 'present', AGENT_BROWSER_SNAPSHOT_ID: 'snapshot-1' },
      importModule: test.importModule,
    })
    const provider = await factory('workspace-1')

    const result = await provider.shell.exec('whoami', [], '/workspace')

    expect(result.stdout.trim()).toBe(VERCEL_AGENT_USERNAME)
    expect(test.stats()).toMatchObject({ createUserCalls: 0, getOrCreateCalls: 1, installBrowserCalls: 0 })
    expect(test.commands).toContainEqual({ scope: 'agent', cmd: 'whoami', args: [], cwd: '/workspace' })
    expect(test.commands.some((command) => command.scope === 'sandbox' && command.cmd === 'whoami')).toBe(false)
    expect(test.stats().optionsSeen).toMatchObject({ resume: true, source: { type: 'snapshot', snapshotId: 'snapshot-1' } })
  })

  it('tolerates a concurrent createUser winner and resolves the existing agent user', async () => {
    const test = createSandboxDouble({ lookup: 'existing', raceOnCreateUser: true })
    const provider = await createVercelProviderFactory({ env: { VERCEL_OIDC_TOKEN: 'present' }, importModule: test.importModule })('workspace-1')

    await expect(provider.filesystem.list('/workspace')).resolves.toEqual([])
    expect(test.stats().createUserCalls).toBe(1)
    expect(test.commands.filter((command) => command.scope === 'sandbox' && command.cmd === 'id' && command.args?.[0] === '-u' && command.args?.[1] === VERCEL_AGENT_USERNAME).length).toBeGreaterThanOrEqual(2)
  })

  it('fails closed if the dedicated agent user can obtain sudo', async () => {
    const test = createSandboxDouble({ agentCanSudo: true, lookup: 'existing', userExists: true })
    const provider = await createVercelProviderFactory({ env: { VERCEL_OIDC_TOKEN: 'present' }, importModule: test.importModule })('workspace-1')

    await expect(provider.shell.exec('whoami', [], '/workspace')).rejects.toMatchObject({ code: 'runtime_unavailable' })
    expect(test.commands.some((command) => command.scope === 'agent' && command.cmd === 'whoami')).toBe(false)
  })

  it('uses only the privileged internal path for journal claim, read, and atomic replacement', async () => {
    const test = createSandboxDouble({ lookup: 'existing', userExists: true })
    const provider = await createVercelProviderFactory({ env: { VERCEL_OIDC_TOKEN: 'present' }, importModule: test.importModule })('workspace-1')
    const recordPath = `${OPERATION_JOURNAL_ROOT}/v1/aa/record.json`

    await expect(provider.operationJournal.createExclusive(recordPath, '{"state":"started"}')).resolves.toBe(true)
    await expect(provider.operationJournal.createExclusive(recordPath, '{"state":"started"}')).resolves.toBe(false)
    await provider.operationJournal.writeAtomic(recordPath, '{"state":"completed"}')
    await expect(provider.operationJournal.read(recordPath)).resolves.toBe('{"state":"completed"}')

    const journalCommands = test.commands.filter((command) => command.scope === 'sandbox' && command.args?.some((arg) => arg.includes('record.json')))
    expect(journalCommands.length).toBeGreaterThan(0)
    expect(journalCommands.every((command) => command.sudo === true)).toBe(true)
    expect(journalCommands.every((command) => command.args?.every((arg) => !arg.includes('/workspace/.mybot')))).toBe(true)
    expect([...test.journalFiles.keys()]).toEqual([recordPath])
    expect([...test.stagedFiles.keys()].every((path) => !path.startsWith(INTERNAL_STAGING_ROOT))).toBe(true)
  })

  it('captures a bounded PNG frame after a browser action and removes the temporary file', async () => {
    const frame = Buffer.from('png-frame')
    const test = createSandboxDouble({ frame, lookup: 'existing', userExists: true })
    const provider = await createVercelProviderFactory({ env: { VERCEL_OIDC_TOKEN: 'present' }, importModule: test.importModule })('workspace-1')

    const result = await provider.createBrowser('run-1').open('https://example.com/')

    expect(result.frame).toMatchObject({ base64: frame.toString('base64'), mime_type: 'image/png' })
    expect(result.frame?.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(test.browserCommands[0]?.args).toEqual(['open', 'https://example.com/'])
    expect(test.browserCommands[1]?.args[0]).toBe('screenshot')
    expect(test.browserCommands[1]?.args[1]).toMatch(new RegExp(`^${INTERNAL_STAGING_ROOT}/browser-frame-`))
    expect(test.browserCommands.every((command) => command.options?.session === deriveBrowserSessionName('run-1'))).toBe(true)
    expect([...test.stagedFiles.keys()].some((path) => path.includes('browser-frame-'))).toBe(false)
  })

  it('keeps a successful browser action when its frame exceeds the transport bound', async () => {
    const test = createSandboxDouble({ frame: Buffer.alloc(1_200_000), lookup: 'existing', userExists: true })
    const provider = await createVercelProviderFactory({ env: { VERCEL_OIDC_TOKEN: 'present' }, importModule: test.importModule })('workspace-1')

    const result = await provider.createBrowser('run-1').snapshot()

    expect(result.json).toEqual({ data: { ok: true } })
    expect(result.frame).toBeUndefined()
  })

  it('keeps a successful browser action when screenshot capture fails', async () => {
    const test = createSandboxDouble({ lookup: 'existing', userExists: true })
    const provider = await createVercelProviderFactory({ env: { VERCEL_OIDC_TOKEN: 'present' }, importModule: test.importModule })('workspace-1')

    const result = await provider.createBrowser('run-1').click('#submit')

    expect(result.json).toEqual({ data: { ok: true } })
    expect(result.frame).toBeUndefined()
    expect(test.browserCommands.map((command) => command.args[0])).toEqual(['click', 'screenshot'])
  })

  it('uses distinct stable agent-browser session names for concurrent runs', async () => {
    const test = createSandboxDouble({ lookup: 'existing', userExists: true })
    const provider = await createVercelProviderFactory({ env: { VERCEL_OIDC_TOKEN: 'present' }, importModule: test.importModule })('workspace-1')

    await Promise.all([
      provider.createBrowser('run-a').open('https://a.example/'),
      provider.createBrowser('run-b').open('https://b.example/'),
    ])

    const openCalls = test.browserCommands.filter((command) => command.args[0] === 'open')
    expect(openCalls.map((command) => command.options?.session)).toEqual([
      deriveBrowserSessionName('run-a'),
      deriveBrowserSessionName('run-b'),
    ])
    expect(deriveBrowserSessionName('run-a')).not.toBe(deriveBrowserSessionName('run-b'))
    expect(deriveBrowserSessionName('run-a')).toBe(deriveBrowserSessionName('run-a'))
  })
})
