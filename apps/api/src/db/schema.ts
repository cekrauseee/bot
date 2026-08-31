import { sql } from 'drizzle-orm'
import {
  check,
  bigserial,
  bigint,
  customType,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  text,
  jsonb,
} from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    avatarUrl: varchar('avatar_url', { length: 2048 }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_users_email').on(table.email),
    check('ck_users_email_lowercase', sql`${table.email} = lower(${table.email})`),
  ],
)

export const oauthIdentities = pgTable(
  'oauth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    providerSubject: varchar('provider_subject', { length: 255 }).notNull(),
    providerEmail: varchar('provider_email', { length: 320 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'fk_oauth_identities_user_id_users',
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
    unique('uq_oauth_identities_provider_subject').on(table.provider, table.providerSubject),
    index('ix_oauth_identities_user_id').on(table.userId),
  ],
)

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    tokenHash: bytea('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'fk_sessions_user_id_users',
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
    unique('uq_sessions_token_hash').on(table.tokenHash),
    index('ix_sessions_user_id').on(table.userId),
    index('ix_sessions_expires_at_revoked_at').on(table.expiresAt, table.revokedAt),
  ],
)

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  workspacePath: text('workspace_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('uq_projects_user_id_slug').on(table.userId, table.slug),
  index('ix_projects_user_id_created_at').on(table.userId, table.createdAt),
])

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 120 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
}, (table) => [
  index('ix_conversations_user_id_updated_at').on(table.userId, table.updatedAt),
  index('ix_conversations_project_id_updated_at').on(table.projectId, table.updatedAt),
])

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull().default(''),
  reasoning: text('reasoning'),
  status: varchar('status', { length: 20 }).notNull(),
  errorMessage: text('error_message'),
  model: varchar('model', { length: 20 }),
  reasoningEffort: varchar('reasoning_effort', { length: 20 }),
  speed: varchar('speed', { length: 20 }),
  activities: jsonb('activities').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('ix_messages_conversation_id_created_at').on(table.conversationId, table.createdAt), uniqueIndex('uq_messages_one_streaming_assistant').on(table.conversationId).where(sql`${table.role} = 'assistant' AND ${table.status} = 'streaming'`)])

export const agentWorkspaces = pgTable('agent_workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  runtimeProvider: varchar('runtime_provider', { length: 40 }).notNull().default('unassigned'),
  runtimeState: jsonb('runtime_state').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique('uq_agent_workspaces_user_id').on(table.userId)])

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => agentWorkspaces.id, { onDelete: 'cascade' }),
  workingDirectory: text('working_directory').notNull().default('/workspace'),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  assistantMessageId: uuid('assistant_message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  turnId: uuid('turn_id').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('queued'),
  model: varchar('model', { length: 32 }).notNull(),
  provider: varchar('provider', { length: 20 }).notNull(),
  reasoningEffort: varchar('reasoning_effort', { length: 20 }).notNull(),
  speed: varchar('speed', { length: 20 }).notNull(),
  plan: jsonb('plan').notNull().default([]),
  pendingQuestion: jsonb('pending_question'),
  browserProjection: jsonb('browser_projection'),
  resumeInput: jsonb('resume_input'),
  reconciledCheckpointId: varchar('reconciled_checkpoint_id', { length: 200 }),
  executionToken: uuid('execution_token'),
  lastEventSequence: bigint('last_event_sequence', { mode: 'bigint' }),
  cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('uq_agent_runs_turn_id').on(table.turnId),
  unique('uq_agent_runs_assistant_message_id').on(table.assistantMessageId),
  index('ix_agent_runs_user_id_created_at').on(table.userId, table.createdAt),
  index('ix_agent_runs_status_lease_expires_at').on(table.status, table.leaseExpiresAt),
])

export const agentEvents = pgTable('agent_events', {
  sequence: bigserial('sequence', { mode: 'bigint' }).primaryKey(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  turnId: uuid('turn_id').notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  data: jsonb('data').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ix_agent_events_run_id_sequence').on(table.runId, table.sequence),
])

export const schema = {
  users,
  oauthIdentities,
  sessions,
  projects,
  conversations,
  messages,
  agentWorkspaces,
  agentRuns,
  agentEvents,
}
