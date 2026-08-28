import { spawn } from 'node:child_process'

import { projectRoot } from './project.mjs'

export function run(
  command,
  args,
  {
    cwd = projectRoot,
    env = process.env,
    label = `${command} ${args.join(' ')}`,
    stdio = 'inherit',
  } = {},
) {
  if (label) console.log(`\n→ ${label}`)

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`
      reject(new Error(`${command} failed with ${reason}`))
    })
  })
}

export function capture(
  command,
  args,
  { cwd = projectRoot, env = process.env } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(stdout)
        return
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`
      const error = new Error(`${command} failed with ${reason}`)
      error.stderr = stderr
      reject(error)
    })
  })
}

export async function commandIsAvailable(command, args = ['--version']) {
  try {
    await run(command, args, { label: null, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
