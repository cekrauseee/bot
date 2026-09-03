import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import {
  buildAgentBrowserArgv,
  createAgentBrowserCommandResult,
} from '@agent-browser/sandbox'

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
import { OPERATION_JOURNAL_ROOT } from '../internal-paths.js'
import { redactSensitiveText } from '../security.js'
import type { ProviderFactory } from './types.js'

const DEFAULT_DOCKER_IMAGE = 'my-bot-runtime-dev:latest'
const DEFAULT_NAMESPACE = 'my-bot-runtime-dev'
const CONTAINER_SPEC_VERSION = '1'
const AGENT_USER = '10001:10001'
const ROOT_USER = '0:0'
const MAX_COMMAND_OUTPUT_BYTES = 8_000_000
const MAX_BROWSER_FRAME_BASE64_BYTES = 1_500_000
const MAX_BROWSER_FRAME_RAW_BYTES = Math.floor(MAX_BROWSER_FRAME_BASE64_BYTES * 3 / 4)
const DOCKERFILE_PATH = fileURLToPath(new URL('../../Dockerfile.dev', import.meta.url))
const DOCKER_BUILD_CONTEXT = fileURLToPath(new URL('../..', import.meta.url))

interface DockerCommandResult {
  readonly exitCode: number
  readonly stdout: Buffer
  readonly stderr: Buffer
}

interface DockerRunOptions {
  readonly input?: Buffer | string
  readonly maxOutputBytes?: number
  readonly signal?: AbortSignal
}

export interface DockerCommandRunner {
  run(args: readonly string[], options?: DockerRunOptions): Promise<DockerCommandResult>
}

export interface DockerProviderOptions {
  readonly image?: string
  readonly namespace?: string
  readonly runner?: DockerCommandRunner
}

interface ContainerInspection {
  readonly Image?: unknown
  readonly State?: { readonly Running?: unknown }
  readonly Config?: {
    readonly Labels?: Readonly<Record<string, string>> | null
  }
}

interface DockerWorkspace {
  readonly container: string
  readonly runner: DockerCommandRunner
}

export function deriveDockerResourceNames(namespace: string, workspaceId: string) {
  const hash = createHash('sha256').update(workspaceId).digest('hex').slice(0, 16)
  const safeNamespace = namespace
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 32) || DEFAULT_NAMESPACE
  const prefix = `${safeNamespace}-${hash}`
  return {
    container: prefix.slice(0, 63),
    stateVolume: `${prefix}-state`,
    workspaceHash: hash,
    workspaceVolume: `${prefix}-workspace`,
  }
}

export function createDockerProviderFactory(options: DockerProviderOptions = {}): ProviderFactory {
  const runner = options.runner ?? createDockerCommandRunner()
  const image = options.image ?? DEFAULT_DOCKER_IMAGE
  const namespace = options.namespace ?? DEFAULT_NAMESPACE
  let imagePromise: Promise<string> | undefined

  const ensureImage = (): Promise<string> => {
    imagePromise ??= resolveImage(runner, image).catch((error) => {
      imagePromise = undefined
      throw error
    })
    return imagePromise
  }

  return async (workspaceId: string): Promise<RuntimeProvider> => {
    const names = deriveDockerResourceNames(namespace, workspaceId)
    let workspacePromise: Promise<DockerWorkspace> | undefined

    const workspace = (): Promise<DockerWorkspace> => {
      workspacePromise ??= ensureDockerWorkspace(runner, image, ensureImage, names).catch((error) => {
        workspacePromise = undefined
        throw error
      })
      return workspacePromise
    }

    return {
      filesystem: new DockerFilesystem(workspace),
      operationJournal: new DockerOperationJournal(workspace),
      shell: new DockerShell(workspace),
      createBrowser: (runId) => new DockerBrowser(workspace, deriveBrowserSessionName(runId)),
      dispose: async () => {
        if (!workspacePromise) return
        const resolved = await workspacePromise.catch(() => undefined)
        if (resolved) await runner.run(['stop', '--time', '2', resolved.container]).catch(() => undefined)
      },
    }
  }
}

export function createDockerCommandRunner(binary = 'docker'): DockerCommandRunner {
  return {
    run(args, options = {}) {
      return runCommand(binary, args, options)
    },
  }
}

export function hasDockerAccess(binary = 'docker'): boolean {
  const result = spawnSync(binary, ['info', '--format', '{{.ServerVersion}}'], {
    stdio: 'ignore',
    timeout: 3_000,
  })
  return result.status === 0
}

