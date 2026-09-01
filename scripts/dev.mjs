import { spawn } from 'node:child_process'

import { prepareDevelopment } from './lib/development.mjs'
import { assertDevelopmentPortsAvailable } from './lib/development-ports.mjs'
import { prepareEnvironment } from './lib/environment.mjs'
import { terminateDescendants } from './lib/process-tree.mjs'
import { projectRoot, turboInvocation } from './lib/project.mjs'

const windows = process.platform === 'win32'
const children = new Set()
let shutdownPromise
let shutdownSignal

function start(command, args, label) {
  console.log(`\n→ Start ${label}`)
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  })
  children.add(child)
  const exited = new Promise((resolve) => {
    child.once('error', (error) => {
      children.delete(child)
      resolve({ code: 1, error, label, signal: null })
    })
    child.once('exit', (code, signal) => {
      children.delete(child)
      resolve({ code, error: null, label, signal })
    })
  })
  return { child, exited }
}

function stopChildren(signal = 'SIGTERM') {
  if (shutdownPromise) return shutdownPromise
  shutdownPromise = windows
    ? Promise.resolve([...children].forEach((child) => child.kill(signal)))
    : terminateDescendants(process.pid, { signal })
  return shutdownPromise
}

try {
  const environment = await prepareEnvironment()
  await assertDevelopmentPortsAvailable()
  await prepareDevelopment({ environment })
  console.log('\nmyBot is starting at:\n  Web:         http://localhost:5173\n  Web rebuild: http://localhost:5174\n')

  const invocation = turboInvocation()
  const turbo = start(
    invocation.command,
    [...invocation.args, 'run', 'dev', '--ui=tui', '--filter=./apps/*'],
    'Turbo development tasks',
  )

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      shutdownSignal = signal
      void stopChildren(signal)
    })
  }

  const result = await turbo.exited
  await stopChildren()
  if (result.error) console.error(`${result.label} failed to start: ${result.error.message}`)

  process.exitCode = shutdownSignal ? 0 : result.signal ? 1 : (result.code ?? 1)
} catch (error) {
  stopChildren()
  console.error(`\nDevelopment startup failed: ${error.message}`)
  process.exitCode = 1
}
