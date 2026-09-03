import { createHash as createSha256, randomUUID } from 'node:crypto'

import type { Sandbox, SandboxUser } from '@vercel/sandbox'
import type { VercelSandboxSession } from '@agent-browser/sandbox/vercel'

import type {
  BrowserCommandResult,
  BrowserFrameCapture,
  BrowserProvider,
  DirectoryEntry,
  FilesystemProvider,
  JsonValue,
  OperationJournalProvider,
  RuntimeProvider,
  ShellProvider,
  ShellResult,
} from '../contracts.js'
import { BrowserActionError, RuntimeUnavailableError } from '../errors.js'
import {
  INTERNAL_PARENT_ROOT,
  INTERNAL_STAGING_ROOT,
  INTERNAL_STATE_ROOT,
  OPERATION_JOURNAL_ROOT,
} from '../internal-paths.js'
import { WORKSPACE_ROOT } from '../path.js'
import { redactSensitiveText } from '../security.js'

type VercelSandboxModule = Pick<typeof import('@vercel/sandbox'), 'Sandbox'>

interface AgentBrowserModule {
  installAgentBrowserInVercelSandbox(sandbox: Sandbox, options?: { installSystemDependencies?: boolean }): Promise<unknown>
  runAgentBrowserCommand<TJson = unknown>(sandbox: VercelSandboxSession, args: readonly string[], options?: { json?: boolean; session?: string }): Promise<{
    exitCode: number
    stdout: string
    stderr: string
    json: TJson | null
  }>
}

interface DefaultSandboxUser {
  readonly username: string
  readonly group: string
}

interface ProvisionedSandbox {
  readonly sandbox: Sandbox
  readonly agent: SandboxUser
  readonly defaultUser: DefaultSandboxUser
}

type RuntimeContextFactory = () => Promise<ProvisionedSandbox>

export interface VercelProviderOptions {
  readonly namespace?: string
  readonly runtime?: string
  readonly sandboxTimeoutMs?: number
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly importModule?: (specifier: string) => Promise<unknown>
}

const DEFAULT_NAMESPACE = 'my-bot-runtime'
export const VERCEL_AGENT_USERNAME = 'mybot-agent'
const EXCLUSIVE_FILE_EXISTS_EXIT_CODE = 17
const MAX_BROWSER_FRAME_BASE64_BYTES = 1_500_000
const MAX_BROWSER_FRAME_RAW_BYTES = Math.floor(MAX_BROWSER_FRAME_BASE64_BYTES * 3 / 4)

export function deriveSandboxName(namespace: string, workspaceId: string): string {
  const hash = createHash(workspaceId)
  const safeNamespace = namespace.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || DEFAULT_NAMESPACE
  return `${safeNamespace}-${hash}`.slice(0, 63)
}

export function deriveBrowserSessionName(runId: string): string {
  return `mybot-run-${createSha256('sha256').update(runId).digest('hex').slice(0, 24)}`
}

export function hasVercelCredentials(env: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env): boolean {
  const oidc = Boolean(env.VERCEL_OIDC_TOKEN)
  const accessToken = Boolean(env.VERCEL_TOKEN)
  return oidc || (accessToken && Boolean(env.VERCEL_PROJECT_ID) && Boolean(env.VERCEL_TEAM_ID))
}

