import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { loadSettings } from '../config.js'

const requiredColumns: Record<string, string[]> = {
  users: ['id', 'email', 'first_name', 'last_name', 'avatar_url', 'email_verified_at', 'created_at', 'updated_at'],
  oauth_identities: ['id', 'user_id', 'provider', 'provider_subject', 'provider_email', 'created_at', 'updated_at'],
  sessions: ['id', 'user_id', 'token_hash', 'created_at', 'expires_at', 'revoked_at', 'last_seen_at'],
}
const requiredConstraints = [
  'uq_users_email',
  'ck_users_email_lowercase',
  'fk_oauth_identities_user_id_users',
  'uq_oauth_identities_provider_subject',
  'fk_sessions_user_id_users',
  'uq_sessions_token_hash',
]
const requiredIndexes = [
  'ix_oauth_identities_user_id',
  'ix_sessions_user_id',
  'ix_sessions_expires_at_revoked_at',
]

const migrationPath = fileURLToPath(new URL('../../drizzle/0000_compatibility.sql', import.meta.url))

async function checkDatabase() {
  const client = postgres(loadSettings().databaseUrl)
  try {
    const tables = await client`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('users', 'oauth_identities', 'sessions')
    `
    if (tables.length !== 3) throw new Error('missing auth tables')

    for (const [table, columns] of Object.entries(requiredColumns)) {
      const rows = await client`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = ${table}
      `
      const actual = new Set(rows.map((row) => row.column_name))
      if (columns.some((column) => !actual.has(column))) throw new Error(`missing columns in ${table}`)
    }

    const constraints = await client`
      select c.conname, pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.conrelid::regclass::text in ('users', 'oauth_identities', 'sessions')
    `
    const byName = new Map(constraints.map((row) => [row.conname, String(row.definition).toLowerCase()]))
    if (requiredConstraints.some((name) => !byName.has(name))) throw new Error('missing auth constraints')
    const expectedConstraints: Record<string, string[]> = {
      uq_users_email: ['unique', 'email'],
      ck_users_email_lowercase: ['check', 'lower'],
      uq_oauth_identities_provider_subject: ['unique', 'provider', 'provider_subject'],
      uq_sessions_token_hash: ['unique', 'token_hash'],
      fk_oauth_identities_user_id_users: ['foreign key', 'user_id', 'users'],
      fk_sessions_user_id_users: ['foreign key', 'user_id', 'users'],
    }
    for (const [name, fragments] of Object.entries(expectedConstraints)) {
      const definition = byName.get(name) ?? ''
      if (fragments.some((fragment) => !definition.includes(fragment))) throw new Error(`invalid constraint ${name}`)
    }

    const indexes = await client`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and tablename in ('users', 'oauth_identities', 'sessions')
    `
    const indexDefinitions = new Map(indexes.map((row) => [row.indexname, String(row.indexdef).toLowerCase()]))
    if (requiredIndexes.some((name) => !indexDefinitions.has(name))) throw new Error('missing auth indexes')
    const expectedIndexes: Record<string, string[]> = {
      ix_oauth_identities_user_id: ['user_id'],
      ix_sessions_user_id: ['user_id'],
      ix_sessions_expires_at_revoked_at: ['expires_at', 'revoked_at'],
    }
    for (const [name, fragments] of Object.entries(expectedIndexes)) {
      const definition = indexDefinitions.get(name) ?? ''
      if (fragments.some((fragment) => !definition.includes(fragment))) throw new Error(`invalid index ${name}`)
    }

    const migrationTable = await client`
      select 1 from information_schema.tables
      where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
    `
    if (!migrationTable.length) throw new Error('database migration record is missing')
    const migration = await client`select hash from drizzle.__drizzle_migrations order by created_at desc limit 1`
    const query = await readFile(migrationPath, 'utf8')
    const expectedHash = createHash('sha256').update(query).digest('hex')
    if (migration[0]?.hash !== expectedHash) throw new Error('database migration record does not match local migration')
    console.log('auth schema and migration record OK')
  } finally {
    await client.end({ timeout: 2 })
  }
}

try {
  await checkDatabase()
} catch (error) {
  console.error(error instanceof Error ? error.message : 'database check failed')
  process.exitCode = 1
}
