import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyInfrastructurePort,
  infrastructurePortError,
  infrastructureServices,
  isOwnedInfrastructureContainer,
} from '../lib/infrastructure.mjs'

const postgres = infrastructureServices.find((service) => service.name === 'postgres')
const configHash = 'expected-config-hash'
const projectName = 'my-bot'

function container({
  hash = configHash,
  service = 'postgres',
  health = 'healthy',
  project = projectName,
} = {}) {
  return {
    Config: {
      Labels: {
        'com.docker.compose.config-hash': hash,
        'com.docker.compose.project': project,
        'com.docker.compose.service': service,
      },
    },
    State: { Health: { Status: health } },
  }
}

test('recognizes only a container from the current Compose project and service configuration', () => {
  assert.equal(
    isOwnedInfrastructureContainer(container(), postgres, configHash, projectName),
    true,
  )
  assert.equal(
    isOwnedInfrastructureContainer(
      container({ project: 'other-project' }),
      postgres,
      configHash,
      projectName,
    ),
    false,
  )
  assert.equal(
    isOwnedInfrastructureContainer(
      container({ hash: 'other-hash' }),
      postgres,
      configHash,
      projectName,
    ),
    false,
  )
  assert.equal(
    isOwnedInfrastructureContainer(
      container({ service: 'redis' }),
      postgres,
      configHash,
      projectName,
    ),
    false,
  )
})

test('allows an available port and reuses our healthy database', () => {
  assert.deepEqual(
    classifyInfrastructurePort({
      service: postgres,
      allocated: false,
      containers: [],
      configHash,
      projectName,
    }),
    { status: 'available' },
  )
  assert.equal(
    classifyInfrastructurePort({
      service: postgres,
      allocated: true,
      containers: [container()],
      configHash,
      projectName,
    }).status,
    'owned',
  )
})

test('rejects an allocated port owned by another process or Compose project', () => {
  const checks = [
    {
      service: postgres,
      result: classifyInfrastructurePort({
        service: postgres,
        allocated: true,
        containers: [container({ hash: 'other-hash' })],
        configHash,
        projectName,
      }),
    },
  ]
  const error = infrastructurePortError(checks)

  assert.equal(checks[0].result.status, 'conflict')
  assert.match(
    error.message,
    /Port 5434 for PostgreSQL is already in use by another process or Compose project/,
  )
  assert.match(error.message, /I did not stop anything automatically/)
})

test('does not treat an unhealthy copy of our service as ready', () => {
  const result = classifyInfrastructurePort({
    service: postgres,
    allocated: true,
    containers: [container({ health: 'starting' })],
    configHash,
    projectName,
  })

  assert.equal(result.status, 'owned-unready')
  assert.match(
    infrastructurePortError([{ service: postgres, result }]).message,
    /not ready yet \(status: starting\)/,
  )
})
