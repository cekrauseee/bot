import { access } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktopRoot = path.join(projectRoot, 'apps/desktop')
const pinnedNode = path.join(projectRoot, 'node_modules/node/bin/node')
const forgeCli = path.join(projectRoot, 'node_modules/@electron-forge/cli/dist/electron-forge.js')

await access(pinnedNode)
await access(forgeCli)
const result = spawnSync(pinnedNode, [forgeCli, ...process.argv.slice(2)], {
  cwd: desktopRoot,
  env: process.env,
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
