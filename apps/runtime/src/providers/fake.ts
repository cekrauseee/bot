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

type FakeNode = { type: 'file'; content: string } | { type: 'directory'; children: Set<string> }

export class FakeFilesystem implements FilesystemProvider, OperationJournalProvider {
  private readonly nodes = new Map<string, FakeNode>()

  constructor() {
    this.nodes.set('/', { type: 'directory', children: new Set(['workspace']) })
    this.nodes.set('/workspace', { type: 'directory', children: new Set() })
  }

  async list(path: string): Promise<readonly DirectoryEntry[]> {
    const node = this.nodes.get(path)
    if (!node || node.type !== 'directory') throw new Error('fake directory not found')
    return [...node.children].sort().map((name) => {
      const childPath = path === '/' ? `/${name}` : `${path}/${name}`
      const child = this.nodes.get(childPath)
      return { name, path: childPath, type: child?.type ?? 'other', size: child?.type === 'file' ? Buffer.byteLength(child.content) : null }
    })
  }

  async read(path: string): Promise<string> {
    const node = this.nodes.get(path)
    if (!node || node.type !== 'file') throw new Error('fake file not found')
    return node.content
  }

  async write(path: string, content: string): Promise<void> {
    const parent = parentPath(path)
    const name = baseName(path)
    this.ensureDirectory(parent)
    const parentNode = this.nodes.get(parent) as { type: 'directory'; children: Set<string> }
    parentNode.children.add(name)
    this.nodes.set(path, { type: 'file', content })
  }

  async createExclusive(path: string, content: string): Promise<boolean> {
    if (this.nodes.has(path)) return false
    await this.write(path, content)
    return true
  }

  async writeAtomic(path: string, content: string): Promise<void> {
    await this.write(path, content)
  }

  private ensureDirectory(path: string): void {
    if (path === '/') return
    const parent = parentPath(path)
    this.ensureDirectory(parent)
    const name = baseName(path)
    const parentNode = this.nodes.get(parent) as { type: 'directory'; children: Set<string> }
    parentNode.children.add(name)
    if (!this.nodes.has(path)) this.nodes.set(path, { type: 'directory', children: new Set() })
  }
}

class FakeShell implements ShellProvider {
  readonly calls: Array<{ command: string; argv: readonly string[]; cwd: string }> = []

  async exec(command: string, argv: readonly string[], cwd: string): Promise<ShellResult> {
    this.calls.push({ command, argv: [...argv], cwd })
    return { command, argv: [...argv], cwd, exitCode: 0, stdout: `${command} ${argv.join(' ')}`.trim(), stderr: '' }
  }
}

class FakeBrowser implements BrowserProvider {
  readonly calls: Array<{ command: string; args: readonly string[] }> = []
  frame: BrowserFrameCapture | undefined
  private currentUrl: string | null = null
  private closed = false

  async open(url: string): Promise<BrowserCommandResult> {
    this.closed = false
    this.currentUrl = url
    return this.command('open', [url], { url })
  }

  async snapshot(): Promise<BrowserCommandResult> {
    return this.command('snapshot', [], { url: this.currentUrl, closed: this.closed })
  }

  async click(selector: string): Promise<BrowserCommandResult> {
    return this.command('click', [selector], null)
  }

  async type(selector: string, text: string): Promise<BrowserCommandResult> {
    return this.command('type', [selector, text], { selector })
  }

  async close(): Promise<void> {
    this.closed = true
    this.calls.push({ command: 'close', args: [] })
  }

  async captureFrame(): Promise<BrowserFrameCapture | undefined> {
    return this.frame
  }

  private command(command: string, args: readonly string[], json: JsonValue | null): BrowserCommandResult {
    this.calls.push({ command, args: [...args] })
    return { stdout: '', stderr: '', json, ...(this.frame ? { frame: this.frame } : {}) }
  }
}

export interface FakeRuntimeProvider extends RuntimeProvider {
  readonly shell: FakeShell
  readonly browsers: ReadonlyMap<string, FakeBrowser>
  browserFor(runId: string): FakeBrowser
}

export function createFakeRuntimeProvider(
  filesystem: FilesystemProvider = new FakeFilesystem(),
  operationJournal?: OperationJournalProvider,
): FakeRuntimeProvider {
  const journal = operationJournal ?? asOperationJournalProvider(filesystem)
  const browsers = new Map<string, FakeBrowser>()
  const browserFor = (runId: string): FakeBrowser => {
    let browser = browsers.get(runId)
    if (!browser) {
      browser = new FakeBrowser()
      browsers.set(runId, browser)
    }
    return browser
  }
  return { filesystem, operationJournal: journal, shell: new FakeShell(), browsers, browserFor, createBrowser: browserFor }
}

function asOperationJournalProvider(filesystem: FilesystemProvider): OperationJournalProvider {
  if ('createExclusive' in filesystem && 'writeAtomic' in filesystem) return filesystem as FilesystemProvider & OperationJournalProvider
  throw new Error('A distinct fake operation journal provider is required.')
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator <= 0 ? '/' : path.slice(0, separator)
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