export function createVercelProviderFactory(options: VercelProviderOptions = {}) {
  return async (workspaceId: string): Promise<RuntimeProvider> => {
    const environment = options.env ?? process.env
    const namespace = options.namespace ?? environment.RUNTIME_ENVIRONMENT ?? DEFAULT_NAMESPACE
    const snapshotId = environment.AGENT_BROWSER_SNAPSHOT_ID
    const importModule = options.importModule ?? ((specifier: string) => import(specifier))
    let runtimePromise: Promise<ProvisionedSandbox> | undefined
    let provisioning: Promise<Omit<ProvisionedSandbox, 'sandbox'>> | undefined

    const provision = async (sandbox: Sandbox): Promise<Omit<ProvisionedSandbox, 'sandbox'>> => {
      if (provisioning) return provisioning
      const current = provisionSandbox(sandbox)
      provisioning = current
      try {
        return await current
      } finally {
        if (provisioning === current) provisioning = undefined
      }
    }

    const createRuntime = async (): Promise<ProvisionedSandbox> => {
      if (!hasVercelCredentials(environment)) throw new RuntimeUnavailableError()
      try {
        const module = (await importModule('@vercel/sandbox')) as VercelSandboxModule
        let provisionedDuringLookup: Omit<ProvisionedSandbox, 'sandbox'> | undefined
        const sandboxOptions: Record<string, unknown> = {
          name: deriveSandboxName(namespace, workspaceId),
          persistent: true,
          resume: true,
          timeout: options.sandboxTimeoutMs ?? 30 * 60 * 1000,
          onCreate: async (created: Sandbox) => {
            provisionedDuringLookup = await provision(created)
            if (!snapshotId) {
              const agentBrowser = (await importModule('@agent-browser/sandbox/vercel')) as AgentBrowserModule
              await agentBrowser.installAgentBrowserInVercelSandbox(created, { installSystemDependencies: true })
            }
          },
          onResume: async (resumed: Sandbox) => {
            provisionedDuringLookup = await provision(resumed)
          },
        }
        if (snapshotId) sandboxOptions.source = { type: 'snapshot', snapshotId }
        else sandboxOptions.runtime = options.runtime ?? 'node24'
        if (environment.VERCEL_TOKEN && environment.VERCEL_PROJECT_ID && environment.VERCEL_TEAM_ID) {
          sandboxOptions.token = environment.VERCEL_TOKEN
          sandboxOptions.projectId = environment.VERCEL_PROJECT_ID
          sandboxOptions.teamId = environment.VERCEL_TEAM_ID
        }

        const sandbox = await module.Sandbox.getOrCreate(
          sandboxOptions as Parameters<VercelSandboxModule['Sandbox']['getOrCreate']>[0],
        )
        const identity = provisionedDuringLookup ?? await provision(sandbox)
        return { sandbox, ...identity }
      } catch (error) {
        if (error instanceof RuntimeUnavailableError) throw error
        throw new RuntimeUnavailableError()
      }
    }

    const getRuntime: RuntimeContextFactory = () => {
      runtimePromise ??= createRuntime().catch((error) => {
        runtimePromise = undefined
        throw error
      })
      return runtimePromise
    }

    return {
      filesystem: new VercelFilesystem(getRuntime),
      operationJournal: new VercelOperationJournal(getRuntime),
      shell: new VercelShell(getRuntime),
      createBrowser: (runId) => new VercelBrowser(getRuntime, importModule, deriveBrowserSessionName(runId)),
      dispose: async () => { await runtimePromise?.then(({ sandbox }) => sandbox.stop(), () => undefined) },
    }
  }
}

