import { prepareDevelopment } from './lib/development.mjs'

try {
  await prepareDevelopment({ dependencies: 'always' })
  console.log('\nDevelopment setup is ready. Run: npm run dev')
} catch (error) {
  console.error(`\nSetup failed: ${error.message}`)
  process.exitCode = 1
}
