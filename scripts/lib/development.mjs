import { access } from 'node:fs/promises'
import path from 'node:path'

import { prepareEnvironment, printEnvironmentSummary } from './environment.mjs'
import { npmCommand, projectRoot } from './project.mjs'
import { commandIsAvailable, run } from './process.mjs'

async function pathExists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

async function assertDevelopmentPrerequisites() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 22)) {
    throw new Error('Node.js 22.22 or newer is required')
  }

  if (!(await commandIsAvailable('uv'))) {
    throw new Error('uv is required: https://docs.astral.sh/uv/getting-started/installation/')
  }
  if (!(await commandIsAvailable('docker', ['compose', 'version']))) {
    throw new Error('Docker Compose is required')
  }
}

async function dependenciesAreInstalled() {
  return (
    (await pathExists(path.join(projectRoot, 'node_modules/.package-lock.json'))) &&
    (await pathExists(path.join(projectRoot, 'apps/api/.venv/pyvenv.cfg')))
  )
}

export async function installDependencies() {
  await run(npmCommand, ['ci'], { label: 'Install Node.js workspaces from the lockfile' })
  await run('uv', ['sync', '--project', 'apps/api', '--locked'], {
    label: 'Install the Python environment from the lockfile',
  })
}

export async function startInfrastructure() {
  await run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis'], {
    label: 'Start PostgreSQL and Redis',
  })
}

export async function migrateDatabase() {
  await run(
    'uv',
    [
      'run',
      '--project',
      'apps/api',
      'alembic',
      '-c',
      'apps/api/alembic.ini',
      'upgrade',
      'head',
    ],
    { label: 'Apply database migrations' },
  )
}

export async function renderEmailTemplates() {
  await run(npmCommand, ['run', 'emails:render'], {
    label: 'Render local React Email templates for the API',
  })
}

export async function prepareDevelopment({ dependencies = 'if-missing' } = {}) {
  await assertDevelopmentPrerequisites()
  const environment = await prepareEnvironment()
  printEnvironmentSummary(environment)

  if (dependencies === 'always' || !(await dependenciesAreInstalled())) {
    await installDependencies()
  }

  await renderEmailTemplates()
  await startInfrastructure()
  await migrateDatabase()
  return environment
}