async function resolveImage(runner: DockerCommandRunner, image: string): Promise<string> {
  let inspection = await runner.run(['image', 'inspect', '--format', '{{.Id}}', image])
  if (inspection.exitCode !== 0) {
    inspection = await runner.run(['build', '--tag', image, '--file', DOCKERFILE_PATH, DOCKER_BUILD_CONTEXT])
    if (inspection.exitCode !== 0) throw new RuntimeUnavailableError()
    inspection = await runner.run(['image', 'inspect', '--format', '{{.Id}}', image])
  }
  const imageId = inspection.stdout.toString('utf8').trim()
  if (inspection.exitCode !== 0 || !imageId.startsWith('sha256:')) throw new RuntimeUnavailableError()
  return imageId
}

async function ensureDockerWorkspace(
  runner: DockerCommandRunner,
  image: string,
  ensureImage: () => Promise<string>,
  names: ReturnType<typeof deriveDockerResourceNames>,
): Promise<DockerWorkspace> {
  const imageId = await ensureImage()
  const inspection = await inspectContainer(runner, names.container)
  if (inspection) {
    const labels = inspection.Config?.Labels ?? {}
    if (labels['io.mybot.runtime.workspace'] !== names.workspaceHash) {
      throw new RuntimeUnavailableError()
    }
    if (inspection.Image !== imageId || labels['io.mybot.runtime.spec'] !== CONTAINER_SPEC_VERSION) {
      await checked(runner, ['rm', '--force', names.container])
    } else {
      if (inspection.State?.Running !== true) await checked(runner, ['start', names.container])
      return { container: names.container, runner }
    }
  }

  await checked(runner, [
    'run', '--detach',
    '--name', names.container,
    '--label', `io.mybot.runtime.workspace=${names.workspaceHash}`,
    '--label', `io.mybot.runtime.spec=${CONTAINER_SPEC_VERSION}`,
    '--user', AGENT_USER,
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true',
    '--pids-limit', '512',
    '--memory', '2g',
    '--cpus', '2',
    '--shm-size', '512m',
    '--init',
    '--mount', `type=volume,source=${names.workspaceVolume},target=/workspace`,
    '--mount', `type=volume,source=${names.stateVolume},target=/var/lib/mybot/runtime`,
    '--tmpfs', '/tmp:rw,nosuid,nodev,mode=1777,size=536870912',
    '--tmpfs', '/home/mybot-agent:rw,nosuid,nodev,uid=10001,gid=10001,mode=0700,size=536870912',
    image,
  ])
  return { container: names.container, runner }
}

async function inspectContainer(runner: DockerCommandRunner, container: string): Promise<ContainerInspection | undefined> {
  const result = await runner.run(['container', 'inspect', container])
  if (result.exitCode !== 0) return undefined
  try {
    const value: unknown = JSON.parse(result.stdout.toString('utf8'))
    if (!Array.isArray(value) || !value[0] || typeof value[0] !== 'object') throw new Error()
    return value[0] as ContainerInspection
  } catch {
    throw new RuntimeUnavailableError()
  }
}

class DockerFilesystem implements FilesystemProvider {
  constructor(private readonly workspace: () => Promise<DockerWorkspace>) {}

  async mkdir(path: string, signal?: AbortSignal): Promise<void> {
    const workspace = await this.workspace()
    await checked(workspace.runner, execArgs(workspace.container, ['mkdir', '-p', '--', path]), { signal })
  }

  async list(path: string, signal?: AbortSignal): Promise<readonly DirectoryEntry[]> {
    const workspace = await this.workspace()
    const result = await checked(
      workspace.runner,
      execArgs(workspace.container, ['node', '-e', LIST_DIRECTORY_SCRIPT, path]),
      { signal },
    )
    return parseDirectoryEntries(result.stdout.toString('utf8'))
  }

  async read(path: string, signal?: AbortSignal): Promise<string> {
    const workspace = await this.workspace()
    const result = await checked(
      workspace.runner,
      execArgs(workspace.container, ['node', '-e', READ_FILE_SCRIPT, path]),
      { signal },
    )
    return result.stdout.toString('utf8')
  }

  async write(path: string, content: string, signal?: AbortSignal): Promise<void> {
    await this.mkdir(parentPath(path), signal)
    const workspace = await this.workspace()
    await checked(
      workspace.runner,
      execArgs(workspace.container, ['node', '-e', WRITE_FILE_SCRIPT, path]),
      { input: content, signal },
    )
  }
}

class DockerOperationJournal implements OperationJournalProvider {
  constructor(private readonly workspace: () => Promise<DockerWorkspace>) {}

  async read(path: string): Promise<string> {
    assertJournalPath(path)
    const workspace = await this.workspace()
    const result = await checked(
      workspace.runner,
      execArgs(workspace.container, ['node', '-e', READ_FILE_SCRIPT, path], ROOT_USER),
    )
    return result.stdout.toString('utf8')
  }

