import { defineConfig } from 'vitest/config'
import { resolvedTestEnvironment } from './vitest.env.js'

export default defineConfig({ test: {
  env: resolvedTestEnvironment(),
  include: ['tests/**/*.test.ts'],
  exclude: ['tests/**/*.integration.test.ts'],
} })
