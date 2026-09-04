import net from 'node:net'

import { capture } from './process.mjs'

export const infrastructureServices = [
  {
    name: 'postgres',
    label: 'PostgreSQL',
    port: 5434,
  },
  {
    name: 'redis',
    label: 'Redis',
    port: 6380,
  },
]

function portIsAllocated(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    const finish = (allocated) => {
      server.removeAllListeners()
      resolve(allocated)
    }

    server.once('error', (error) => {
      finish(error.code === 'EADDRINUSE')
    })
    server.listen(port, '127.0.0.1', () => {
      server.close(() => finish(false))
    })
  })
}

async function runningContainersForPort(port) {
  const output = await capture('docker', [
    'ps',
    '--filter',
    `publish=${port}`,
    '--format',
    '{{.ID}}',
  ])
  const ids = output
    .split('\n')
    .map((id) => id.trim())
    .filter(Boolean)

  const inspected = await Promise.all(
    ids.map(async (id) => {
      try {
        const result = await capture('docker', ['inspect', id])
        return JSON.parse(result)[0]
      } catch {
        return null
      }
    }),
  )

  return inspected.filter(Boolean)
}

async function composeConfigHash(service) {
  const output = await capture('docker', ['compose', 'config', '--hash', service.name])
  const [, hash] = output.trim().split(/\s+/)
  return hash
}

async function composeProjectName() {
  const output = await capture('docker', ['compose', 'config', '--format', 'json'])
  const projectName = JSON.parse(output).name
  if (!projectName) throw new Error('Docker Compose did not provide a project name')
  return projectName
}

export function isOwnedInfrastructureContainer(
  container,
  service,
  configHash,
  projectName,
) {
  const labels = container?.Config?.Labels ?? {}
  return (
    labels['com.docker.compose.project'] === projectName &&
    labels['com.docker.compose.service'] === service.name &&
    labels['com.docker.compose.config-hash'] === configHash
  )
}

export function classifyInfrastructurePort({
  service,
  allocated,
  containers,
  configHash,
  projectName,
}) {
  if (!allocated) return { status: 'available' }

  const owner = containers.find((container) =>
    isOwnedInfrastructureContainer(container, service, configHash, projectName),
  )
  if (!owner) return { status: 'conflict' }

  const health = owner.State?.Health?.Status ?? 'unknown'
  return {
    status: health === 'healthy' ? 'owned' : 'owned-unready',
    health,
    owner,
  }
}

export function infrastructurePortError(checks) {
  const conflicts = checks.filter(({ result }) => result.status === 'conflict')
  const unready = checks.filter(({ result }) => result.status === 'owned-unready')
  const messages = [
    ...conflicts.map(
      ({ service }) =>
        `Port ${service.port} for ${service.label} is already in use by another process or Compose project.`,
    ),
    ...unready.map(
      ({ service, result }) =>
        `Bot's ${service.label} already uses port ${service.port}, but it is not ready yet (status: ${result.health}).`,
    ),
  ]

  if (messages.length === 0) return null

  return new Error(
    `${messages.join('\n')}\n\nI did not stop anything automatically. Stop the process using the port, or change the local port in compose.yaml and the matching .env URL, then try again.`,
  )
}

export async function inspectInfrastructurePorts() {
  const projectName = await composeProjectName()

  return Promise.all(
    infrastructureServices.map(async (service) => {
      const [allocated, containers, configHash] = await Promise.all([
        portIsAllocated(service.port),
        runningContainersForPort(service.port),
        composeConfigHash(service),
      ])
      return {
        service,
        result: classifyInfrastructurePort({
          service,
          allocated: allocated || containers.length > 0,
          containers,
          configHash,
          projectName,
        }),
      }
    }),
  )
}
