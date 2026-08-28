import { access } from 'node:fs/promises'
import path from 'node:path'

import { prepareEnvironment, printEnvironmentSummary } from './environment.mjs'
import { infrastructurePortError, inspectInfrastructurePorts } from './infrastructure.mjs'
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

export async function assertInfrastructurePrerequisites() {
  if (!(await commandIsAvailable('docker', ['compose', 'version']))) {
    throw new Error('Docker Compose is required')
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
  await assertInfrastructurePrerequisites()
}

async function dependenciesAreInstalled() {
  return (
    (await pathExists(path.join(projectRoot, 'node_modules/.package-lock.json'))) &&
    (await pathExists(path.join(projectRoot, 'apps/ai/.venv/pyvenv.cfg')))
  )
}

export async function installDependencies() {
  await run(npmCommand, ['ci'], { label: 'Install Node.js workspaces from the lockfile' })
  await run('uv', ['sync', '--project', 'apps/ai', '--locked'], {
    label: 'Install the Python AI environment from the lockfile',
  })
}

export async function startInfrastructure() {
  const checks = await inspectInfrastructurePorts()
  const portError = infrastructurePortError(checks)
  if (portError) throw portError

  const servicesToStart = checks
    .filter(({ result }) => result.status === 'available')
    .map(({ service }) => service.name)

  for (const { service } of checks.filter(({ result }) => result.status === 'owned')) {
    console.log(`✓ Reusing myBot ${service.label} on port ${service.port}`)
  }

  if (servicesToStart.length === 0) return

  await run('docker', ['compose', 'up', '-d', '--wait', ...servicesToStart], {
    label: 'Start PostgreSQL and Redis',
  })
}

export async function migrateDatabase() {
  await run(npmCommand, ['run', 'db:migrate'], {
    label: 'Apply application API database migrations',
  })
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
