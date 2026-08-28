import { assertInfrastructurePrerequisites, startInfrastructure } from './lib/development.mjs'

try {
  await assertInfrastructurePrerequisites()
  await startInfrastructure()
} catch (error) {
  console.error(`\nInfrastructure startup failed: ${error.message}`)
  process.exitCode = 1
}
