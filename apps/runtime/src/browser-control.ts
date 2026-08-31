import { randomBytes } from 'node:crypto'

import type { BrowserCommandResult, BrowserFrameRelay, BrowserLifecycle, BrowserProvider, BrowserStatus, JsonObject, JsonValue, TrustedControlChannel } from './contracts.js'
import { ConflictError, ControlLeaseError, RuntimeUnavailableError } from './errors.js'

const DEFAULT_LEASE_MS = 5 * 60 * 1000

export class BrowserController {
  private lifecycle: BrowserLifecycle = 'stopped'
  private control: BrowserStatus['control'] = 'agent'
  private lease: { id: string; expiresAt: number } | null = null

  constructor(
    private readonly workspaceId: string,
    private readonly runId: string,
    private readonly provider: BrowserProvider,
    private readonly relay?: BrowserFrameRelay,
    private readonly controlChannel?: TrustedControlChannel,
    private readonly leaseMs = DEFAULT_LEASE_MS,
  ) {}

  status(): BrowserStatus {
    this.expireLease()
    return {
      control: this.control,
      state: this.lifecycle,
      leaseExpiresAt: this.lease ? new Date(this.lease.expiresAt).toISOString() : null,
    }
  }

  async open(url: string, signal?: AbortSignal): Promise<JsonObject> {
    signal?.throwIfAborted()
    if (this.lease) await this.relay?.releaseHandoff(this.lease.id).catch(() => undefined)
    this.lease = null
    this.control = 'agent'
    this.lifecycle = 'launching'
    try {
      signal?.throwIfAborted()
      const result = await this.provider.open(url, signal)
      this.lifecycle = 'live'
      return this.withResult({ operation: 'open', url }, result)
    } catch (error) {
      this.lifecycle = error instanceof RuntimeUnavailableError ? 'failed' : 'failed'
      throw error
    }
  }

  async snapshot(signal?: AbortSignal): Promise<JsonObject> {
    signal?.throwIfAborted()
    if (this.lifecycle === 'stopped') {
      this.lifecycle = 'launching'
      try {
        const result = await this.provider.snapshot(signal)
        this.lifecycle = 'live'
        return this.withResult({ operation: 'snapshot' }, result)
      } catch (error) {
        this.lifecycle = 'failed'
        throw error
      }
    }
    this.ensureLive()
    return this.providerOperation('snapshot', () => this.provider.snapshot(signal))
  }

  async click(selector: string, leaseId?: string, signal?: AbortSignal): Promise<JsonObject> {
    await this.attachIfStopped(signal)
    signal?.throwIfAborted()
    this.ensureLive()
    this.ensureInputControl(leaseId)
    return this.providerOperation('click', () => this.provider.click(selector, signal))
  }

  async type(selector: string, text: string, leaseId?: string, signal?: AbortSignal): Promise<JsonObject> {
    await this.attachIfStopped(signal)
    signal?.throwIfAborted()
    this.ensureLive()
    this.ensureInputControl(leaseId)
    return this.providerOperation('type', () => this.provider.type(selector, text, signal))
  }

  async requestUserControl(): Promise<JsonObject> {
    this.ensureLive()
    if (!this.relay?.trusted || !this.controlChannel) throw new ConflictError('User control is unavailable without a trusted relay.')
    this.expireLease()
    if (this.lease) throw new ControlLeaseError('Browser control is already leased.')
    const id = randomBytes(24).toString('base64url')
    const expiresAt = Date.now() + this.leaseMs
    this.lease = { id, expiresAt }
    this.control = 'user'
    this.lifecycle = 'awaiting_user'
    try {
      await this.relay?.requestHandoff(id)
      await this.controlChannel.deliverUserControlLease(this.workspaceId, this.runId, id, new Date(expiresAt).toISOString())
    } catch (error) {
      await this.relay?.releaseHandoff(id).catch(() => undefined)
      this.lease = null
      this.control = 'agent'
      this.lifecycle = 'live'
      throw error
    }
    const frame = await this.provider.captureFrame?.().catch(() => undefined)
    return {
      reason: 'User control is awaiting input.',
      status: this.status() as unknown as JsonValue,
      ...(frame ? { browser_frame: frame as unknown as JsonValue } : {}),
    }
  }

  async releaseControl(leaseId: string): Promise<JsonObject> {
    this.ensureLiveOrAwaiting()
    this.ensureLease(leaseId)
    await this.relay?.releaseHandoff(leaseId)
    await this.controlChannel?.revokeUserControlLease(this.workspaceId, this.runId, leaseId)
    this.lease = null
    this.control = 'agent'
    this.lifecycle = 'live'
    return { status: this.status() as unknown as JsonValue }
  }

  async close(signal?: AbortSignal): Promise<JsonObject> {
    signal?.throwIfAborted()
    if (this.lifecycle === 'stopped') return { status: this.status() as unknown as JsonValue }
    try {
      await this.provider.close(signal)
    } catch (error) {
      this.lifecycle = 'failed'
      throw error
    }
    if (this.lease) await this.relay?.releaseHandoff(this.lease.id).catch(() => undefined)
    if (this.lease) await this.controlChannel?.revokeUserControlLease(this.workspaceId, this.runId, this.lease.id).catch(() => undefined)
    this.lease = null
    this.control = 'agent'
    this.lifecycle = 'stopped'
    return { status: this.status() as unknown as JsonValue }
  }

  async dispose(): Promise<void> {
    if (this.lifecycle !== 'stopped') await this.close().catch(() => undefined)
  }

  private ensureLive(): void {
    if (this.lifecycle !== 'live' && this.lifecycle !== 'awaiting_user') throw new RuntimeUnavailableError()
  }

  private async attachIfStopped(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    if (this.lifecycle !== 'stopped') return
    this.lifecycle = 'launching'
    try {
      await this.provider.snapshot(signal)
      this.lifecycle = 'live'
    } catch (error) {
      this.lifecycle = 'failed'
      throw error
    }
  }

  private ensureLiveOrAwaiting(): void {
    if (this.lifecycle !== 'live' && this.lifecycle !== 'awaiting_user') throw new RuntimeUnavailableError()
  }

  private ensureInputControl(leaseId?: string): void {
    this.expireLease()
    if (this.control === 'locked') throw new ControlLeaseError('Browser input is locked.')
    if (this.control === 'user') this.ensureLease(leaseId)
  }

  private ensureLease(leaseId?: string): void {
    this.expireLease()
    if (!leaseId || !this.lease || this.lease.id !== leaseId) throw new ControlLeaseError()
  }

  private expireLease(): void {
    if (this.lease && this.lease.expiresAt <= Date.now()) {
      this.lease = null
      this.control = 'agent'
      if (this.lifecycle === 'awaiting_user') this.lifecycle = 'live'
    }
  }

  private withResult(base: JsonObject, result: BrowserCommandResult): JsonObject {
    return {
      ...base,
      stdout: result.stdout,
      stderr: result.stderr,
      ...(result.json === null ? {} : { data: result.json }),
      ...(result.frame ? { browser_frame: result.frame as unknown as JsonValue } : {}),
      status: this.status() as unknown as JsonValue,
    }
  }

  private async providerOperation(operation: string, call: () => Promise<BrowserCommandResult>): Promise<JsonObject> {
    try {
      return this.withResult({ operation }, await call())
    } catch (error) {
      this.lifecycle = 'failed'
      throw error
    }
  }
}
