import { loadSettings } from '../config.js'
import { compareMigrationHistory, readMigrationManifest, resolveMigrationsFolder } from './migrations.js'
import type { QueryClient, QueryRow } from './drivers/types.js'

type ColumnContract = {
  name: string
  type: string
  length: number | null
  nullable: boolean
  defaultValue: string | null
}
type ConstraintContract = { table: string; name: string; type: string; definition: string }
type IndexContract = { table: string; name: string; definition: string }
type ConstraintRow = QueryRow & { table_name: unknown; conname: unknown; contype: unknown; definition: unknown }
type IndexRow = QueryRow & { table_name: unknown; indexname: unknown; indexdef: unknown; is_primary: unknown }
type ColumnRow = QueryRow & {
  table_name: unknown
  column_name: unknown
  data_type: unknown
  character_maximum_length: unknown
  is_nullable: unknown
  column_default: unknown
}

const columns: Record<string, ColumnContract[]> = {
  users: [
    { name: 'id', type: 'uuid', length: null, nullable: false, defaultValue: 'gen_random_uuid()' },
    { name: 'email', type: 'character varying', length: 320, nullable: false, defaultValue: null },
    { name: 'first_name', type: 'character varying', length: 100, nullable: true, defaultValue: null },
    { name: 'last_name', type: 'character varying', length: 100, nullable: true, defaultValue: null },
    { name: 'avatar_url', type: 'character varying', length: 2048, nullable: true, defaultValue: null },
    { name: 'email_verified_at', type: 'timestamp with time zone', length: null, nullable: true, defaultValue: null },
    { name: 'created_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
    { name: 'updated_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
  ],
  oauth_identities: [
    { name: 'id', type: 'uuid', length: null, nullable: false, defaultValue: 'gen_random_uuid()' },
    { name: 'user_id', type: 'uuid', length: null, nullable: false, defaultValue: null },
    { name: 'provider', type: 'character varying', length: 50, nullable: false, defaultValue: null },
    { name: 'provider_subject', type: 'character varying', length: 255, nullable: false, defaultValue: null },
    { name: 'provider_email', type: 'character varying', length: 320, nullable: true, defaultValue: null },
    { name: 'created_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
    { name: 'updated_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
  ],
  sessions: [
    { name: 'id', type: 'uuid', length: null, nullable: false, defaultValue: 'gen_random_uuid()' },
    { name: 'user_id', type: 'uuid', length: null, nullable: false, defaultValue: null },
    { name: 'token_hash', type: 'bytea', length: null, nullable: false, defaultValue: null },
    { name: 'created_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
    { name: 'expires_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: null },
    { name: 'revoked_at', type: 'timestamp with time zone', length: null, nullable: true, defaultValue: null },
    { name: 'last_seen_at', type: 'timestamp with time zone', length: null, nullable: true, defaultValue: null },
  ],
  projects: [
    { name: 'id', type: 'uuid', length: null, nullable: false, defaultValue: 'gen_random_uuid()' },
    { name: 'user_id', type: 'uuid', length: null, nullable: false, defaultValue: null },
    { name: 'name', type: 'character varying', length: 80, nullable: false, defaultValue: null },
    { name: 'slug', type: 'character varying', length: 100, nullable: false, defaultValue: null },
    { name: 'created_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
    { name: 'updated_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
    { name: 'sort_order', type: 'integer', length: null, nullable: true, defaultValue: null },
    { name: 'order_updated_at', type: 'timestamp with time zone', length: null, nullable: true, defaultValue: null },
  ],
  conversations: [
    { name: 'id', type: 'uuid', length: null, nullable: false, defaultValue: 'gen_random_uuid()' },
    { name: 'user_id', type: 'uuid', length: null, nullable: false, defaultValue: null },
    { name: 'title', type: 'character varying', length: 120, nullable: false, defaultValue: null },
    { name: 'created_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
    { name: 'updated_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
    { name: 'project_id', type: 'uuid', length: null, nullable: true, defaultValue: null },
    { name: 'pinned_order', type: 'integer', length: null, nullable: true, defaultValue: null },
    { name: 'pin_updated_at', type: 'timestamp with time zone', length: null, nullable: true, defaultValue: null },
    { name: 'title_updated_at', type: 'timestamp with time zone', length: null, nullable: true, defaultValue: null },
  ],
  messages: [
    { name: 'id', type: 'uuid', length: null, nullable: false, defaultValue: 'gen_random_uuid()' },
    { name: 'conversation_id', type: 'uuid', length: null, nullable: false, defaultValue: null },
    { name: 'role', type: 'character varying', length: 20, nullable: false, defaultValue: null },
    { name: 'content', type: 'text', length: null, nullable: false, defaultValue: "''::text" },
    { name: 'reasoning', type: 'text', length: null, nullable: true, defaultValue: null },
    { name: 'status', type: 'character varying', length: 20, nullable: false, defaultValue: null },
    { name: 'error_message', type: 'text', length: null, nullable: true, defaultValue: null },
    { name: 'model', type: 'character varying', length: 20, nullable: true, defaultValue: null },
    { name: 'reasoning_effort', type: 'character varying', length: 20, nullable: true, defaultValue: null },
    { name: 'speed', type: 'character varying', length: 20, nullable: true, defaultValue: null },
    { name: 'activities', type: 'jsonb', length: null, nullable: false, defaultValue: "'[]'::jsonb" },
    { name: 'created_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
    { name: 'updated_at', type: 'timestamp with time zone', length: null, nullable: false, defaultValue: 'now()' },
  ],
}

const constraints: ConstraintContract[] = [
  // Primary-key names are intentionally not part of the contract: an adopted
  // Alembic schema may use pk_users while a fresh PostgreSQL schema uses
  // users_pkey. The table, type, and ordered key columns remain exact.
  { table: 'users', name: '', type: 'p', definition: 'PRIMARY KEY (id)' },
  { table: 'users', name: 'uq_users_email', type: 'u', definition: 'UNIQUE (email)' },
  { table: 'users', name: 'ck_users_email_lowercase', type: 'c', definition: 'CHECK (email = lower(email))' },
  { table: 'oauth_identities', name: '', type: 'p', definition: 'PRIMARY KEY (id)' },
  { table: 'oauth_identities', name: 'fk_oauth_identities_user_id_users', type: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
  { table: 'oauth_identities', name: 'uq_oauth_identities_provider_subject', type: 'u', definition: 'UNIQUE (provider, provider_subject)' },
  { table: 'sessions', name: '', type: 'p', definition: 'PRIMARY KEY (id)' },
  { table: 'sessions', name: 'fk_sessions_user_id_users', type: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
  { table: 'sessions', name: 'uq_sessions_token_hash', type: 'u', definition: 'UNIQUE (token_hash)' },
  { table: 'projects', name: '', type: 'p', definition: 'PRIMARY KEY (id)' },
  { table: 'projects', name: 'projects_user_id_users_id_fk', type: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
  { table: 'projects', name: 'uq_projects_user_id_slug', type: 'u', definition: 'UNIQUE (user_id, slug)' },
  { table: 'conversations', name: '', type: 'p', definition: 'PRIMARY KEY (id)' },
  { table: 'conversations', name: 'conversations_user_id_users_id_fk', type: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
  { table: 'conversations', name: 'conversations_project_id_projects_id_fk', type: 'f', definition: 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL' },
  { table: 'messages', name: '', type: 'p', definition: 'PRIMARY KEY (id)' },
  { table: 'messages', name: 'messages_conversation_id_conversations_id_fk', type: 'f', definition: 'FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE' },
]

const indexes: IndexContract[] = [
  { table: 'users', name: 'uq_users_email', definition: 'CREATE UNIQUE INDEX uq_users_email ON public.users USING btree (email)' },
  { table: 'oauth_identities', name: 'ix_oauth_identities_user_id', definition: 'CREATE INDEX ix_oauth_identities_user_id ON public.oauth_identities USING btree (user_id)' },
  { table: 'oauth_identities', name: 'uq_oauth_identities_provider_subject', definition: 'CREATE UNIQUE INDEX uq_oauth_identities_provider_subject ON public.oauth_identities USING btree (provider, provider_subject)' },
  { table: 'sessions', name: 'ix_sessions_expires_at_revoked_at', definition: 'CREATE INDEX ix_sessions_expires_at_revoked_at ON public.sessions USING btree (expires_at, revoked_at)' },
  { table: 'sessions', name: 'ix_sessions_user_id', definition: 'CREATE INDEX ix_sessions_user_id ON public.sessions USING btree (user_id)' },
  { table: 'sessions', name: 'uq_sessions_token_hash', definition: 'CREATE UNIQUE INDEX uq_sessions_token_hash ON public.sessions USING btree (token_hash)' },
  { table: 'projects', name: 'ix_projects_user_id_created_at', definition: 'CREATE INDEX ix_projects_user_id_created_at ON public.projects USING btree (user_id, created_at)' },
  { table: 'projects', name: 'uq_projects_user_id_slug', definition: 'CREATE UNIQUE INDEX uq_projects_user_id_slug ON public.projects USING btree (user_id, slug)' },
  { table: 'projects', name: 'ix_projects_user_id_sort_order', definition: 'CREATE INDEX ix_projects_user_id_sort_order ON public.projects USING btree (user_id, sort_order)' },
  { table: 'conversations', name: 'ix_conversations_project_id_updated_at', definition: 'CREATE INDEX ix_conversations_project_id_updated_at ON public.conversations USING btree (project_id, updated_at)' },
  { table: 'conversations', name: 'ix_conversations_user_id_updated_at', definition: 'CREATE INDEX ix_conversations_user_id_updated_at ON public.conversations USING btree (user_id, updated_at)' },
  { table: 'conversations', name: 'ix_conversations_user_id_pinned_order', definition: 'CREATE INDEX ix_conversations_user_id_pinned_order ON public.conversations USING btree (user_id, pinned_order)' },
  { table: 'messages', name: 'ix_messages_conversation_id_created_at', definition: 'CREATE INDEX ix_messages_conversation_id_created_at ON public.messages USING btree (conversation_id, created_at)' },
  { table: 'messages', name: 'uq_messages_one_streaming_assistant', definition: "CREATE UNIQUE INDEX uq_messages_one_streaming_assistant ON public.messages USING btree (conversation_id) WHERE (((role)::text = 'assistant'::text) AND ((status)::text = 'streaming'::text))" },
]

const normalizeSql = (value: string) => value.toLowerCase()
  .replaceAll('"', '')
  .replaceAll('public.', '')
  .replace(/\s+/g, ' ')
  .trim()
const isWrapped = (value: string) => {
  if (!value.startsWith('(') || !value.endsWith(')')) return false
  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1
    if (value[index] === ')') depth -= 1
    if (depth === 0 && index < value.length - 1) return false
  }
  return depth === 0
}
const normalizeConstraint = (value: string) => {
  const normalized = normalizeSql(value).replace(/\(([^)]+)\)::text/g, '$1')
  if (!normalized.startsWith('check ')) return normalized
  let expression = normalized.slice('check '.length).trim()
  while (isWrapped(expression)) expression = expression.slice(1, -1).trim()
  return `check (${expression})`
}

const contractKey = (row: ConstraintContract) =>
  `${row.table}|${row.type}|${row.type === 'p' ? '' : row.name}|${row.definition}`

export function validateConstraintContract(rows: readonly ConstraintRow[]) {
  const actual = rows.filter((row) => String(row.contype) !== 'n').map((row) => ({
    table: String(row.table_name), name: String(row.conname), type: String(row.contype),
    definition: normalizeConstraint(String(row.definition)),
  })).sort((left, right) => contractKey(left).localeCompare(contractKey(right)))
  const expected = constraints.map((constraint) => ({ ...constraint, definition: normalizeConstraint(constraint.definition) }))
    .sort((left, right) => contractKey(left).localeCompare(contractKey(right)))
  return actual.length === expected.length && actual.every((row, index) =>
    row.table === expected[index].table && (row.type === 'p' || row.name === expected[index].name) &&
    row.type === expected[index].type && row.definition === expected[index].definition,
  )
}

const tableOrder = (table: string) => {
  if (table === 'users') return 1
  if (table === 'oauth_identities') return 2
  if (table === 'sessions') return 3
  if (table === 'projects') return 4
  if (table === 'conversations') return 5
  return 6
}
const indexKey = (row: IndexContract) => `${tableOrder(row.table)}|${row.name}|${row.definition}`

export function validateIndexContract(rows: readonly IndexRow[]) {
  const primary = rows.filter((row) => Boolean(row.is_primary))
  if (primary.length !== Object.keys(columns).length || primary.some((row) => {
    const table = String(row.table_name)
    const definition = normalizeSql(String(row.indexdef))
    return !definition.startsWith('create unique index ') || !definition.includes(` on ${table} using btree (id)`)
  })) return false
  const actual = rows.filter((row) => !row.is_primary).map((row) => ({
    table: String(row.table_name), name: String(row.indexname), definition: normalizeSql(String(row.indexdef)),
  })).sort((left, right) => indexKey(left).localeCompare(indexKey(right)))
  const expected = indexes.map((index) => ({ ...index, definition: normalizeSql(index.definition) }))
    .sort((left, right) => indexKey(left).localeCompare(indexKey(right)))
  return actual.length === expected.length && actual.every((row, index) =>
    row.table === expected[index].table && row.name === expected[index].name && row.definition === expected[index].definition,
  )
}

export async function checkDatabase(databaseUrl = loadSettings().databaseUrl) {
  const settings = loadSettings()
  const client: QueryClient = settings.environment === 'production'
    ? await (await import('./drivers/neon.js')).createNeonQueryClient(databaseUrl)
    : await (await import('./drivers/node-postgres.js')).createNodePostgresQueryClient(databaseUrl)
  try {
    const columnRows = (await client.query<ColumnRow>(`
      select table_name, column_name, data_type, character_maximum_length,
             is_nullable, column_default, ordinal_position
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('users', 'oauth_identities', 'sessions', 'projects', 'conversations', 'messages')
      order by table_name, ordinal_position
    `)).rows
    for (const [table, expected] of Object.entries(columns)) {
      const actual = columnRows.filter((row) => row.table_name === table)
      if (actual.length !== expected.length) throw new Error(`invalid column contract in ${table}`)
      for (let index = 0; index < expected.length; index += 1) {
        const wanted = expected[index]
        const row = actual[index]
        const actualDefault = row.column_default == null ? null : normalizeSql(String(row.column_default))
        if (row.column_name !== wanted.name || row.data_type !== wanted.type ||
            (row.character_maximum_length == null ? null : Number(row.character_maximum_length)) !== wanted.length ||
            (row.is_nullable === 'YES') !== wanted.nullable || actualDefault !== wanted.defaultValue) {
          throw new Error(`invalid column contract in ${table}.${wanted.name}`)
        }
      }
    }

    const constraintRows = (await client.query<ConstraintRow>(`
      select c.conrelid::regclass::text as table_name, c.conname,
             c.contype, pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.contype <> 'n'
        and c.conrelid::regclass::text in (
          'users', 'oauth_identities', 'sessions', 'projects', 'conversations', 'messages'
        )
    `)).rows
    if (!validateConstraintContract(constraintRows)) throw new Error('invalid database constraint contract')

    const indexRows = (await client.query<IndexRow>(`
      select p.tablename as table_name, p.indexname, p.indexdef, i.indisprimary as is_primary
      from pg_indexes p
      join pg_class index_class on index_class.relname = p.indexname
      join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
      join pg_index i on i.indexrelid = index_class.oid
      where p.schemaname = 'public' and index_namespace.nspname = 'public'
        and p.tablename in ('users', 'oauth_identities', 'sessions', 'projects', 'conversations', 'messages')
      order by case p.tablename
        when 'users' then 1
        when 'oauth_identities' then 2
        when 'sessions' then 3
        when 'projects' then 4
        when 'conversations' then 5
        else 6
      end, p.indexname
    `)).rows
    if (!validateIndexContract(indexRows)) throw new Error('invalid database index contract')

    const migrationTable = (await client.query(`
      select 1 from information_schema.tables
      where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
    `)).rows
    if (!migrationTable.length) throw new Error('database migration record is missing')
    const migrationsFolder = await resolveMigrationsFolder()
    const expectedMigrations = await readMigrationManifest(migrationsFolder)
    const appliedMigrations = (await client.query<QueryRow & { hash: unknown; createdAt: unknown }>(`
      select hash, created_at as "createdAt"
      from drizzle.__drizzle_migrations
      order by created_at asc, id asc
    `)).rows
    const migrationResult = compareMigrationHistory(expectedMigrations, appliedMigrations.map((row) => ({
      hash: String(row.hash), createdAt: row.createdAt as string | number | bigint,
    })))
    if (!migrationResult.ok) throw new Error(migrationResult.message)
    console.log('database schema and migration record OK')
  } finally {
    await client.end()
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    await checkDatabase()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'database check failed')
    process.exitCode = 1
  }
}
