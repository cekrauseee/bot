import type { BrowserFrameRelay, RuntimeProvider, TrustedControlChannel } from './contracts.js'
import { BrowserController } from './browser-control.js'
import type { ProviderFactory } from './providers/types.js'

export interface RuntimeWorkspace {
  readonly workspaceId: string
  readonly provider: RuntimeProvider
  browser(runId: string): BrowserController
  runExclusive<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T>
  dispose(): Promise<void>
}

class Workspace implements RuntimeWorkspace {
  private tail = Promise.resolve()
  private readonly browsers = new Map<string, BrowserController>()

  constructor(
    readonly workspaceId: string,
    readonly provider: RuntimeProvider,
    private readonly relayFactory: (workspaceId: string, runId: string) => BrowserFrameRelay | undefined,
    private readonly controlChannel?: TrustedControlChannel,
  ) {}

  browser(runId: string): BrowserController {
    let browser = this.browsers.get(runId)
    if (!browser) {
      browser = new BrowserController(
        this.workspaceId,
        runId,
        this.provider.createBrowser(runId),
        this.relayFactory(this.workspaceId, runId),
        this.controlChannel,
      )
      this.browsers.set(runId, browser)
    }
    return browser
  }

  async runExclusive<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted()
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      // Keep the queue slot until its predecessor settles, even when cancelled.
      signal?.throwIfAborted()
      return await operation()
    } finally {
      release()
    }
  }

  async dispose(): Promise<void> {
    await this.runExclusive(async () => {
      await Promise.allSettled([...this.browsers.values()].map((browser) => browser.dispose()))
      this.browsers.clear()
      await this.provider.dispose?.()
    })
  }
}

export class WorkspaceRegistry {
  private readonly workspaces = new Map<string, Promise<RuntimeWorkspace>>()

  constructor(
    private readonly providerFactory: ProviderFactory,
    private readonly relayFactory: (workspaceId: string, runId: string) => BrowserFrameRelay | undefined = () => undefined,
    private readonly controlChannel?: TrustedControlChannel,
  ) {}

  get(workspaceId: string): Promise<RuntimeWorkspace> {
    let workspace = this.workspaces.get(workspaceId)
    if (!workspace) {
      workspace = this.create(workspaceId)
      this.workspaces.set(workspaceId, workspace)
    }
    return workspace
  }

  size(): number {
    return this.workspaces.size
  }

  private async create(workspaceId: string): Promise<RuntimeWorkspace> {
    const provider = await this.providerFactory(workspaceId)
    return new Workspace(workspaceId, provider, this.relayFactory, this.controlChannel)
  }

  async dispose(): Promise<void> {
    const settled = await Promise.allSettled(this.workspaces.values())
    await Promise.all(settled.flatMap((result) => result.status === 'fulfilled' ? [result.value.dispose()] : []))
    this.workspaces.clear()
  }
}
