export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export type RuntimeToolName =
  | 'filesystem.list'
  | 'filesystem.read'
  | 'filesystem.write'
  | 'shell.exec'
  | 'browser.open'
  | 'browser.snapshot'
  | 'browser.click'
  | 'browser.type'
  | 'browser.request_user_control'
  | 'browser.release_control'
  | 'browser.close'

export interface RuntimeToolRequest {
  readonly version: 2
  readonly operation_id: string
  readonly run_id: string
  readonly conversation_id: string
  readonly user_id: string
  readonly workspace_id: string
  readonly working_directory?: string
  readonly tool: RuntimeToolName
  readonly arguments: JsonObject
}

export interface RuntimeToolResponse {
  readonly result: JsonValue
}

export interface DirectoryEntry {
  readonly name: string
  readonly path: string
  readonly type: 'file' | 'directory' | 'other'
  readonly size: number | null
}

export interface FilesystemProvider {
  mkdir(path: string, signal?: AbortSignal): Promise<void>
  list(path: string, signal?: AbortSignal): Promise<readonly DirectoryEntry[]>
  read(path: string, signal?: AbortSignal): Promise<string>
  write(path: string, content: string, signal?: AbortSignal): Promise<void>
}

/** Privileged storage capability that is never exposed as a model tool. */
export interface OperationJournalProvider {
  read(path: string): Promise<string>
  /** Creates a file without replacing an existing claim. */
  createExclusive(path: string, content: string): Promise<boolean>
  /** Replaces a file through a same-filesystem atomic rename. */
  writeAtomic(path: string, content: string): Promise<void>
}

export interface ShellResult {
  readonly command: string
  readonly argv: readonly string[]
  readonly cwd: string
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface ShellProvider {
  exec(command: string, argv: readonly string[], cwd: string, signal?: AbortSignal): Promise<ShellResult>
}

export interface BrowserCommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly json: JsonValue | null
  readonly frame?: BrowserFrameCapture
}

export interface BrowserFrameCapture {
  readonly base64: string
  readonly mime_type: 'image/png'
  readonly captured_at: string
}

export interface BrowserProvider {
  open(url: string, signal?: AbortSignal): Promise<BrowserCommandResult>
  snapshot(signal?: AbortSignal): Promise<BrowserCommandResult>
  click(selector: string, signal?: AbortSignal): Promise<BrowserCommandResult>
  type(selector: string, text: string, signal?: AbortSignal): Promise<BrowserCommandResult>
  captureFrame?(signal?: AbortSignal): Promise<BrowserFrameCapture | undefined>
  close(signal?: AbortSignal): Promise<void>
}

export interface RuntimeProvider {
  readonly filesystem: FilesystemProvider
  readonly operationJournal: OperationJournalProvider
  readonly shell: ShellProvider
  createBrowser(runId: string): BrowserProvider
  readonly dispose?: () => Promise<void>
}

export type BrowserControl = 'agent' | 'user' | 'locked'
export type BrowserLifecycle = 'launching' | 'live' | 'awaiting_user' | 'stopped' | 'failed'

export interface BrowserStatus {
  readonly control: BrowserControl
  readonly state: BrowserLifecycle
  readonly leaseExpiresAt: string | null
}

export interface Frame {
  readonly sequence: number
  readonly jpegBase64: string
  readonly width: number
  readonly height: number
  readonly capturedAt: string
}

export interface FramePublishResult {
  readonly accepted: boolean
  readonly dropped: number
}

export interface BrowserFrameRelay {
  readonly trusted: boolean
  publish(frame: Frame): Promise<FramePublishResult>
  subscribe(): AsyncIterable<Frame>
  requestHandoff(leaseId: string): Promise<void>
  releaseHandoff(leaseId: string): Promise<void>
}

/** Trusted application/UI hook. Lease credentials never cross the agent tool result. */
export interface TrustedControlChannel {
  deliverUserControlLease(workspaceId: string, runId: string, leaseId: string, expiresAt: string): Promise<void>
  revokeUserControlLease(workspaceId: string, runId: string, leaseId: string): Promise<void>
}