async function provisionSandbox(sandbox: Sandbox): Promise<Omit<ProvisionedSandbox, 'sandbox'>> {
  const agent = await resolveAgentUser(sandbox)
  const defaultUser = await sandbox.getDefaultUser()
  if (defaultUser.username === VERCEL_AGENT_USERNAME) throw new RuntimeUnavailableError()

  const agentUid = await privilegedOutput(sandbox, 'id', ['-u', VERCEL_AGENT_USERNAME])
  const defaultUid = await privilegedOutput(sandbox, 'id', ['-u', defaultUser.username])
  if (!/^\d+$/.test(agentUid) || agentUid === '0' || agentUid === defaultUid) throw new RuntimeUnavailableError()
  const primaryGroup = await privilegedOutput(sandbox, 'id', ['-gn', VERCEL_AGENT_USERNAME])
  const groups = (await privilegedOutput(sandbox, 'id', ['-nG', VERCEL_AGENT_USERNAME])).split(/\s+/).filter(Boolean)
  if (groups.some((group) => group === 'root' || group === 'sudo' || group === 'wheel')) {
    throw new RuntimeUnavailableError()
  }

  const sudoProbe = await agent.runCommand({ cmd: 'sudo', args: ['-n', 'true'], cwd: '/' })
  if (sudoProbe.exitCode === 0) throw new RuntimeUnavailableError()

  await runPrivileged(sandbox, 'install', ['-d', '-m', '0700', '-o', VERCEL_AGENT_USERNAME, '-g', primaryGroup, WORKSPACE_ROOT])
  await runPrivileged(sandbox, 'chown', ['-hR', `${VERCEL_AGENT_USERNAME}:${primaryGroup}`, WORKSPACE_ROOT])
  await runPrivileged(sandbox, 'chmod', ['0700', WORKSPACE_ROOT])

  await runPrivileged(sandbox, 'install', ['-d', '-m', '0711', '-o', 'root', '-g', 'root', INTERNAL_PARENT_ROOT])
  await runPrivileged(sandbox, 'install', ['-d', '-m', '0711', '-o', 'root', '-g', 'root', INTERNAL_STATE_ROOT])
  await runPrivileged(sandbox, 'install', ['-d', '-m', '0700', '-o', 'root', '-g', 'root', OPERATION_JOURNAL_ROOT])
  await runPrivileged(sandbox, 'install', ['-d', '-m', '0700', '-o', defaultUser.username, '-g', defaultUser.group, INTERNAL_STAGING_ROOT])

  return { agent, defaultUser }
}

async function resolveAgentUser(sandbox: Sandbox): Promise<SandboxUser> {
  const existing = await sandbox.runCommand({ cmd: 'id', args: ['-u', VERCEL_AGENT_USERNAME], cwd: '/', sudo: true })
  if (existing.exitCode === 0) return sandbox.asUser(VERCEL_AGENT_USERNAME)
  if (existing.exitCode !== 1) throw new RuntimeUnavailableError()

  try {
    return await sandbox.createUser(VERCEL_AGENT_USERNAME)
  } catch {
    const raced = await sandbox.runCommand({ cmd: 'id', args: ['-u', VERCEL_AGENT_USERNAME], cwd: '/', sudo: true })
    if (raced.exitCode !== 0) throw new RuntimeUnavailableError()
    return sandbox.asUser(VERCEL_AGENT_USERNAME)
  }
}

class VercelFilesystem implements FilesystemProvider {
  constructor(private readonly runtime: RuntimeContextFactory) {}

  async mkdir(path: string, signal?: AbortSignal): Promise<void> {
    const { agent } = await this.runtime()
    signal?.throwIfAborted()
    const result = await agent.runCommand({ cmd: 'mkdir', args: ['-p', '--', path], cwd: '/', signal })
    if (result.exitCode !== 0) throw new Error('workspace directory could not be created')
  }

  async list(path: string, signal?: AbortSignal): Promise<readonly DirectoryEntry[]> {
    const { agent } = await this.runtime()
    signal?.throwIfAborted()
    const result = await agent.runCommand({ cmd: 'node', args: ['-e', LIST_DIRECTORY_SCRIPT, path], cwd: '/', signal })
    if (result.exitCode !== 0) throw new Error('workspace directory could not be listed')
    return parseDirectoryEntries(await result.stdout())
  }

  async read(path: string, signal?: AbortSignal): Promise<string> {
    const { agent } = await this.runtime()
    signal?.throwIfAborted()
    const content = await agent.readFileToBuffer({ path }, { signal })
    if (!content) throw new Error('file not found')
    return content.toString('utf8')
  }

  async write(path: string, content: string, signal?: AbortSignal): Promise<void> {
    const { agent } = await this.runtime()
    signal?.throwIfAborted()
    await this.mkdir(parentPath(path), signal)
    signal?.throwIfAborted()
    await agent.writeFiles([{ path, content: Buffer.from(content, 'utf8'), mode: 0o600 }], { signal })
  }
}

