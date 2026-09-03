import type { JsonObject, RuntimeToolName, RuntimeToolRequest } from './contracts.js'
import { InvalidRequestError } from './errors.js'
import { resolveWorkingDirectory, resolveWorkspacePath, WORKSPACE_ROOT } from './path.js'

const TOOL_NAMES = new Set<RuntimeToolName>([
  'filesystem.list',
  'filesystem.read',
  'filesystem.write',
  'shell.exec',
  'browser.open',
  'browser.snapshot',
  'browser.click',
  'browser.type',
  'browser.press',
  'browser.request_user_control',
  'browser.release_control',
  'browser.close',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new InvalidRequestError(`${label} contains an unsupported field.`)
  }
}

function stringField(value: unknown, label: string, max = 4096): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || hasControlCharacter(value)) {
    throw new InvalidRequestError(`${label} must be a non-empty safe string.`)
  }
  return value
}

function optionalStringField(value: unknown, label: string, max = 4096): string | undefined {
  if (value === undefined) return undefined
  return stringField(value, label, max)
}

function objectField(value: unknown, label: string): JsonObject {
  if (!isRecord(value)) throw new InvalidRequestError(`${label} must be an object.`)
  return value as JsonObject
}

export function parseRuntimeRequest(value: unknown): RuntimeToolRequest {
  if (!isRecord(value)) throw new InvalidRequestError('request body must be a JSON object.')
  assertExactKeys(value, ['version', 'operation_id', 'run_id', 'conversation_id', 'user_id', 'workspace_id', 'working_directory', 'tool', 'arguments'], 'request')
  if (value.version !== 2) throw new InvalidRequestError('version must be 2.')
  const tool = stringField(value.tool, 'tool')
  if (!TOOL_NAMES.has(tool as RuntimeToolName)) throw new InvalidRequestError('unsupported runtime tool.')
  const workingDirectory = resolveWorkingDirectory(optionalStringField(value.working_directory, 'working_directory') ?? WORKSPACE_ROOT)
  return {
    version: 2,
    operation_id: stringField(value.operation_id, 'operation_id', 200),
    run_id: stringField(value.run_id, 'run_id', 200),
    conversation_id: stringField(value.conversation_id, 'conversation_id', 200),
    user_id: stringField(value.user_id, 'user_id', 200),
    workspace_id: stringField(value.workspace_id, 'workspace_id', 200),
    working_directory: workingDirectory,
    tool: tool as RuntimeToolName,
    arguments: validateArguments(tool as RuntimeToolName, objectField(value.arguments, 'arguments'), workingDirectory),
  }
}

export function validateArguments(tool: RuntimeToolName, args: JsonObject, workingDirectory = WORKSPACE_ROOT): JsonObject {
  switch (tool) {
    case 'filesystem.list': {
      assertExactKeys(args, ['path'], tool)
      return { path: resolveWorkspacePath(optionalStringField(args.path, 'path') ?? '.', true, workingDirectory) }
    }
    case 'filesystem.read': {
      assertExactKeys(args, ['path'], tool)
      return { path: resolveWorkspacePath(stringField(args.path, 'path'), false, workingDirectory) }
    }
    case 'filesystem.write': {
      assertExactKeys(args, ['path', 'content'], tool)
      return { path: resolveWorkspacePath(stringField(args.path, 'path'), false, workingDirectory), content: contentField(args.content, 'content', 2_000_000) }
    }
    case 'shell.exec': {
      assertExactKeys(args, ['command', 'argv', 'cwd'], tool)
      if (!Array.isArray(args.argv) || args.argv.length > 128) throw new InvalidRequestError('argv must be an array of at most 128 strings.')
      const argv = args.argv.map((item, index) => stringField(item, `argv[${index}]`, 16_384))
      return { command: stringField(args.command, 'command', 512), argv, cwd: resolveWorkspacePath(optionalStringField(args.cwd, 'cwd') ?? '.', true, workingDirectory) }
    }
    case 'browser.open':
      assertExactKeys(args, ['url'], tool)
      return { url: validateUrl(stringField(args.url, 'url', 8_192)) }
    case 'browser.snapshot':
      assertExactKeys(args, [], tool)
      return {}
    case 'browser.click':
      assertExactKeys(args, ['selector', 'leaseId'], tool)
      return { selector: stringField(args.selector, 'selector', 4_096), ...(args.leaseId === undefined ? {} : { leaseId: stringField(args.leaseId, 'leaseId', 200) }) }
    case 'browser.type':
      assertExactKeys(args, ['selector', 'text', 'leaseId'], tool)
      return { selector: stringField(args.selector, 'selector', 4_096), text: stringField(args.text, 'text', 100_000), ...(args.leaseId === undefined ? {} : { leaseId: stringField(args.leaseId, 'leaseId', 200) }) }
    case 'browser.press':
      assertExactKeys(args, ['key', 'leaseId'], tool)
      return { key: stringField(args.key, 'key', 128), ...(args.leaseId === undefined ? {} : { leaseId: stringField(args.leaseId, 'leaseId', 200) }) }
    case 'browser.request_user_control':
      assertExactKeys(args, ['reason'], tool)
      return args.reason === undefined ? {} : { reason: stringField(args.reason, 'reason', 2_000) }
    case 'browser.release_control':
      assertExactKeys(args, ['leaseId'], tool)
      return { leaseId: stringField(args.leaseId, 'leaseId', 200) }
    case 'browser.close':
      assertExactKeys(args, [], tool)
      return {}
  }
}

function validateUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new InvalidRequestError('url must be valid HTTP(S).')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new InvalidRequestError('url must be valid HTTP(S).')
  return url.toString()
}

function contentField(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) {
    throw new InvalidRequestError(`${label} must be a safe string.`)
  }
  return value
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 32 || code === 127) return true
  }
  return false
}