  async createExclusive(path: string, content: string): Promise<boolean> {
    assertJournalPath(path)
    const workspace = await this.workspace()
    await ensureJournalParent(workspace, path)
    const result = await workspace.runner.run(
      execArgs(workspace.container, ['node', '-e', CREATE_EXCLUSIVE_FILE_SCRIPT, path], ROOT_USER),
      { input: content },
    )
    if (result.exitCode === 0) return true
    if (result.exitCode === 17) return false
    throw new RuntimeUnavailableError()
  }

  async writeAtomic(path: string, content: string): Promise<void> {
    assertJournalPath(path)
    const workspace = await this.workspace()
    await ensureJournalParent(workspace, path)
    await checked(
      workspace.runner,
      execArgs(
        workspace.container,
        ['node', '-e', REPLACE_FILE_ATOMICALLY_SCRIPT, path, `${path}.${randomUUID()}.tmp`],
        ROOT_USER,
      ),
      { input: content },
    )
  }
}

class DockerShell implements ShellProvider {
  constructor(private readonly workspace: () => Promise<DockerWorkspace>) {}

  async exec(command: string, argv: readonly string[], cwd: string, signal?: AbortSignal): Promise<ShellResult> {
    const workspace = await this.workspace()
    const result = await workspace.runner.run(
      ['exec', '--workdir', cwd, workspace.container, command, ...argv],
      { signal },
    )
    return {
      command,
      argv: [...argv],
      cwd,
      exitCode: result.exitCode,
      stdout: result.stdout.toString('utf8'),
      stderr: result.stderr.toString('utf8'),
    }
  }
}

class DockerBrowser implements BrowserProvider {
  constructor(
    private readonly workspace: () => Promise<DockerWorkspace>,
    private readonly sessionName: string,
  ) {}