class VercelOperationJournal implements OperationJournalProvider {
  constructor(private readonly runtime: RuntimeContextFactory) {}

  async read(path: string): Promise<string> {
    assertJournalPath(path)
    const { sandbox, defaultUser } = await this.runtime()
    const stagedPath = stagingPath()
    try {
      const copied = await sandbox.runCommand({
        cmd: 'install',
        args: ['-m', '0600', '-o', defaultUser.username, '-g', defaultUser.group, path, stagedPath],
        cwd: '/',
        sudo: true,
      })
      if (copied.exitCode !== 0) throw new Error('journal record is unavailable')
      const content = await sandbox.readFileToBuffer({ path: stagedPath })
      if (!content) throw new Error('journal record is unavailable')
      return content.toString('utf8')
    } finally {
      await removePrivileged(sandbox, stagedPath)
    }
  }

  async createExclusive(path: string, content: string): Promise<boolean> {
    assertJournalPath(path)
    const { sandbox } = await this.runtime()
    const stagedPath = stagingPath()
    const internalTemporaryPath = `${path}.${randomUUID()}.claim`
    await ensureJournalParent(sandbox, path)
    try {
      await sandbox.writeFiles([{ path: stagedPath, content: Buffer.from(content, 'utf8'), mode: 0o600 }])
      const result = await sandbox.runCommand({
        cmd: 'node',
        args: ['-e', CREATE_EXCLUSIVE_FILE_SCRIPT, stagedPath, internalTemporaryPath, path],
        cwd: '/',
        sudo: true,
      })
      if (result.exitCode === 0) return true
      if (result.exitCode === EXCLUSIVE_FILE_EXISTS_EXIT_CODE) return false
      throw new RuntimeUnavailableError()
    } finally {
      await removePrivileged(sandbox, stagedPath)
    }
  }

  async writeAtomic(path: string, content: string): Promise<void> {
    assertJournalPath(path)
    const { sandbox } = await this.runtime()
    const stagedPath = stagingPath()
    const internalTemporaryPath = `${path}.${randomUUID()}.tmp`
    await ensureJournalParent(sandbox, path)
    try {
      await sandbox.writeFiles([{ path: stagedPath, content: Buffer.from(content, 'utf8'), mode: 0o600 }])
      const result = await sandbox.runCommand({
        cmd: 'node',
        args: ['-e', REPLACE_FILE_ATOMICALLY_SCRIPT, stagedPath, internalTemporaryPath, path],
        cwd: '/',
        sudo: true,
      })
      if (result.exitCode !== 0) throw new RuntimeUnavailableError()
    } finally {
      await removePrivileged(sandbox, stagedPath)
    }
  }
}

class VercelShell implements ShellProvider {
  constructor(private readonly runtime: RuntimeContextFactory) {}

  async exec(command: string, argv: readonly string[], cwd: string, signal?: AbortSignal): Promise<ShellResult> {
    const { agent } = await this.runtime()
    signal?.throwIfAborted()
    const result = await agent.runCommand({ cmd: command, args: [...argv], cwd, ...(signal ? { signal } : {}) })
    return { command, argv: [...argv], cwd, exitCode: result.exitCode, stdout: await result.stdout(), stderr: await result.stderr() }
  }
}

class VercelBrowser implements BrowserProvider {
  constructor(
    private readonly runtime: RuntimeContextFactory,
    private readonly importModule: (specifier: string) => Promise<unknown>,
    private readonly sessionName: string,
  ) {}

