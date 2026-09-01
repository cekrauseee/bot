import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import { projectRoot, turboBin, turboInvocation } from '../lib/project.mjs'

const exec = promisify(execFile)

async function jsonFile(relativePath) {
  return JSON.parse(await readFile(path.join(projectRoot, relativePath), 'utf8'))
}

test('npm discovers applications and packages through the workspace globs', async () => {
  const root = await jsonFile('package.json')
  assert.deepEqual(root.workspaces, ['apps/*', 'packages/*'])
  const { stdout } = await exec(path.join(projectRoot, 'node_modules/turbo/bin/turbo'), ['ls'], {
    cwd: projectRoot,
  })
  assert.match(stdout, /@my-bot\/ai apps\/ai/)
  assert.match(stdout, /@my-bot\/api apps\/api/)
  assert.match(stdout, /@my-bot\/email packages\/email/)
  assert.match(stdout, /@my-bot\/runtime apps\/runtime/)
  assert.match(stdout, /@my-bot\/web apps\/web/)
})

test('Turbo keeps internal builds topological and external tasks uncached', async () => {
  const turbo = await jsonFile('turbo.json')
  assert.deepEqual(turbo.tasks.build.dependsOn, ['^build'])
  assert.equal(turbo.tasks['test:integration'].cache, false)
  assert.equal(turbo.tasks['db:migrate'].cache, false)
  assert.equal(turbo.tasks['db:seed'].cache, false)
  assert.ok(turbo.tasks.test.env.includes('REDIS_URL'))
  assert.ok(turbo.tasks.test.env.includes('DATABASE_URL'))
  assert.ok(turbo.tasks.dev.env.includes('RUNTIME_BASE_URL'))
  assert.ok(turbo.tasks.dev.env.includes('RUNTIME_PORT'))
  assert.ok(turbo.tasks.dev.passThroughEnv.includes('RUNTIME_SERVICE_TOKEN'))
  assert.ok(turbo.tasks.dev.passThroughEnv.includes('VERCEL_OIDC_TOKEN'))
  assert.ok(turbo.tasks['db:check'].passThroughEnv.includes('ENVIRONMENT'))
  assert.ok(turbo.tasks['db:check'].passThroughEnv.includes('DATABASE_URL'))
  assert.ok(turbo.tasks['db:seed'].passThroughEnv.includes('MYBOT_SEED_USER_EMAIL'))
  assert.ok(turbo.globalDependencies.includes('.env'))
  assert.equal(turbo.tasks.dev.cache, false)
  assert.equal(turbo.tasks.dev.persistent, true)
  assert.deepEqual(turbo.tasks.build.outputs, ['dist/**'])
  assert.ok(!turbo.tasks.build.outputs.some((output) => output.includes('.venv')))
  assert.ok(!turbo.tasks.build.env.includes('DATABASE_URL'))
})

test('the AI package is a uv-only Turbo discovery wrapper', async () => {
  const ai = await jsonFile('apps/ai/package.json')
  assert.deepEqual(Object.keys(ai.scripts), ['dev', 'lint', 'test'])
  for (const command of Object.values(ai.scripts)) assert.match(command, /^uv run --project \. /)
  assert.ok(!Object.values(ai.scripts).some((command) => command.includes('--env-file')))
  assert.deepEqual(ai.dependencies, undefined)
  assert.deepEqual(ai.devDependencies, undefined)
})

test('the runtime package exposes the complete service lifecycle', async () => {
  const runtime = await jsonFile('apps/runtime/package.json')
  assert.deepEqual(Object.keys(runtime.scripts), [
    'dev',
    'build',
    'start',
    'typecheck',
    'lint',
    'test',
  ])
  assert.match(runtime.scripts.dev, /--env-file-if-exists=\.\.\/\.\.\/\.env/)
  assert.match(runtime.scripts.start, /--env-file-if-exists=\.\.\/\.\.\/\.env/)
})

test('development uses the Turbo TUI after the shared preflight', async () => {
  const source = await readFile(path.join(projectRoot, 'scripts/dev.mjs'), 'utf8')
  assert.ok(source.indexOf('await prepareEnvironment()') < source.indexOf('await assertDevelopmentPortsAvailable()'))
  assert.ok(source.indexOf('await prepareDevelopment({ environment })') < source.indexOf("'run', 'dev', '--ui=tui'"))
  assert.doesNotMatch(source, /detached:/)
  assert.match(source, /stopChildren\(signal\)/)
  assert.match(source, /turboInvocation\(\)/)
  assert.deepEqual(turboInvocation('darwin'), { command: turboBin, args: [] })
  assert.deepEqual(turboInvocation('win32'), { command: process.execPath, args: [turboBin] })
})

test('web development reads the canonical origin and refuses port fallback', async () => {
  const vite = await readFile(path.join(projectRoot, 'apps/web/vite.config.ts'), 'utf8')
  assert.match(vite, /WEB_BASE_URL/)
  assert.match(vite, /loadEnv\(mode, envDir, ''\)/)
  assert.match(vite, /strictPort:\s*true/)
  const webTurbo = await jsonFile('apps/web/turbo.json')
  assert.deepEqual(webTurbo.extends, ['//'])
  assert.match(vite, /\benvDir,/)

  const turbo = await jsonFile('turbo.json')
  assert.ok(turbo.globalDependencies.includes('.env.example'))
})

test('root script tests hash the source trees their checks inspect', async () => {
  const { stdout } = await exec(
    path.join(projectRoot, 'node_modules/turbo/bin/turbo'),
    ['run', '//#scripts:test', '--dry-run=json'],
    { cwd: projectRoot },
  )
  const rootTest = JSON.parse(stdout).tasks.find((task) => task.taskId === '//#scripts:test')
  assert.ok(rootTest.inputs['apps/web/src/main.tsx'])
  assert.ok(rootTest.inputs['apps/ai/pyproject.toml'])
  assert.ok(rootTest.inputs['packages/email/package.json'])
})
