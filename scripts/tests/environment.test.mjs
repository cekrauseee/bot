import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  externalAuthenticationStatus,
  parseEnvironment,
  prepareEnvironment,
} from '../lib/environment.mjs'

const example = `SESSION_SECRET=replace-with-session
OTP_PEPPER=replace-with-otp
RATE_LIMIT_PEPPER=replace-with-rate
GOOGLE_CLIENT_ID=example.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
RESEND_API_KEY=re_example
RESEND_FROM="myBot <hello@example.com>"
RESEND_OTP_TEMPLATE_ID=mybot-login-otp
`

async function fixture(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mybot-scripts-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  await writeFile(path.join(root, '.env.example'), example)
  await mkdir(path.join(root, 'apps/web'), { recursive: true })
  await writeFile(
    path.join(root, 'apps/web/.env.example'),
    'VITE_API_BASE_URL=http://localhost:8000\n',
  )
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
  ]

  assert.equal(result.createdEnv, true)
  assert.equal(result.createdWebEnv, true)
  assert.deepEqual(result.generatedSecretKeys, [
    'SESSION_SECRET',
    'OTP_PEPPER',
    'RATE_LIMIT_PEPPER',
  ])
  assert.equal(new Set(generatedValues).size, 3)
  assert.equal(values.get('RESEND_FROM'), 'myBot <hello@mybot.cekrause.eu>')
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

test('prepareEnvironment rejects repeated or weak generated values', async (context) => {
  const root = await fixture(context)

  await assert.rejects(
    prepareEnvironment(root, { createSecret: () => 'repeated-but-long-secret'.padEnd(40, '-') }),
    /independent local authentication secrets/,
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
        .replace('hello@example.com', 'hello@mybot.cekrause.eu'),
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