  open(url: string, signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['open', url], undefined, signal) }
  snapshot(signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['snapshot', '-i', '-c'], { json: true }, signal) }
  click(selector: string, signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['click', selector], undefined, signal) }
  type(selector: string, text: string, signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['type', selector, text], undefined, signal) }
  press(key: string, signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['press', key], undefined, signal) }
  async captureFrame(signal?: AbortSignal): Promise<BrowserFrameCapture | undefined> {
    const context = await this.runtime()
    const module = (await this.importModule('@agent-browser/sandbox/vercel')) as AgentBrowserModule
    return this.captureFrameWithContext(context, module, signal)
  }
  async close(signal?: AbortSignal): Promise<void> { await this.run(['close'], undefined, signal) }

  private async run(args: readonly string[], options?: { json?: boolean }, signal?: AbortSignal): Promise<BrowserCommandResult> {
    try {
      const module = (await this.importModule('@agent-browser/sandbox/vercel')) as AgentBrowserModule
      const context = await this.runtime()
      signal?.throwIfAborted()
      const result = await module.runAgentBrowserCommand(browserSession(context.sandbox, signal), args, { ...options, session: this.sessionName })
      if (result.exitCode !== 0) {
        throw new BrowserActionError(actionFailureMessage(result.stderr, args[0]))
      }
      const frame = args[0] === 'close' ? undefined : await this.captureFrameWithContext(context, module, signal)
      return { stdout: redact(result.stdout), stderr: redact(result.stderr), json: sanitizeJson(result.json), ...(frame ? { frame } : {}) }
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof RuntimeUnavailableError || error instanceof BrowserActionError) throw error
      throw new RuntimeUnavailableError()
    }
  }

  private async captureFrameWithContext(
    context: ProvisionedSandbox,
    module: AgentBrowserModule,
    signal?: AbortSignal,
  ): Promise<BrowserFrameCapture | undefined> {
    const screenshotPath = `${INTERNAL_STAGING_ROOT}/browser-frame-${randomUUID()}.png`
    try {
      signal?.throwIfAborted()
      const capture = await module.runAgentBrowserCommand<{ data?: { path?: string } }>(
        browserSession(context.sandbox, signal),
        ['screenshot', screenshotPath],
        { session: this.sessionName },
      )
      if (capture.json?.data?.path !== screenshotPath) return undefined
      const metadata = await context.sandbox.fs.stat(screenshotPath)
      if (!metadata.isFile() || metadata.size > MAX_BROWSER_FRAME_RAW_BYTES) return undefined
      const content = await context.sandbox.readFileToBuffer({ path: screenshotPath })
      if (!content || content.byteLength > MAX_BROWSER_FRAME_RAW_BYTES) return undefined
      const base64 = content.toString('base64')
      if (Buffer.byteLength(base64, 'utf8') > MAX_BROWSER_FRAME_BASE64_BYTES) return undefined
      return { base64, mime_type: 'image/png', captured_at: new Date().toISOString() }
    } catch (error) {
      throwIfAborted(error, signal)
      return undefined
    } finally {
      await removePrivileged(context.sandbox, screenshotPath)
    }
  }
}

function actionFailureMessage(detail: string | undefined, action = 'browser action'): string {
  const safeDetail = detail && [...redactSensitiveText(detail)]
    .map((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127 ? ' ' : character
    })
    .join('')
    .trim()
    .slice(0, 300)
  return safeDetail ? `The browser ${action} failed: ${safeDetail}` : `The browser ${action} could not be completed.`
}

function throwIfAborted(error: unknown, signal?: AbortSignal): void {
  signal?.throwIfAborted()
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') throw error
}

// The browser helper accepts a session adapter, not an AbortSignal option.
// Forward cancellation through the installed Sandbox SDK's runCommand API.
function browserSession(sandbox: Sandbox, signal?: AbortSignal): VercelSandboxSession {
  return {
    runCommand: (command, args) => {
      signal?.throwIfAborted()
      return sandbox.runCommand(command, [...args], { signal })
    },
    snapshot: () => sandbox.snapshot(),
    stop: async () => { await sandbox.stop() },
  }
}

async function ensureJournalParent(sandbox: Sandbox, path: string): Promise<void> {
  await runPrivileged(sandbox, 'install', ['-d', '-m', '0700', '-o', 'root', '-g', 'root', parentPath(path)])
}

