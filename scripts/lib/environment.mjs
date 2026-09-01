import { randomBytes } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { projectRoot } from './project.mjs'

const LOCAL_SECRET_KEYS = [
  'SESSION_SECRET',
  'OTP_PEPPER',
  'RATE_LIMIT_PEPPER',
  'AI_SERVICE_TOKEN',
  'RUNTIME_SERVICE_TOKEN',
]
const LOCAL_DEFAULTS = new Map([
  ['RUNTIME_BASE_URL', 'http://localhost:8002'],
  ['RUNTIME_PORT', '8002'],
  ['RUNTIME_ENVIRONMENT', 'development'],
])
const GOOGLE_CONFIG_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
const RESEND_CONFIG_KEYS = ['RESEND_API_KEY']
const DEFAULT_SENDER = 'myBot <mybot@cekrause.eu>'

function unquote(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1)
  }
  return value
}

export function parseEnvironment(contents) {
  const values = new Map()

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    const value = unquote(trimmed.slice(separator + 1).trim())
    values.set(key, value)
  }

  return values
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase()
  return (
    !normalized ||
    normalized.startsWith('replace-with-') ||
    normalized.startsWith('development-') ||
    normalized.startsWith('example-') ||
    normalized.startsWith('your-') ||
    normalized === 'change-me' ||
    normalized === 'changeme' ||
    normalized === 're_example' ||
    normalized === 'example.apps.googleusercontent.com'
  )
}

function setEnvironmentValue(contents, key, value) {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')

  if (pattern.test(contents)) return contents.replace(pattern, line)
  return `${contents.trimEnd()}\n${line}\n`
}

export function alignEnvironment(template, current) {
  const currentLines = new Map()
  for (const line of current.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)
    if (match) currentLines.set(match[1], line)
  }

  const templateKeys = new Set()
  const aligned = template.split(/\r?\n/).map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)
    if (!match) return line
    templateKeys.add(match[1])
    return currentLines.get(match[1]) ?? line
  })
  const unsupported = [...currentLines.keys()].filter((key) => !templateKeys.has(key))
  if (unsupported.length) {
    throw new Error(`Unsupported .env variables: ${unsupported.sort().join(', ')}`)
  }

  while (aligned.at(-1) === '') aligned.pop()
  return `${aligned.join('\n')}\n`
}

function createUniqueSecret(createSecret, usedSecrets) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = createSecret()
    if (candidate.length >= 32 && !isPlaceholder(candidate) && !usedSecrets.has(candidate)) {
      usedSecrets.add(candidate)
      return candidate
    }
  }

  throw new Error('Unable to generate independent local service secrets')
}

async function copyIfMissing(source, destination) {
  try {
    await readFile(destination)
    return false
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  await mkdir(path.dirname(destination), { recursive: true })
  await copyFile(source, destination)
  return true
}

export function externalAuthenticationStatus(values) {
  const missing = []

  for (const key of GOOGLE_CONFIG_KEYS) {
    if (isPlaceholder(values.get(key) ?? '')) missing.push(key)
  }

  for (const key of RESEND_CONFIG_KEYS) {
    if (isPlaceholder(values.get(key) ?? '')) missing.push(key)
  }

  const sender = values.get('RESEND_FROM') ?? ''
  if (!sender || sender.includes('@example.com')) missing.push('RESEND_FROM')

  return {
    configured: missing.length === 0,
    missing,
  }
}

export async function readExternalAuthenticationStatus(root = projectRoot) {
  const envPath = path.join(root, '.env')

  try {
    return externalAuthenticationStatus(parseEnvironment(await readFile(envPath, 'utf8')))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { configured: false, missing: ['.env'] }
    }
    throw error
  }
}

export async function prepareEnvironment(
  root = projectRoot,
  { createSecret = () => randomBytes(48).toString('base64url') } = {},
) {
  const envExample = path.join(root, '.env.example')
  const envPath = path.join(root, '.env')

  const createdEnv = await copyIfMissing(envExample, envPath)
  const templateContents = await readFile(envExample, 'utf8')
  const originalContents = await readFile(envPath, 'utf8')
  let contents = alignEnvironment(templateContents, originalContents)
  let values = parseEnvironment(contents)
  const generatedSecretKeys = []
  const configuredDefaultKeys = []
  const usedSecrets = new Set(
    LOCAL_SECRET_KEYS.map((key) => values.get(key)).filter(
      (value) => value && !isPlaceholder(value),
    ),
  )

  for (const key of LOCAL_SECRET_KEYS) {
    if (isPlaceholder(values.get(key) ?? '')) {
      const secret = createUniqueSecret(createSecret, usedSecrets)
      contents = setEnvironmentValue(contents, key, secret)
      generatedSecretKeys.push(key)
      values.set(key, secret)
    }
  }

  for (const [key, value] of LOCAL_DEFAULTS) {
    if (!values.has(key) || isPlaceholder(values.get(key) ?? '')) {
      contents = setEnvironmentValue(contents, key, value)
      configuredDefaultKeys.push(key)
      values.set(key, value)
    }
  }

  if ((values.get('RESEND_FROM') ?? '').includes('@example.com')) {
    contents = setEnvironmentValue(contents, 'RESEND_FROM', `"${DEFAULT_SENDER}"`)
    values.set('RESEND_FROM', DEFAULT_SENDER)
  }

  if (contents !== originalContents) {
    await writeFile(envPath, contents, { mode: 0o600 })
  }
  await chmod(envPath, 0o600)

  return {
    createdEnv,
    generatedSecretKeys,
    configuredDefaultKeys,
    authentication: externalAuthenticationStatus(values),
  }
}

export function printEnvironmentSummary(result) {
  const lines = []
  if (result.createdEnv) lines.push('✓ Created .env')
  if (result.generatedSecretKeys.length > 0) {
    lines.push(`✓ Generated ${result.generatedSecretKeys.length} independent local service secrets`)
  }
  if (result.configuredDefaultKeys.length > 0) {
    lines.push(`✓ Configured ${result.configuredDefaultKeys.length} local runtime defaults`)
  }

  if (result.authentication.configured) {
    lines.push('✓ Google and Resend variables are configured')
  } else {
    lines.push(`⚠ External auth still needs: ${result.authentication.missing.join(', ')}`)
  }
  console.log(`\n${lines.join('\n')}`)
}
