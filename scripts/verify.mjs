import { prepareDevelopment } from './lib/development.mjs'
import { npmCommand } from './lib/project.mjs'
import { run } from './lib/process.mjs'

try {
  await prepareDevelopment()
  await run(npmCommand, ['run', 'check'], { label: 'Run repository checks' })
  await run(
    'uv',
    [
      'run',
      '--project',
      'apps/api',
      'pytest',
      'apps/api/tests/auth/test_auth_integration.py',
    ],
    {
      label: 'Run PostgreSQL and Redis authentication integration tests',
      env: { ...process.env, RUN_INTEGRATION_TESTS: '1' },
    },
  )
  await run(
    'uv',
    [
      'run',
      '--project',
      'apps/api',
      'alembic',
      '-c',
      'apps/api/alembic.ini',
      'check',
    ],
    { label: 'Check migration drift' },
  )
  console.log('\nVerification completed successfully.')
} catch (error) {
  console.error(`\nVerification failed: ${error.message}`)
  process.exitCode = 1
}
