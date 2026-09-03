import { execFileSync } from 'node:child_process'
import { access, cp, mkdir, readdir, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') throw new Error('desktop:install currently supports macOS only')

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const applications = path.join(os.homedir(), 'Applications')
const appName = 'myBot.app'
const destination = path.join(applications, appName)
let runningOutput = ''
try { runningOutput = execFileSync('pgrep', ['-f', `${appName}/Contents/MacOS/`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { runningOutput = '' }
const running = runningOutput.trim().split(/\s+/).filter(Boolean)
if (running.length > 1) throw new Error('Refusing install while multiple myBot.app processes are running')
if (running.length === 1) throw new Error('Refusing install while myBot.app is running; quit it first')

execFileSync('npm', ['run', 'desktop:package'], { cwd: projectRoot, stdio: 'inherit' })
const outRoot = path.join(projectRoot, 'apps/desktop/out')
const candidates = (await readdir(outRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('myBot-darwin'))
  .map((entry) => path.join(outRoot, entry.name, appName))
let source
for (const candidate of candidates) {
  try { await access(candidate); source = candidate; break } catch { /* continue */ }
}
if (!source) throw new Error(`No packaged ${appName} found under apps/desktop/out`)
await mkdir(applications, { recursive: true })
const staging = path.join(applications, `.myBot.install-${process.pid}`)
await cp(source, staging, {
  recursive: true,
  errorOnExist: true,
  // macOS framework bundles use relative symlinks. Resolving them while
  // copying makes the installed app point back into apps/desktop/out and
  // invalidates its code signature.
  verbatimSymlinks: true,
})
try {
  execFileSync('codesign', ['--verify', '--deep', '--strict', staging], { stdio: 'pipe' })
} catch (error) {
  await rm(staging, { recursive: true, force: true })
  throw new Error(`Refusing to install an invalid application bundle: ${error.stderr?.toString().trim() || error.message}`)
}
if (await access(destination).then(() => true, () => false)) {
  const backup = `${destination}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
  await rename(destination, backup)
}
await rename(staging, destination)
console.log(`Installed ${destination}`)
