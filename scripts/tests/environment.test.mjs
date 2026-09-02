import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  alignEnvironment,
  externalAuthenticationStatus,
  parseEnvironment,
  prepareEnvironment,
} from '../lib/environment.mjs'

const example = `SESSION_SECRET=replace-with-session
OTP_PEPPER=replace-with-otp
RATE_LIMIT_PEPPER=replace-with-rate
AI_SERVICE_TOKEN=replace-with-ai-service-token
RUNTIME_SERVICE_TOKEN=replace-with-runtime-service-token
RUNTIME_BASE_URL=http://localhost:8002
RUNTIME_PORT=8002
RUNTIME_ENVIRONMENT=development
RUNTIME_PROVIDER=docker
GOOGLE_CLIENT_ID=example.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
RESEND_API_KEY=re_example
RESEND_FROM="myBot <hello@example.com>"
`

async function fixture(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mybot-scripts-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  await writeFile(path.join(root, '.env.example'), example)
  return root
}

test('prepareEnvironment creates files and generates independent local secrets', async (context) => {
  const root = await fixture(context)
  let counter = 0
  const result = await prepareEnvironment(root, {
    createSecret: () => `generated-secret-${++counter}`.padEnd(40, '-'),
  })
  const values = parseEnvironment(await readFile(path.join(root, '.env'), 'utf8'))
  const generatedValues = [
    values.get('SESSION_SECRET'),
    values.get('OTP_PEPPER'),
    values.get('RATE_LIMIT_PEPPER'),
    values.get('AI_SERVICE_TOKEN'),
    values.get('RUNTIME_SERVICE_TOKEN'),
  ]

  assert.equal(result.createdEnv, true)
  assert.deepEqual(result.generatedSecretKeys, [
    'SESSION_SECRET',
    'OTP_PEPPER',
    'RATE_LIMIT_PEPPER',
    'AI_SERVICE_TOKEN',
    'RUNTIME_SERVICE_TOKEN',
  ])
  assert.equal(new Set(generatedValues).size, 5)
  assert.deepEqual(result.configuredDefaultKeys, [])
  assert.equal(values.get('RESEND_FROM'), 'myBot <mybot@cekrause.eu>')
  assert.equal((await stat(path.join(root, '.env'))).mode & 0o777, 0o600)
})

test('prepareEnvironment preserves existing secrets on repeated runs', async (context) => {
  const root = await fixture(context)
  let counter = 0
  await prepareEnvironment(root, {
    createSecret: () => `first-generated-secret-${++counter}`.padEnd(40, '-'),
  })
  const before = await readFile(path.join(root, '.env'), 'utf8')

  const result = await prepareEnvironment(root, {
    createSecret: () => 'must-not-replace-existing-secret',
  })
  const after = await readFile(path.join(root, '.env'), 'utf8')

  assert.equal(result.generatedSecretKeys.length, 0)
  assert.equal(after, before)
})

test('alignEnvironment follows the canonical template exactly', () => {
  const aligned = alignEnvironment(
    'ENVIRONMENT=development\nVITE_API_BASE_URL=http://localhost:8000\n',
    'ENVIRONMENT=test\n',
  )

  assert.equal(aligned, [
    'ENVIRONMENT=test',
    'VITE_API_BASE_URL=http://localhost:8000',
    '',
  ].join('\n'))
})

test('alignEnvironment rejects undocumented variables without exposing values', () => {
  assert.throws(
    () => alignEnvironment('ENVIRONMENT=development\n', 'ENVIRONMENT=test\nSTALE_SETTING=secret\n'),
    /^Error: Unsupported \.env variables: STALE_SETTING$/,
  )
})

test('prepareEnvironment aligns missing runtime settings and preserves overrides', async (context) => {
  const root = await fixture(context)
  let counter = 0
  await writeFile(
    path.join(root, '.env'),
    example
      .replace('RUNTIME_BASE_URL=http://localhost:8002\n', '')
      .replace('RUNTIME_PORT=8002\n', 'RUNTIME_PORT=9002\n')
      .replace('RUNTIME_ENVIRONMENT=development\n', '')
      .replace('RUNTIME_PROVIDER=docker\n', ''),
  )

  const result = await prepareEnvironment(root, {
    createSecret: () => `runtime-default-secret-${++counter}`.padEnd(48, '-'),
  })
  const values = parseEnvironment(await readFile(path.join(root, '.env'), 'utf8'))

  assert.deepEqual(result.configuredDefaultKeys, [])
  assert.equal(values.get('RUNTIME_BASE_URL'), 'http://localhost:8002')
  assert.equal(values.get('RUNTIME_PORT'), '9002')
  assert.equal(values.get('RUNTIME_ENVIRONMENT'), 'development')
  assert.equal(values.get('RUNTIME_PROVIDER'), 'docker')
})

test('prepareEnvironment rejects repeated or weak generated values', async (context) => {
  const root = await fixture(context)

  await assert.rejects(
    prepareEnvironment(root, { createSecret: () => 'repeated-but-long-secret'.padEnd(40, '-') }),
    /independent local service secrets/,
  )
})

test('externalAuthenticationStatus reports only external provider gaps', () => {
  const missing = externalAuthenticationStatus(parseEnvironment(example))
  const configured = externalAuthenticationStatus(
    parseEnvironment(
      example
        .replace('example.apps.googleusercontent.com', 'client.apps.googleusercontent.com')
        .replace('replace-with-google-client-secret', 'google-secret')
        .replace('re_example', 're_live')
        .replace('hello@example.com', 'mybot@cekrause.eu'),
    ),
  )

  assert.deepEqual(missing.missing, [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'RESEND_API_KEY',
    'RESEND_FROM',
  ])
  assert.equal(configured.configured, true)
})
