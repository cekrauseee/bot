import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(desktopRoot, '../..')
const sourceRoot = path.join(desktopRoot, 'src')
const publicConfigPath = path.join(desktopRoot, 'assets/generated/public-config.json')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const expectedElectronExits = new WeakSet()

let buildProcess
let electronProcess
let sourceWatcher
let rebuildTimer
let rebuildQueued = false
let rebuilding = false
let shuttingDown = false

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? projectRoot,
      env: process.env,
      stdio: 'inherit',
    })
    if (options.trackBuild) buildProcess = child
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (buildProcess === child) buildProcess = undefined
      if (code === 0) resolve()
      else reject(new Error(`${command} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`))
    })
  })
}

async function buildDesktop() {
  await run(npmCommand, ['run', 'build', '--workspace=@my-bot/desktop'], { trackBuild: true })
}

async function rendererOrigin() {
  const config = JSON.parse(await readFile(publicConfigPath, 'utf8'))
  const url = new URL(config.WEB_BASE_URL)
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== config.WEB_BASE_URL) {
    throw new Error('WEB_BASE_URL in desktop public config must be an HTTP origin')
  }
  return url.origin
}

async function waitForRenderer(origin, timeoutMilliseconds = 30_000) {
  const deadline = Date.now() + timeoutMilliseconds
  console.log(`\n→ Wait for the Vite renderer at ${origin}`)
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) {
        await response.body?.cancel()
        return
      }
    } catch {
      // The web task starts in parallel; keep waiting until its server is ready.
    }
    await delay(200)
  }
  throw new Error(`Vite renderer did not become available at ${origin}`)
}

function startElectron() {
  if (shuttingDown) return
  console.log('\n→ Start Electron')
  const child = spawn(electronPath, ['.'], {
    cwd: desktopRoot,
    env: process.env,
    stdio: 'inherit',
  })
  electronProcess = child
  child.once('error', (error) => {
    if (!shuttingDown) void shutdown(1, error)
  })
  child.once('exit', (code, signal) => {
    if (electronProcess === child) electronProcess = undefined
    if (!shuttingDown && !expectedElectronExits.has(child)) {
      const error = code === 0 && !signal
        ? undefined
        : new Error(`Electron stopped with ${signal ? `signal ${signal}` : `exit code ${code}`}`)
      void shutdown(error ? 1 : 0, error)
    }
  })
}

async function stopElectron() {
  const child = electronProcess
  if (!child) return
  expectedElectronExits.add(child)
  await new Promise((resolve) => {
    child.once('exit', resolve)
    if (!child.kill()) resolve()
  })
}

async function rebuildDesktop() {
  if (rebuilding) {
    rebuildQueued = true
    return
  }

  rebuilding = true
  do {
    rebuildQueued = false
    try {
      console.log('\n→ Rebuild Electron main and preload processes')
      await buildDesktop()
      await stopElectron()
      startElectron()
    } catch (error) {
      console.error(`\nDesktop rebuild failed: ${error.message}`)
    }
  } while (rebuildQueued && !shuttingDown)
  rebuilding = false
}

function watchDesktopSource() {
  sourceWatcher = watch(sourceRoot, { recursive: true }, (_eventType, filename) => {
    if (!filename || !/\.(?:c|m)?tsx?$/.test(filename)) return
    clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(() => void rebuildDesktop(), 100)
  })
}

async function shutdown(code, error) {
  if (shuttingDown) return
  shuttingDown = true
  clearTimeout(rebuildTimer)
  sourceWatcher?.close()
  buildProcess?.kill()
  await stopElectron()
  if (error) console.error(`\nDesktop development stopped: ${error.message}`)
  process.exitCode = code
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => void shutdown(0))
}

try {
  const origin = await rendererOrigin()
  await Promise.all([buildDesktop(), waitForRenderer(origin)])
  watchDesktopSource()
  startElectron()
} catch (error) {
  await shutdown(1, error)
}