  open(url: string, signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['open', url], signal) }
  snapshot(signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['snapshot', '-i', '-c'], signal) }
  click(selector: string, signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['click', selector], signal) }
  type(selector: string, text: string, signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['type', selector, text], signal) }
  press(key: string, signal?: AbortSignal): Promise<BrowserCommandResult> { return this.run(['press', key], signal) }
  captureFrame(signal?: AbortSignal): Promise<BrowserFrameCapture | undefined> { return this.capture(signal) }
  async close(signal?: AbortSignal): Promise<void> { await this.run(['close'], signal) }

  private async run(args: readonly string[], signal?: AbortSignal): Promise<BrowserCommandResult> {
    try {
      const workspace = await this.workspace()
      const argv = buildAgentBrowserArgv(args, { session: this.sessionName })
      const command = await workspace.runner.run(
        execArgs(workspace.container, ['agent-browser', ...argv]),
        { signal },
      )
      if (command.exitCode !== 0) {
        throw new BrowserActionError(actionFailureMessage(command.stderr.toString('utf8'), args[0]))
      }
      const stdout = command.stdout.toString('utf8')
      const stderr = command.stderr.toString('utf8')
      const parsed = createAgentBrowserCommandResult({ command: 'agent-browser', exitCode: 0, stdout, stderr })
      const frame = args[0] === 'close' ? undefined : await this.capture(signal)
      return {
        stdout: redactSensitiveText(stdout),
        stderr: redactSensitiveText(stderr),
        json: sanitizeJson(parsed.json),
        ...(frame ? { frame } : {}),
      }
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof RuntimeUnavailableError || error instanceof BrowserActionError) throw error
      throw new RuntimeUnavailableError()
    }
  }

  private async capture(signal?: AbortSignal): Promise<BrowserFrameCapture | undefined> {
    const path = `/tmp/browser-frame-${randomUUID()}.png`
    try {
      const workspace = await this.workspace()
      const capture = await checked(
        workspace.runner,
        execArgs(workspace.container, [
          'agent-browser',
          ...buildAgentBrowserArgv(['screenshot', path], { session: this.sessionName }),
        ]),
        { signal },
      )
      const parsed = createAgentBrowserCommandResult({
        command: 'agent-browser screenshot',
        exitCode: 0,
        stdout: capture.stdout.toString('utf8'),
        stderr: capture.stderr.toString('utf8'),
      })
      if (!hasCapturedPath(parsed.json, path)) return undefined
      const content = await checked(
        workspace.runner,
        execArgs(workspace.container, ['node', '-e', READ_FILE_SCRIPT, path]),
        { maxOutputBytes: MAX_BROWSER_FRAME_RAW_BYTES, signal },
      )
      if (content.stdout.byteLength > MAX_BROWSER_FRAME_RAW_BYTES) return undefined
      const base64 = content.stdout.toString('base64')
      if (Buffer.byteLength(base64, 'utf8') > MAX_BROWSER_FRAME_BASE64_BYTES) return undefined
      return { base64, mime_type: 'image/png', captured_at: new Date().toISOString() }
    } catch (error) {
      signal?.throwIfAborted()
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') throw error
      return undefined
    } finally {
      const workspace = await this.workspace().catch(() => undefined)
      if (workspace) {
        await workspace.runner.run(execArgs(workspace.container, ['rm', '-f', '--', path])).catch(() => undefined)
      }
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

function execArgs(container: string, command: readonly string[], user?: string): string[] {
  return ['exec', '--interactive', ...(user ? ['--user', user] : []), container, ...command]
}

async function ensureJournalParent(workspace: DockerWorkspace, path: string): Promise<void> {
  await checked(
    workspace.runner,
    execArgs(workspace.container, ['install', '-d', '-m', '0700', '-o', 'root', '-g', 'root', parentPath(path)], ROOT_USER),
  )
}

async function checked(
  runner: DockerCommandRunner,
  args: readonly string[],
  options?: DockerRunOptions,
): Promise<DockerCommandResult> {
  const result = await runner.run(args, options)
  if (result.exitCode !== 0) throw new RuntimeUnavailableError()
  return result
}

function runCommand(binary: string, args: readonly string[], options: DockerRunOptions): Promise<DockerCommandResult> {
  options.signal?.throwIfAborted()
  const maxOutputBytes = options.maxOutputBytes ?? MAX_COMMAND_OUTPUT_BYTES
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], { stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', abort)
      callback()
    }
    const failForOutput = () => {
      child.kill('SIGKILL')
      finish(() => reject(new RuntimeUnavailableError()))
    }
    const collect = (target: Buffer[], kind: 'stdout' | 'stderr') => (chunk: Buffer) => {
      target.push(chunk)
      if (kind === 'stdout') stdoutBytes += chunk.byteLength
      else stderrBytes += chunk.byteLength
      if (stdoutBytes > maxOutputBytes || stderrBytes > maxOutputBytes) failForOutput()
    }
    const abort = () => {
      child.kill('SIGTERM')
      finish(() => reject(options.signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError')))
    }

    options.signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', collect(stdout, 'stdout'))
    child.stderr.on('data', collect(stderr, 'stderr'))
    child.once('error', (error) => finish(() => reject(error)))
    child.once('exit', (code) => finish(() => resolve({
      exitCode: code ?? 1,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
    })))
    child.stdin.once('error', () => undefined)
    child.stdin.end(options.input)
  })
}

function deriveBrowserSessionName(runId: string): string {
  return `mybot-run-${createHash('sha256').update(runId).digest('hex').slice(0, 24)}`
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

function sanitizeJson(value: unknown): JsonValue | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return redactSensitiveText(value)
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

function hasCapturedPath(value: unknown, path: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = (value as { data?: unknown }).data
  return Boolean(data && typeof data === 'object' && !Array.isArray(data) && (data as { path?: unknown }).path === path)
}

function assertJournalPath(path: string): void {
  if (!path.startsWith(`${OPERATION_JOURNAL_ROOT}/`) || path.includes('/../') || path.includes('\0')) {
    throw new Error('invalid internal journal path')
  }
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator <= 0 ? '/' : path.slice(0, separator)
}

const LIST_DIRECTORY_SCRIPT = [
  "const fs = require('node:fs')",
  'const directory = process.argv[1]',
  "const entries = fs.readdirSync(directory, { withFileTypes: true }).map((entry) => { const path = `${directory}/${entry.name}`; const type = entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other'; let size = null; if (type === 'file') size = fs.lstatSync(path).size; return { name: entry.name, path, type, size } })",
  'process.stdout.write(JSON.stringify(entries))',
].join(';')

const READ_FILE_SCRIPT = "process.stdout.write(require('node:fs').readFileSync(process.argv[1]))"
const WRITE_FILE_SCRIPT = "require('node:fs').writeFileSync(process.argv[1], require('node:fs').readFileSync(0), { mode: 0o600 })"
const CREATE_EXCLUSIVE_FILE_SCRIPT = [
  "const fs = require('node:fs')",
  'try { const file = fs.openSync(process.argv[1], \'wx\', 0o600); try { fs.writeFileSync(file, fs.readFileSync(0)) } finally { fs.closeSync(file) } } catch (error) { if (error && error.code === \'EEXIST\') process.exit(17); throw error }',
].join(';')
const REPLACE_FILE_ATOMICALLY_SCRIPT = [
  "const fs = require('node:fs')",
  'const [target, temporary] = process.argv.slice(1)',
  "try { const file = fs.openSync(temporary, 'wx', 0o600); try { fs.writeFileSync(file, fs.readFileSync(0)) } finally { fs.closeSync(file) }; fs.renameSync(temporary, target) } finally { try { fs.unlinkSync(temporary) } catch {} }",
].join(';')
