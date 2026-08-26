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

export async function commandIsAvailable(command, args = ['--version']) {
  try {
    await run(command, args, { label: null, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
