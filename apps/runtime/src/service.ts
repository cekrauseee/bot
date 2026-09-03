import type { BrowserFrameRelay, JsonObject, RuntimeToolRequest, RuntimeToolResponse, TrustedControlChannel } from './contracts.js'
import { RuntimeUnavailableError, toPublicError } from './errors.js'
import { OperationJournal } from './operation-journal.js'
import { resolveWorkingDirectory, resolveWorkspacePath, WORKSPACE_ROOT } from './path.js'
import { redactSensitiveText } from './security.js'
import { validateArguments } from './validation.js'
import { WorkspaceRegistry, type RuntimeWorkspace } from './workspace.js'
import type { ProviderFactory } from './providers/types.js'

export interface RuntimeServiceOptions {
  readonly providerFactory: ProviderFactory
  readonly workspaceRegistry?: WorkspaceRegistry
  readonly relayFactory?: (workspaceId: string, runId: string) => BrowserFrameRelay | undefined
  readonly controlChannel?: TrustedControlChannel
}

export class RuntimeService {
  readonly workspaces: WorkspaceRegistry

  constructor(options: RuntimeServiceOptions) {
    this.workspaces = options.workspaceRegistry ?? new WorkspaceRegistry(options.providerFactory, options.relayFactory, options.controlChannel)
  }

  async execute(request: RuntimeToolRequest, signal?: AbortSignal): Promise<RuntimeToolResponse> {
    signal?.throwIfAborted()
    const workingDirectory = resolveWorkingDirectory(request.working_directory)
    const args = validateArguments(request.tool, request.arguments, workingDirectory)
    const normalizedRequest: RuntimeToolRequest = { ...request, arguments: args }
    const workspaceId = request.workspace_id
    const workspace = await this.workspaces.get(workspaceId)
    try {
      const result = await workspace.runExclusive(async () => {
        signal?.throwIfAborted()
        if (workingDirectory !== WORKSPACE_ROOT && (request.tool.startsWith('filesystem.') || request.tool === 'shell.exec')) {
          // Directory preparation is convergent and must succeed before claiming a tool effect.
          await workspace.provider.filesystem.mkdir(workingDirectory, signal)
          signal?.throwIfAborted()
        }
        const journal = new OperationJournal(workspace.provider.operationJournal)
        return journal.execute(
          normalizedRequest,
          () => this.dispatch(workspace, normalizedRequest, args, signal),
          durableRuntimeResult,
        )
      }, signal)
      return { result }
    } catch (error) {
      signal?.throwIfAborted()
      const publicError = toPublicError(error)
      if (publicError instanceof RuntimeUnavailableError) throw publicError
      throw publicError
    }
  }

  async dispose(): Promise<void> {
    await this.workspaces.dispose()
  }

  private async dispatch(workspace: RuntimeWorkspace, request: RuntimeToolRequest, args: JsonObject, signal?: AbortSignal): Promise<JsonObject> {
    // Journal claims can involve I/O; cancellation must be checked again afterward.
    signal?.throwIfAborted()
    switch (request.tool) {
      case 'filesystem.list': {
        const path = resolveWorkspacePath(args.path as string)
        const entries = await workspace.provider.filesystem.list(path, signal)
        const serializedEntries: JsonObject[] = entries
          .map((entry): JsonObject => ({ name: entry.name, path: entry.path, type: entry.type, size: entry.size }))
        return { path, entries: serializedEntries }
      }
      case 'filesystem.read': {
        const path = resolveWorkspacePath(args.path as string, false)
        return { path, content: redactSensitiveText(await workspace.provider.filesystem.read(path, signal)) }
      }
      case 'filesystem.write': {
        const path = resolveWorkspacePath(args.path as string, false)
        await workspace.provider.filesystem.write(path, args.content as string, signal)
        return { path, written: true }
      }
      case 'shell.exec': {
        const cwd = resolveWorkspacePath(args.cwd as string)
        const shellResult = await workspace.provider.shell.exec(args.command as string, args.argv as string[], cwd, signal)
        return { ...shellResult, command: redactSensitiveText(shellResult.command), argv: shellResult.argv.map(redactSensitiveText), stdout: redactSensitiveText(shellResult.stdout), stderr: redactSensitiveText(shellResult.stderr) }
      }
      case 'browser.open':
        return workspace.browser(request.run_id).open(args.url as string, signal)
      case 'browser.snapshot':
        return workspace.browser(request.run_id).snapshot(signal)
      case 'browser.click':
        return workspace.browser(request.run_id).click(args.selector as string, args.leaseId as string | undefined, signal)
      case 'browser.type':
        return workspace.browser(request.run_id).type(args.selector as string, args.text as string, args.leaseId as string | undefined, signal)
      case 'browser.press':
        return workspace.browser(request.run_id).press(args.key as string, args.leaseId as string | undefined, signal)
      case 'browser.request_user_control':
        return workspace.browser(request.run_id).requestUserControl()
      case 'browser.release_control':
        return workspace.browser(request.run_id).releaseControl(args.leaseId as string)
      case 'browser.close':
        return workspace.browser(request.run_id).close(signal)
    }
  }
}

function durableRuntimeResult(result: JsonObject): JsonObject {
  const durable = { ...result }
  delete durable.browser_frame
  return durable
}

export function createUnavailableProviderFactory(): ProviderFactory {
  return async () => { throw new RuntimeUnavailableError() }
}
