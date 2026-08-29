import { prepareDevelopment } from './lib/development.mjs'
import { npmCommand } from './lib/project.mjs'
import { run } from './lib/process.mjs'

try {
  await prepareDevelopment()
  await run(npmCommand, ['run', 'check'], { label: 'Run repository checks' })
  await run(npmCommand, ['run', 'api:test:integration'], {
    label: 'Run PostgreSQL and Redis integration tests',
  })
  await run(npmCommand, ['run', 'db:check'], { label: 'Check migration history' })
  console.log('\nVerification completed successfully.')
} catch (error) {
  console.error(`\nVerification failed: ${error.message}`)
  process.exitCode = 1
}
