import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

export const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
