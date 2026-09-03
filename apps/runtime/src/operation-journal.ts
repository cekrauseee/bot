import { createHash } from 'node:crypto'

import type {
  JsonObject,
  JsonValue,
  OperationJournalProvider,
  RuntimeToolName,
  RuntimeToolRequest,
} from './contracts.js'
import {
  IdempotencyConflictError,
  ManualRecoveryRequiredError,
  RuntimeError,
} from './errors.js'
import { OPERATION_JOURNAL_ROOT } from './internal-paths.js'

const JOURNAL_VERSION = 1
const JOURNAL_ROOT = `${OPERATION_JOURNAL_ROOT}/v${JOURNAL_VERSION}`
const MAX_RECORD_BYTES = 1_000_000
const MAX_JSON_DEPTH = 64

type RecoveryPolicy = 'safe_read' | 'convergent_write' | 'manual'

interface StartedRecord {
  readonly version: typeof JOURNAL_VERSION
  readonly state: 'started'
  readonly fingerprint: string
  readonly tool: RuntimeToolName
  readonly recovery: RecoveryPolicy
  readonly started_at: string
}

interface CompletedRecord extends Omit<StartedRecord, 'state'> {
  readonly state: 'completed'
  readonly completed_at: string
  readonly result: JsonValue
}

type OperationRecord = StartedRecord | CompletedRecord

const RECOVERY_POLICIES: Readonly<Record<RuntimeToolName, RecoveryPolicy>> = {
  'filesystem.list': 'safe_read',
  'filesystem.read': 'safe_read',
  'filesystem.write': 'convergent_write',
  'shell.exec': 'manual',
  'browser.open': 'manual',
  'browser.snapshot': 'safe_read',
  'browser.click': 'manual',
  'browser.type': 'manual',
  'browser.press': 'manual',
  'browser.request_user_control': 'manual',
  'browser.release_control': 'manual',
  'browser.close': 'manual',
}

/**
 * Workspace-local durability boundary for runtime tool effects.
 *
 * Records contain only a canonical fingerprint and the normalized result. Tool
 * arguments are deliberately not persisted because they may contain secrets.
 */
export class OperationJournal {
  constructor(
    private readonly filesystem: OperationJournalProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute<T extends JsonValue>(
    request: RuntimeToolRequest,
    operation: () => Promise<T>,
    durableResult: (result: T) => JsonValue = (result) => result,
  ): Promise<T> {
    const fingerprint = operationFingerprint(request)
    const recovery = RECOVERY_POLICIES[request.tool]
    const path = operationRecordPath(request.operation_id)
    const started: StartedRecord = {
      version: JOURNAL_VERSION,
      state: 'started',
      fingerprint,
      tool: request.tool,
      recovery,
      started_at: this.now().toISOString(),
    }

    const claimed = await this.filesystem.createExclusive(path, encodeRecord(started))
    if (!claimed) {
      const existing = await this.readRecord(path)
      this.assertIdentity(existing, fingerprint, request.tool, recovery)
      if (existing.state === 'completed') return existing.result as T
      if (existing.recovery === 'manual') throw new ManualRecoveryRequiredError()
    }

    const result = await operation()
    const completed: CompletedRecord = {
      ...started,
      state: 'completed',
      completed_at: this.now().toISOString(),
      result: durableResult(result),
    }

    let encoded: string
    try {
      encoded = encodeRecord(completed)
    } catch (error) {
      if (error instanceof ManualRecoveryRequiredError) throw error
      throw new ManualRecoveryRequiredError()
    }
    await this.filesystem.writeAtomic(path, encoded)
    return result
  }

  private async readRecord(path: string): Promise<OperationRecord> {
    let raw: string
    try {
      raw = await this.filesystem.read(path)
    } catch (error) {
      if (error instanceof RuntimeError) throw error
      throw new ManualRecoveryRequiredError()
    }
    if (Buffer.byteLength(raw, 'utf8') > MAX_RECORD_BYTES) throw new ManualRecoveryRequiredError()

    try {
      return parseRecord(JSON.parse(raw))
    } catch (error) {
      if (error instanceof ManualRecoveryRequiredError) throw error
      throw new ManualRecoveryRequiredError()
    }
  }

  private assertIdentity(
    record: OperationRecord,
    fingerprint: string,
    tool: RuntimeToolName,
    recovery: RecoveryPolicy,
  ): void {
    if (record.fingerprint !== fingerprint || record.tool !== tool || record.recovery !== recovery) {
      throw new IdempotencyConflictError()
    }
  }
}

function operationFingerprint(request: RuntimeToolRequest): string {
  const canonicalPayload: JsonObject = {
    version: request.version,
    run_id: request.run_id,
    conversation_id: request.conversation_id,
    user_id: request.user_id,
    workspace_id: request.workspace_id,
    tool: request.tool,
    arguments: request.arguments,
  }
  return createHash('sha256').update(stableJson(canonicalPayload)).digest('hex')
}

function operationRecordPath(operationId: string): string {
  const digest = createHash('sha256').update(operationId).digest('hex')
  return `${JOURNAL_ROOT}/${digest.slice(0, 2)}/${digest}.json`
}

function stableJson(value: JsonValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key] as JsonValue)}`).join(',')}}`
}

function encodeRecord(record: OperationRecord): string {
  const encoded = JSON.stringify(record)
  if (Buffer.byteLength(encoded, 'utf8') > MAX_RECORD_BYTES) {
    throw new ManualRecoveryRequiredError('The operation completed, but its result is too large for safe durable replay.')
  }
  return encoded
}

function parseRecord(value: unknown): OperationRecord {
  if (!isObject(value)) throw new ManualRecoveryRequiredError()
  if (value.version !== JOURNAL_VERSION) throw new ManualRecoveryRequiredError()
  if (value.state !== 'started' && value.state !== 'completed') throw new ManualRecoveryRequiredError()
  if (typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) throw new ManualRecoveryRequiredError()
  if (typeof value.tool !== 'string' || !(value.tool in RECOVERY_POLICIES)) throw new ManualRecoveryRequiredError()
  if (value.recovery !== RECOVERY_POLICIES[value.tool as RuntimeToolName]) throw new ManualRecoveryRequiredError()
  if (typeof value.started_at !== 'string') throw new ManualRecoveryRequiredError()

  const base: Omit<StartedRecord, 'state'> = {
    version: JOURNAL_VERSION,
    fingerprint: value.fingerprint,
    tool: value.tool as RuntimeToolName,
    recovery: value.recovery as RecoveryPolicy,
    started_at: value.started_at,
  }
  if (value.state === 'started') return { ...base, state: 'started' }
  if (typeof value.completed_at !== 'string' || !('result' in value) || !isJsonValue(value.result)) {
    throw new ManualRecoveryRequiredError()
  }
  return { ...base, state: 'completed', completed_at: value.completed_at, result: value.result }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > MAX_JSON_DEPTH) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1))
  if (!isObject(value)) return false
  return Object.values(value).every((item) => isJsonValue(item, depth + 1))
}
