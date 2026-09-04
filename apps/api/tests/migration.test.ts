import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { validateConstraintContract, validateIndexContract } from '../src/db/check.js'
import { compareMigrationHistory, readMigrationManifest } from '../src/db/migrations.js'

const migration = new URL('../drizzle/0000_compatibility.sql', import.meta.url)
const preferencesMigration = new URL('../drizzle/0013_normalize-gpt-model-preferences.sql', import.meta.url)

describe('compatibility migration', () => {
  it('is versioned and preserves named auth constraints on fresh schemas', async () => {
    const sql = await readFile(migration, 'utf8')
    expect(sql).toContain('CONSTRAINT uq_users_email UNIQUE')
    expect(sql).toContain('CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email))')
    expect(sql).toContain('CONSTRAINT uq_oauth_identities_provider_subject UNIQUE')
    expect(sql).toContain('CONSTRAINT uq_sessions_token_hash UNIQUE')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS')
    expect(sql).toContain('--> statement-breakpoint')
  })

  it('contains compatibility repair paths without DROP statements', async () => {
    const sql = await readFile(migration, 'utf8')
    expect(sql.toLowerCase()).not.toContain('drop table')
    expect(sql).toContain('ALTER TABLE users ALTER COLUMN id SET DEFAULT')
    expect(sql).toContain('RENAME CONSTRAINT')
  })

  it('normalizes removed model preferences to GPT defaults', async () => {
    const sql = await readFile(preferencesMigration, 'utf8')
    expect(sql).toContain('UPDATE "conversations"')
    expect(sql).toContain("\"model\" = 'gpt-5.6-sol'")
    expect(sql).toContain('UPDATE "agent_runs"')
  })

  it('derives ordered hashes from the journal and detects pending, mismatched, and out-of-order history', async () => {
    const expected = await readMigrationManifest(new URL('../drizzle/', import.meta.url))
    expect(expected).toHaveLength(16)
    expect(compareMigrationHistory(expected, [])).toMatchObject({ ok: false, reason: 'pending' })
    expect(compareMigrationHistory(expected, [{ hash: 'wrong' }])).toMatchObject({ ok: false, reason: 'mismatch' })
    expect(compareMigrationHistory(expected, [{ hash: expected[0].hash }]))
      .toMatchObject({ ok: false, reason: 'pending' })
    expect(compareMigrationHistory(expected, expected.map(({ hash }) => ({ hash })))).toEqual({ ok: true })
  })

  it('supports a future local migration without hard-coding the latest tag', async () => {
    const expected = await readMigrationManifest(new URL('../drizzle/', import.meta.url))
    const future = { ...expected[0], idx: 1, tag: '0001_future' }
    expect(compareMigrationHistory([expected[0], future], [{ hash: expected[0].hash }]))
      .toMatchObject({ ok: false, reason: 'pending' })
  })

  it('rejects known migrations recorded out of order', () => {
    const expected = [
      { idx: 0, tag: '0000_first', hash: 'first' },
      { idx: 1, tag: '0001_second', hash: 'second' },
    ]
    expect(compareMigrationHistory(expected, [{ hash: 'second' }, { hash: 'first' }]))
      .toMatchObject({ ok: false, reason: 'out-of-order' })
  })

  it('keeps development database commands on source and production commands on compiled assets', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url))) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts['db:migrate']).toBe('tsx src/db/migrate.ts')
    expect(packageJson.scripts['db:check']).toBe('tsx src/db/check.ts')
    expect(packageJson.scripts['db:migrate:production']).toBe('node dist/db/migrate.js')
    expect(packageJson.scripts['db:check:production']).toBe('node dist/db/check.js')
  })

  it('accepts adopted Alembic primary-key names and ignores PostgreSQL 18 NOT NULL rows', () => {
    const constraints = [
      { table_name: 'users', conname: 'pk_users', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'users', conname: 'uq_users_email', contype: 'u', definition: 'UNIQUE (email)' },
      { table_name: 'users', conname: 'ck_users_email_lowercase', contype: 'c', definition: 'CHECK (email = lower(email))' },
      { table_name: 'oauth_identities', conname: 'pk_oauth_identities', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'oauth_identities', conname: 'fk_oauth_identities_user_id_users', contype: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
      { table_name: 'oauth_identities', conname: 'uq_oauth_identities_provider_subject', contype: 'u', definition: 'UNIQUE (provider, provider_subject)' },
      { table_name: 'sessions', conname: 'pk_sessions', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'sessions', conname: 'fk_sessions_user_id_users', contype: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
      { table_name: 'sessions', conname: 'uq_sessions_token_hash', contype: 'u', definition: 'UNIQUE (token_hash)' },
      { table_name: 'provider_connections', conname: 'provider_connections_pkey', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'provider_connections', conname: 'provider_connections_user_id_users_id_fk', contype: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
      { table_name: 'provider_connections', conname: 'uq_provider_connections_user_id_provider', contype: 'u', definition: 'UNIQUE (user_id, provider)' },
      { table_name: 'projects', conname: 'projects_pkey', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'projects', conname: 'projects_user_id_users_id_fk', contype: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
      { table_name: 'projects', conname: 'uq_projects_user_id_slug', contype: 'u', definition: 'UNIQUE (user_id, slug)' },
      { table_name: 'conversations', conname: 'conversations_pkey', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'conversations', conname: 'conversations_user_id_users_id_fk', contype: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
      { table_name: 'conversations', conname: 'conversations_project_id_projects_id_fk', contype: 'f', definition: 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL' },
      { table_name: 'messages', conname: 'messages_pkey', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'messages', conname: 'messages_conversation_id_conversations_id_fk', contype: 'f', definition: 'FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE' },
      { table_name: 'agent_workspaces', conname: 'agent_workspaces_pkey', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'agent_workspaces', conname: 'agent_workspaces_user_id_users_id_fk', contype: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
      { table_name: 'agent_workspaces', conname: 'uq_agent_workspaces_user_id', contype: 'u', definition: 'UNIQUE (user_id)' },
      { table_name: 'agent_runs', conname: 'agent_runs_pkey', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'agent_runs', conname: 'agent_runs_workspace_id_agent_workspaces_id_fk', contype: 'f', definition: 'FOREIGN KEY (workspace_id) REFERENCES agent_workspaces(id) ON DELETE CASCADE' },
      { table_name: 'agent_runs', conname: 'agent_runs_user_id_users_id_fk', contype: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
      { table_name: 'agent_runs', conname: 'agent_runs_conversation_id_conversations_id_fk', contype: 'f', definition: 'FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE' },
      { table_name: 'agent_runs', conname: 'agent_runs_assistant_message_id_messages_id_fk', contype: 'f', definition: 'FOREIGN KEY (assistant_message_id) REFERENCES messages(id) ON DELETE CASCADE' },
      { table_name: 'agent_runs', conname: 'uq_agent_runs_turn_id', contype: 'u', definition: 'UNIQUE (turn_id)' },
      { table_name: 'agent_events', conname: 'agent_events_pkey', contype: 'p', definition: 'PRIMARY KEY (sequence)' },
      { table_name: 'agent_events', conname: 'agent_events_run_id_agent_runs_id_fk', contype: 'f', definition: 'FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE' },
      { table_name: 'users', conname: 'users_email_not_null', contype: 'n', definition: 'NOT NULL email' },
    ]
    constraints.splice(12, 0,
      { table_name: 'github_connections', conname: 'github_connections_pkey', contype: 'p', definition: 'PRIMARY KEY (id)' },
      { table_name: 'github_connections', conname: 'github_connections_user_id_users_id_fk', contype: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE' },
      { table_name: 'github_connections', conname: 'uq_github_connections_user_id', contype: 'u', definition: 'UNIQUE (user_id)' },
    )
    expect(validateConstraintContract(constraints)).toBe(true)
  })

  it('accepts adopted primary-key index names while requiring exact non-primary indexes', () => {
    const primary = (table: string, column = 'id') => ({ table_name: table, indexname: `pk_${table}`, indexdef: `CREATE UNIQUE INDEX pk_${table} ON public.${table} USING btree (${column})`, is_primary: true })
    const indexes = [
      primary('users'),
      { table_name: 'users', indexname: 'uq_users_email', indexdef: 'CREATE UNIQUE INDEX uq_users_email ON public.users USING btree (email)', is_primary: false },
      primary('oauth_identities'),
      { table_name: 'oauth_identities', indexname: 'ix_oauth_identities_user_id', indexdef: 'CREATE INDEX ix_oauth_identities_user_id ON public.oauth_identities USING btree (user_id)', is_primary: false },
      { table_name: 'oauth_identities', indexname: 'uq_oauth_identities_provider_subject', indexdef: 'CREATE UNIQUE INDEX uq_oauth_identities_provider_subject ON public.oauth_identities USING btree (provider, provider_subject)', is_primary: false },
      primary('sessions'),
      { table_name: 'sessions', indexname: 'ix_sessions_expires_at_revoked_at', indexdef: 'CREATE INDEX ix_sessions_expires_at_revoked_at ON public.sessions USING btree (expires_at, revoked_at)', is_primary: false },
      { table_name: 'sessions', indexname: 'ix_sessions_user_id', indexdef: 'CREATE INDEX ix_sessions_user_id ON public.sessions USING btree (user_id)', is_primary: false },
      { table_name: 'sessions', indexname: 'uq_sessions_token_hash', indexdef: 'CREATE UNIQUE INDEX uq_sessions_token_hash ON public.sessions USING btree (token_hash)', is_primary: false },
      primary('provider_connections'),
      { table_name: 'provider_connections', indexname: 'ix_provider_connections_user_id', indexdef: 'CREATE INDEX ix_provider_connections_user_id ON public.provider_connections USING btree (user_id)', is_primary: false },
      { table_name: 'provider_connections', indexname: 'uq_provider_connections_user_id_provider', indexdef: 'CREATE UNIQUE INDEX uq_provider_connections_user_id_provider ON public.provider_connections USING btree (user_id, provider)', is_primary: false },
      primary('github_connections'),
      { table_name: 'github_connections', indexname: 'ix_github_connections_user_id', indexdef: 'CREATE INDEX ix_github_connections_user_id ON public.github_connections USING btree (user_id)', is_primary: false },
      { table_name: 'github_connections', indexname: 'uq_github_connections_user_id', indexdef: 'CREATE UNIQUE INDEX uq_github_connections_user_id ON public.github_connections USING btree (user_id)', is_primary: false },
      primary('projects'),
      { table_name: 'projects', indexname: 'ix_projects_user_id_created_at', indexdef: 'CREATE INDEX ix_projects_user_id_created_at ON public.projects USING btree (user_id, created_at)', is_primary: false },
      { table_name: 'projects', indexname: 'uq_projects_user_id_slug', indexdef: 'CREATE UNIQUE INDEX uq_projects_user_id_slug ON public.projects USING btree (user_id, slug)', is_primary: false },
      { table_name: 'projects', indexname: 'ix_projects_user_id_sort_order', indexdef: 'CREATE INDEX ix_projects_user_id_sort_order ON public.projects USING btree (user_id, sort_order)', is_primary: false },
      primary('conversations'),
      { table_name: 'conversations', indexname: 'ix_conversations_project_id_updated_at', indexdef: 'CREATE INDEX ix_conversations_project_id_updated_at ON public.conversations USING btree (project_id, updated_at)', is_primary: false },
      { table_name: 'conversations', indexname: 'ix_conversations_user_id_updated_at', indexdef: 'CREATE INDEX ix_conversations_user_id_updated_at ON public.conversations USING btree (user_id, updated_at)', is_primary: false },
      { table_name: 'conversations', indexname: 'ix_conversations_user_id_pinned_order', indexdef: 'CREATE INDEX ix_conversations_user_id_pinned_order ON public.conversations USING btree (user_id, pinned_order)', is_primary: false },
      primary('messages'),
      { table_name: 'messages', indexname: 'ix_messages_conversation_id_created_at', indexdef: 'CREATE INDEX ix_messages_conversation_id_created_at ON public.messages USING btree (conversation_id, created_at)', is_primary: false },
      { table_name: 'messages', indexname: 'uq_messages_one_streaming_assistant', indexdef: "CREATE UNIQUE INDEX uq_messages_one_streaming_assistant ON public.messages USING btree (conversation_id) WHERE (((role)::text = 'assistant'::text) AND ((status)::text = 'streaming'::text))", is_primary: false },
      primary('agent_workspaces'),
      { table_name: 'agent_workspaces', indexname: 'uq_agent_workspaces_user_id', indexdef: 'CREATE UNIQUE INDEX uq_agent_workspaces_user_id ON public.agent_workspaces USING btree (user_id)', is_primary: false },
      primary('agent_runs'),
      { table_name: 'agent_runs', indexname: 'ix_agent_runs_status_lease_expires_at', indexdef: 'CREATE INDEX ix_agent_runs_status_lease_expires_at ON public.agent_runs USING btree (status, lease_expires_at)', is_primary: false },
      { table_name: 'agent_runs', indexname: 'ix_agent_runs_user_id_created_at', indexdef: 'CREATE INDEX ix_agent_runs_user_id_created_at ON public.agent_runs USING btree (user_id, created_at)', is_primary: false },
      { table_name: 'agent_runs', indexname: 'uq_agent_runs_turn_id', indexdef: 'CREATE UNIQUE INDEX uq_agent_runs_turn_id ON public.agent_runs USING btree (turn_id)', is_primary: false },
      primary('agent_events', 'sequence'),
      { table_name: 'agent_events', indexname: 'ix_agent_events_run_id_sequence', indexdef: 'CREATE INDEX ix_agent_events_run_id_sequence ON public.agent_events USING btree (run_id, sequence)', is_primary: false },
    ]
    expect(validateIndexContract(indexes)).toBe(true)
  })
})
