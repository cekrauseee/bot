import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

export const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
export const turboBin = path.join(projectRoot, 'node_modules', 'turbo', 'bin', 'turbo')

// Turbo publishes a JavaScript launcher plus a platform binary. Execute the
// launcher through Node on Windows instead of asking spawn() to execute a
// .cmd shim, which is not supported when shell mode is disabled.
export function turboInvocation(platform = process.platform) {
  return platform === 'win32'
    ? { command: process.execPath, args: [turboBin] }
    : { command: turboBin, args: [] }
}
