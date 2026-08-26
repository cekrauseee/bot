import { spawn } from 'node:child_process'

import { prepareDevelopment } from './lib/development.mjs'
import { npmCommand, projectRoot } from './lib/project.mjs'

const windows = process.platform === 'win32'
const children = new Set()
let shuttingDown = false

function start(command, args, label) {
  console.log(`→ Start ${label}`)
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    detached: !windows,
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
  if (shuttingDown) return
  shuttingDown = true

  for (const child of children) {
    if (!child.pid) continue
    try {
      if (windows) child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
}

try {
  await prepareDevelopment()
  console.log('\nmyBOT is starting at http://localhost:5173\n')

  const api = start(
    'uv',
    ['run', '--project', 'apps/api', 'fastapi', 'dev', 'apps/api/src/my_bot_api/main.py'],
    'FastAPI',
  )
  const web = start(npmCommand, ['run', 'dev', '--workspace', '@my-bot/web'], 'Vite')

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopChildren(signal)
    })
  }

  const result = await Promise.race([api.exited, web.exited])
  if (!shuttingDown) stopChildren()
  if (result.error) console.error(`${result.label} failed to start: ${result.error.message}`)

  process.exitCode = result.signal ? 1 : (result.code ?? 1)
} catch (error) {
  stopChildren()
  console.error(`\nDevelopment startup failed: ${error.message}`)
  process.exitCode = 1
}
