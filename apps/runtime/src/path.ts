import { posix } from 'node:path'

import { InvalidRequestError } from './errors.js'

export const WORKSPACE_ROOT = '/workspace'

export function resolveWorkspacePath(input: string, allowRoot = true): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 4096) {
    throw new InvalidRequestError('path must be a non-empty string.')
  }
  if (input.includes('\0') || input.includes('\\')) {
    throw new InvalidRequestError('path must use workspace-relative POSIX segments.')
  }
  if (input.length >= 3 && ((input.charCodeAt(0) >= 65 && input.charCodeAt(0) <= 90) || (input.charCodeAt(0) >= 97 && input.charCodeAt(0) <= 122)) && input[1] === ':' && input[2] === '/') {
    throw new InvalidRequestError('host drive paths are not allowed.')
  }
  if (input.startsWith('/')) {
    if (input !== WORKSPACE_ROOT && !input.startsWith(`${WORKSPACE_ROOT}/`)) {
      throw new InvalidRequestError('absolute paths outside /workspace are not allowed.')
    }
  }

  const relative = input === WORKSPACE_ROOT ? '' : input.replace(/^\/workspace\/?/, '')
  if (relative.split('/').some((segment) => segment === '..')) {
    throw new InvalidRequestError('path traversal is not allowed.')
  }
  const normalized = posix.normalize(`/${relative}`)
  if (!allowRoot && normalized === '/') {
    throw new InvalidRequestError('the workspace root is not a valid file path.')
  }
  return normalized === '/' ? WORKSPACE_ROOT : `${WORKSPACE_ROOT}${normalized}`
}

export function workspaceRelativePath(path: string): string {
  const absolute = resolveWorkspacePath(path)
  return absolute === WORKSPACE_ROOT ? '.' : absolute.slice(`${WORKSPACE_ROOT}/`.length)
}
