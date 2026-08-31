import { defineConfig } from 'vitest/config'
import { resolvedTestEnvironment } from './vitest.env.js'

export default defineConfig({ test: {
  env: resolvedTestEnvironment(),
  fileParallelism: false,
  include: ['tests/**/*.integration.test.ts'],
  testTimeout: 30000,
} })