async function runPrivileged(sandbox: Sandbox, command: string, args: readonly string[]): Promise<void> {
  const result = await sandbox.runCommand({ cmd: command, args: [...args], cwd: '/', sudo: true })
  if (result.exitCode !== 0) throw new RuntimeUnavailableError()
}

async function privilegedOutput(sandbox: Sandbox, command: string, args: readonly string[]): Promise<string> {
  const result = await sandbox.runCommand({ cmd: command, args: [...args], cwd: '/', sudo: true })
  if (result.exitCode !== 0) throw new RuntimeUnavailableError()
  return (await result.stdout()).trim()
}

async function removePrivileged(sandbox: Sandbox, path: string): Promise<void> {
  await sandbox.runCommand({ cmd: 'rm', args: ['-f', path], cwd: '/', sudo: true }).catch(() => undefined)
}

function assertJournalPath(path: string): void {
  if (!path.startsWith(`${OPERATION_JOURNAL_ROOT}/`) || path.includes('/../') || path.includes('\0')) {
    throw new Error('invalid internal journal path')
  }
}

function stagingPath(): string {
  return `${INTERNAL_STAGING_ROOT}/journal-${randomUUID()}.json`
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator <= 0 ? '/' : path.slice(0, separator)
}

function createHash(value: string): string {
  return createSha256('sha256').update(value).digest('hex').slice(0, 16)
}

function redact(value: string): string {
  return redactSensitiveText(value)
}

function sanitizeJson(value: unknown): JsonValue | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return redact(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(sanitizeJson).filter((item): item is JsonValue => item !== null)
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {}
    for (const [key, item] of Object.entries(value)) {
      if (/password|token|secret|cookie|authorization|credential|cdp|endpoint/i.test(key)) continue
      const sanitized = sanitizeJson(item)
      if (sanitized !== null) result[key] = sanitized
    }
    return result
  }
  return null
}

function parseDirectoryEntries(raw: string): readonly DirectoryEntry[] {
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value)) throw new Error('invalid workspace directory result')
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid workspace directory result')
    const candidate = entry as Record<string, unknown>
    if (
      typeof candidate.name !== 'string'
      || typeof candidate.path !== 'string'
      || (candidate.type !== 'file' && candidate.type !== 'directory' && candidate.type !== 'other')
      || (candidate.size !== null && typeof candidate.size !== 'number')
    ) throw new Error('invalid workspace directory result')
    return { name: candidate.name, path: candidate.path, type: candidate.type, size: candidate.size }
  })
}

const LIST_DIRECTORY_SCRIPT = [
  "const fs = require('node:fs')",
  'const directory = process.argv[1]',
  "const entries = fs.readdirSync(directory, { withFileTypes: true }).map((entry) => { const path = `${directory}/${entry.name}`; const type = entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other'; let size = null; if (type === 'file') size = fs.lstatSync(path).size; return { name: entry.name, path, type, size } })",
  'process.stdout.write(JSON.stringify(entries))',
].join(';')

const CREATE_EXCLUSIVE_FILE_SCRIPT = [
  "const fs = require('node:fs')",
  'const [source, temporary, target] = process.argv.slice(1)',
  "try { fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL); fs.chmodSync(temporary, 0o600); fs.linkSync(temporary, target) } catch (error) { if (error && error.code === 'EEXIST' && fs.existsSync(target)) process.exit(17); throw error } finally { try { fs.unlinkSync(temporary) } catch {} }",
].join(';')

const REPLACE_FILE_ATOMICALLY_SCRIPT = [
  "const fs = require('node:fs')",
  'const [source, temporary, target] = process.argv.slice(1)',
  "try { fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL); fs.chmodSync(temporary, 0o600); fs.renameSync(temporary, target) } finally { try { fs.unlinkSync(temporary) } catch {} }",
].join(';')
