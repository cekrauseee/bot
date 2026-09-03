import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseEnvironment } from '../../../scripts/lib/environment.mjs'

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(desktopRoot, '../..')
const output = path.join(desktopRoot, 'assets/generated/public-config.json')

function origin(value, name) {
  let parsed
  try { parsed = new URL(value) } catch { throw new Error(`${name} must be a valid HTTP origin`) }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== '/') {
    throw new Error(`${name} must be an origin without a path, query, or credentials`)
  }
  return parsed.origin
}

let values = new Map()
try { values = parseEnvironment(await readFile(path.join(projectRoot, '.env'), 'utf8')) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const webBaseUrl = origin(process.env.WEB_BASE_URL ?? values.get('WEB_BASE_URL') ?? 'http://localhost:5173', 'WEB_BASE_URL')
const apiBaseUrl = origin(process.env.VITE_API_BASE_URL ?? values.get('VITE_API_BASE_URL') ?? 'http://localhost:8000', 'VITE_API_BASE_URL')
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify({ WEB_BASE_URL: webBaseUrl, VITE_API_BASE_URL: apiBaseUrl }, null, 2)}\n`, { mode: 0o600 })
console.log(`Generated ${path.relative(projectRoot, output)} with public origins only`)
