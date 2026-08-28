import { createHash } from 'node:crypto'
import { access, readdir, readFile, writeFile } from 'node:fs/promises'
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

export const dependencyMarkerName = '.mybot-dependencies.json'

export async function dependencyFingerprint(root = projectRoot) {
  const rootPackagePath = path.join(root, 'package.json')
  const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'))
  const workspacePatterns = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : rootPackage.workspaces?.packages ?? []
  // Hash the lockfile and every declared workspace manifest. Resolve the
  // simple one-level globs used by npm workspaces so package moves and new
  // packages invalidate the readiness marker.
  const manifests = [
    rootPackagePath,
    path.join(root, 'package-lock.json'),
    path.join(root, 'apps/ai', 'pyproject.toml'),
    path.join(root, 'apps/ai', 'uv.lock'),
    path.join(root, 'apps/ai', '.python-version'),
  ]
  const turboPath = path.join(root, 'turbo.json')
  if (await pathExists(turboPath)) manifests.splice(2, 0, turboPath)
  for (const workspace of workspacePatterns) {
    if (workspace.endsWith('/*')) {
      const parent = path.join(root, workspace.slice(0, -2))
      const entries = await readdir(parent, { withFileTypes: true })
      for (const entry of entries
        .filter((item) => item.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const manifest = path.join(parent, entry.name, 'package.json')
        if (await pathExists(manifest)) manifests.push(manifest)
      }
      continue
    }
    manifests.push(path.join(root, workspace, 'package.json'))
  }

  const hash = createHash('sha256')
  for (const manifest of manifests) {
    hash.update(manifest.slice(root.length))
    hash.update('\0')
    hash.update(await readFile(manifest))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export async function dependenciesAreInstalled(root = projectRoot) {
  const packageLockReady = await pathExists(path.join(root, 'node_modules/.package-lock.json'))
  const pythonReady = await pathExists(path.join(root, 'apps/ai/.venv/pyvenv.cfg'))
  if (!packageLockReady || !pythonReady) return false

  try {
    const marker = JSON.parse(
      await readFile(path.join(root, 'node_modules', dependencyMarkerName), 'utf8'),
    )
    return marker.fingerprint === (await dependencyFingerprint(root))
  } catch {
    return false
  }
}

export async function installDependencies(root = projectRoot) {
  await run(npmCommand, ['ci'], {
    cwd: root,
    label: 'Install Node.js workspaces from the lockfile',
  })
  await run('uv', ['sync', '--project', 'apps/ai', '--locked'], {
    cwd: root,
    label: 'Install the Python AI environment from the lockfile',
  })
  await writeFile(
    path.join(root, 'node_modules', dependencyMarkerName),
    `${JSON.stringify({ fingerprint: await dependencyFingerprint(root) }, null, 2)}\n`,
    { mode: 0o600 },
  )
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

export async function buildEmailPackage() {
  await run(npmCommand, ['run', 'email:build'], {
    label: 'Build the transactional email package for the API',
  })
}

export async function prepareDevelopment({ dependencies = 'if-missing' } = {}) {
  await assertDevelopmentPrerequisites()
  const environment = await prepareEnvironment()
  printEnvironmentSummary(environment)

  if (dependencies === 'always' || !(await dependenciesAreInstalled())) {
    await installDependencies()
  }

  await buildEmailPackage()
  await startInfrastructure()
  await migrateDatabase()
  return environment
}
