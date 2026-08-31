import { randomUUID } from 'node:crypto'
import { and, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import {
  agentEvents,
  agentRuns,
  agentWorkspaces,
  conversations,
  messages,
  oauthIdentities,
  projects,
  sessions,
  users,
} from './schema.js'
import type { Db } from './database.js'

export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect & { user?: User }

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export class IdentityConflictError extends Error {}

const isUniqueViolation = (error: unknown, constraints: string[]) => {
  const candidate = error as { code?: unknown; constraint?: unknown }
  return candidate.code === '23505' &&
    (candidate.constraint == null || constraints.includes(String(candidate.constraint)))
}

export class AuthRepository {
  constructor(readonly db: Db) {}

  async findUserByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, normalizeEmail(email)))
    return user
  }

  async getOrCreateEmailUser(
    email: string,
    profile: Partial<Pick<User, 'firstName' | 'lastName' | 'avatarUrl' | 'emailVerifiedAt'>> = {},
  ) {
    const normalized = normalizeEmail(email)
    const existing = await this.findUserByEmail(normalized)
    if (existing) return this.updateVerifiedUser(existing, profile.emailVerifiedAt)

    try {
      const [created] = await this.db
        .insert(users)
        .values({ email: normalized, ...profile })
        .onConflictDoNothing({ target: users.email })
        .returning()
      if (created) return created
    } catch (error) {
      if (!isUniqueViolation(error, ['uq_users_email', 'users_email_key'])) throw error
    }

    const raced = await this.findUserByEmail(normalized)
    if (!raced) throw new Error('user insert conflicted without a matching email')
    return this.updateVerifiedUser(raced, profile.emailVerifiedAt)
  }

  private async updateVerifiedUser(user: User, verifiedAt: Date | null | undefined) {
    if (!verifiedAt || user.emailVerifiedAt) return user
    const [updated] = await this.db
      .update(users)
      .set({ emailVerifiedAt: verifiedAt, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning()
    return updated ?? user
  }

  async getOrCreateGoogleUser(input: {
    providerSubject: string
    email: string
    firstName?: string | null
    lastName?: string | null
    avatarUrl?: string | null
    providerEmail?: string | null
  }) {
    const identity = await this.findGoogleIdentity(input.providerSubject)
    if (identity) return this.updateGoogleUser(identity.userId, identity.providerSubject, input)

    const user = await this.getOrCreateEmailUser(input.email, {
      firstName: input.firstName,
      lastName: input.lastName,
      avatarUrl: input.avatarUrl,
      emailVerifiedAt: new Date(),
    })

    try {
      await this.db
        .insert(oauthIdentities)
        .values({
          userId: user.id,
          provider: 'google',
          providerSubject: input.providerSubject,
          providerEmail: input.providerEmail ? normalizeEmail(input.providerEmail) : null,
        })
        .onConflictDoNothing({ target: [oauthIdentities.provider, oauthIdentities.providerSubject] })
    } catch (error) {
      if (!isUniqueViolation(error, ['uq_oauth_identities_provider_subject', 'oauth_identities_provider_provider_subject_key'])) {
        throw error
      }
    }

    const linked = await this.findGoogleIdentity(input.providerSubject)
    if (!linked) throw new Error('OAuth identity insert conflicted without a matching identity')
    if (linked.userId !== user.id) throw new IdentityConflictError('OAuth identity is linked to another user')
    return this.updateGoogleUser(user.id, input.providerSubject, input)
  }

  private async findGoogleIdentity(providerSubject: string) {
    const [row] = await this.db
      .select()
      .from(oauthIdentities)
      .where(and(eq(oauthIdentities.provider, 'google'), eq(oauthIdentities.providerSubject, providerSubject)))
    return row
  }

  private async updateGoogleUser(userId: string, providerSubject: string, input: {
    firstName?: string | null
    lastName?: string | null
    avatarUrl?: string | null
    providerEmail?: string | null
  }) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId))
    if (!user) throw new IdentityConflictError('OAuth identity references a missing user')
    const [updated] = await this.db
      .update(users)
      .set({
        firstName: input.firstName ?? user.firstName,
        lastName: input.lastName ?? user.lastName,
        avatarUrl: input.avatarUrl ?? user.avatarUrl,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning()
    if ('providerEmail' in input && typeof input.providerEmail === 'string') {
      await this.db
        .update(oauthIdentities)
        .set({ providerEmail: normalizeEmail(input.providerEmail), updatedAt: new Date() })
        .where(and(
          eq(oauthIdentities.provider, 'google'),
          eq(oauthIdentities.providerSubject, providerSubject),
          eq(oauthIdentities.userId, user.id),
        ))
    }
    return updated ?? user
  }

  async createSession(userId: string, tokenHash: Buffer, expiresAt: Date) {
    const [session] = await this.db.insert(sessions).values({ userId, tokenHash, expiresAt }).returning()
    return session
  }

  async resolveActiveSession(tokenHash: Buffer) {
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    return row ? { ...row.session, user: row.user } : undefined
  }

  async touchSession(id: string) {
    const cutoff = new Date(Date.now() - 300_000)
    await this.db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), or(isNull(sessions.lastSeenAt), lte(sessions.lastSeenAt, cutoff))))
  }

  async revokeSession(id: string) {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
  }
}

export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type Project = typeof projects.$inferSelect

export class ConversationPinError extends Error {
  constructor(readonly code: 'invalid_reorder' | 'project_pinned') {
    super(code)
  }
}

export class ProjectOrderError extends Error {}

export class ProjectRepository {
  constructor(readonly db: Db) {}

  async list(userId: string) {
    return this.db.select().from(projects).where(eq(projects.userId, userId))
      .orderBy(sql`${projects.sortOrder} ASC NULLS FIRST`, sql`${projects.createdAt} DESC`, sql`${projects.id} DESC`)
  }

  async lockUser(userId: string) {
    const [user] = await this.db.select({ id: users.id }).from(users)
      .where(eq(users.id, userId)).for('update')
    return user
  }

  async get(userId: string, id: string) {
    const [project] = await this.db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    return project
  }

  async create(userId: string, name: string, slug: string) {
    const [project] = await this.db.insert(projects)
      .values({ userId, name, slug })
      .onConflictDoNothing({ target: [projects.userId, projects.slug] })
      .returning()
    return project
  }

  async rename(userId: string, id: string, name: string, slug: string) {
    const [project] = await this.db.update(projects)
      .set({ name, slug, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning()
    return project
  }

  async delete(userId: string, id: string) {
    const [project] = await this.db.delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning()
    return project
  }

  async reorder(userId: string, ids: string[]) {
    const rows = await this.db.select().from(projects)
      .where(eq(projects.userId, userId)).for('update')
    const expected = new Set(rows.map((row) => row.id))
    const requested = new Set(ids)
    if (ids.length !== requested.size || ids.length !== expected.size || ids.some((id) => !expected.has(id))) {
      throw new ProjectOrderError('invalid_order')
    }
    const byId = new Map(rows.map((row) => [row.id, row]))
    const now = Date.now()
    const ordered: Project[] = []
    for (const [index, id] of ids.entries()) {
      const current = byId.get(id)!
      const orderUpdatedAt = new Date(Math.max(now, current.orderUpdatedAt ? current.orderUpdatedAt.getTime() + 1 : 0))
      const [row] = await this.db.update(projects).set({ sortOrder: index, orderUpdatedAt })
        .where(eq(projects.id, id)).returning()
      ordered.push(row)
    }
    return ordered
  }
}

export class ConversationRepository {
  constructor(readonly db: Db) {}

  async list(userId: string) {
    return this.db.select().from(conversations).where(eq(conversations.userId, userId))
      .orderBy(sql`${conversations.updatedAt} DESC`)
  }
  async get(userId: string, id: string) {
    const [conversation] = await this.db.select().from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    if (!conversation) return undefined
    const rows = await this.db.select().from(messages).where(eq(messages.conversationId, id))
      .orderBy(sql`${messages.createdAt} ASC`, sql`${messages.id} ASC`)
    return { ...conversation, messages: rows }
  }

  async lockOwned(userId: string, id: string) {
    const [conversation] = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .for('update')
    return conversation
  }
  async lockUser(userId: string) {
    const [user] = await this.db.select({ id: users.id }).from(users)
      .where(eq(users.id, userId)).for('update')
    return user
  }
  async create(userId: string, title: string) {
    const [row] = await this.db.insert(conversations).values({ userId, title }).returning()
    return row
  }
  async delete(userId: string, id: string) {
    const [row] = await this.db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId))).returning()
    return row
  }
  async pin(userId: string, id: string, pinned: boolean) {
    const conversation = await this.lockOwned(userId, id)
    if (!conversation) return undefined
    if ((conversation.pinnedOrder !== null) === pinned) return conversation

    const changedAt = new Date(Math.max(
      Date.now(),
      conversation.pinUpdatedAt ? conversation.pinUpdatedAt.getTime() + 1 : 0,
    ))
    if (!pinned) {
      const [row] = await this.db.update(conversations)
        .set({ pinnedOrder: null, pinUpdatedAt: changedAt })
        .where(eq(conversations.id, id)).returning()
      return row
    }
    const [max] = await this.db.select({ value: sql<number>`coalesce(max(${conversations.pinnedOrder}), 0)` })
      .from(conversations)
      .where(and(eq(conversations.userId, userId), sql`${conversations.pinnedOrder} is not null`))
    const [row] = await this.db.update(conversations)
      .set({ pinnedOrder: Number(max?.value ?? 0) + 1, pinUpdatedAt: changedAt })
      .where(eq(conversations.id, id)).returning()
    return row
  }
  async reorderPins(userId: string, ids: string[]) {
    const rows = await this.db.select().from(conversations)
      .where(and(eq(conversations.userId, userId), sql`${conversations.pinnedOrder} is not null`)).for('update')
    const expected = new Set(rows.map((row) => row.id))
    const requested = new Set(ids)
    if (ids.length !== requested.size || ids.length !== expected.size ||
      ids.some((id) => !expected.has(id))) {
      throw new ConversationPinError('invalid_reorder')
    }
    const byId = new Map(rows.map((row) => [row.id, row]))
    const now = Date.now()
    const changed: Conversation[] = []
    for (const [index, id] of ids.entries()) {
      const current = byId.get(id)!
      const changedAt = new Date(Math.max(now, current.pinUpdatedAt ? current.pinUpdatedAt.getTime() + 1 : 0))
      const [row] = await this.db.update(conversations)
        .set({ pinnedOrder: index + 1, pinUpdatedAt: changedAt })
        .where(eq(conversations.id, id)).returning()
      changed.push(row)
    }
    return changed
  }
  async assignProject(userId: string, id: string, projectId: string | null) {
    const current = await this.lockOwned(userId, id)
    if (!current) return undefined
    if (current.pinnedOrder !== null) {
      throw new ConversationPinError('project_pinned')
    }
    const [row] = await this.db.update(conversations)
      .set({ projectId })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning()
    return row
  }
  async rename(userId: string, id: string, title: string) {
    const current = await this.lockOwned(userId, id)
    if (!current) return undefined
    if (current.title === title) return current
    const titleUpdatedAt = new Date(Math.max(
      Date.now(), current.titleUpdatedAt ? current.titleUpdatedAt.getTime() + 1 : 0,
    ))
    const [row] = await this.db.update(conversations)
      .set({ title, titleUpdatedAt })
      .where(eq(conversations.id, id)).returning()
    return row
  }
  async active(id: string) {
    const [row] = await this.db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.conversationId, id), eq(messages.role, 'assistant'), eq(messages.status, 'streaming')))
    if (row) return row
    const [run] = await this.db.select({ id: agentRuns.id }).from(agentRuns).where(and(
      eq(agentRuns.conversationId, id),
      inArray(agentRuns.status, ['queued', 'running', 'waiting', 'cancelling']),
    ))
    return run
  }
  async addTurn(conversationId: string, userContent: string, options: { model: string; reasoningEffort: string; speed: string }) {
    const active = await this.active(conversationId)
    if (active) throw new Error('conversation_active')
    const now = new Date()
    const [latest] = await this.db.select({ createdAt: messages.createdAt }).from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(sql`${messages.createdAt} DESC`, sql`${messages.id} DESC`)
      .limit(1)
    const createdAt = latest && latest.createdAt >= now
      ? new Date(latest.createdAt.getTime() + 1)
      : now
    const [user] = await this.db.insert(messages).values({
      conversationId,
      role: 'user',
      content: userContent,
      status: 'completed',
      createdAt,
      updatedAt: createdAt,
    }).returning()
    const assistantCreatedAt = new Date(createdAt.getTime() + 1)
    const [assistant] = await this.db.insert(messages).values({
      conversationId,
      role: 'assistant',
      status: 'streaming',
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      speed: options.speed,
      createdAt: assistantCreatedAt,
      updatedAt: assistantCreatedAt,
    }).returning()
    const [conversation] = await this.db
      .update(conversations)
      .set({ updatedAt: createdAt })
      .where(eq(conversations.id, conversationId))
      .returning()
    return { conversation, user, assistant }
  }
  async updateAssistant(id: string, patch: Partial<Pick<Message, 'content' | 'reasoning' | 'status' | 'errorMessage' | 'activities'>>) {
    const [row] = await this.db.update(messages).set({ ...patch, updatedAt: new Date() }).where(eq(messages.id, id)).returning()
    if (row) {
      await this.db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, row.conversationId))
    }
    return row
  }
  /** Caller holds the owning conversation lock. Retry only its latest failed reply. */
  async retryTurn(conversationId: string, assistantId: string, userContent: string, options: { model: string; reasoningEffort: string; speed: string }) {
    if (await this.active(conversationId)) throw new Error('conversation_active')
    const [previous, user] = await this.db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(sql`${messages.createdAt} DESC`, sql`${messages.id} DESC`).limit(2)
    if (previous?.id !== assistantId || previous.role !== 'assistant' ||
      previous.status !== 'failed' || user?.role !== 'user' || user.content !== userContent) {
      throw new Error('retry_unavailable')
    }
    const now = new Date()
    const [assistant] = await this.db.update(messages).set({
      content: '', reasoning: null, activities: [], errorMessage: null,
      status: 'streaming', model: options.model, reasoningEffort: options.reasoningEffort,
      speed: options.speed, createdAt: now, updatedAt: now,
    }).where(eq(messages.id, assistantId)).returning()
    const [conversation] = await this.db.update(conversations).set({ updatedAt: now })
      .where(eq(conversations.id, conversationId)).returning()
    return { user, assistant, conversation }
  }
  async transcript(id: string) {
    return this.db.select({ role: messages.role, content: messages.content }).from(messages)
      .where(and(
        eq(messages.conversationId, id),
        sql`${messages.content} <> ''`,
        or(eq(messages.role, 'user'), eq(messages.status, 'completed')),
      ))
      .orderBy(sql`${messages.createdAt} ASC`, sql`${messages.id} ASC`)
  }
}

export type AgentWorkspace = typeof agentWorkspaces.$inferSelect
export type AgentRun = typeof agentRuns.$inferSelect
export type AgentEvent = typeof agentEvents.$inferSelect
export type AgentRunStatus = AgentRun['status']
export type ResumeAnswer = string | string[]

export class AgentRunLeaseLostError extends Error {
  constructor() {
    super('agent_run_lease_lost')
    this.name = 'AgentRunLeaseLostError'
  }
}

export type CreateAgentRun = {
  id: string
  turnId: string
  userId: string
  conversationId: string
  assistantMessageId: string
  model: string
  provider: string
  reasoningEffort: string
  speed: string
}

export class AgentRunRepository {
  constructor(readonly db: Db) {}

  async workspaceFor(userId: string) {
    const [workspace] = await this.db.insert(agentWorkspaces)
      .values({ userId })
      .onConflictDoNothing({ target: agentWorkspaces.userId })
      .returning()
    if (workspace) return workspace
    const [existing] = await this.db.select().from(agentWorkspaces)
      .where(eq(agentWorkspaces.userId, userId))
    if (!existing) throw new Error('workspace_create_failed')
    return existing
  }

  async create(input: CreateAgentRun) {
    const workspace = await this.workspaceFor(input.userId)
    const plan = await this.taskPlanFor(input.userId, input.conversationId)
    const [run] = await this.db.insert(agentRuns).values({
      ...input,
      workspaceId: workspace.id,
      plan,
      status: 'queued',
    }).returning()
    return run
  }

  async taskPlanFor(userId: string, conversationId: string) {
    const [run] = await this.db.select({ plan: agentRuns.plan }).from(agentRuns).where(and(
      eq(agentRuns.userId, userId),
      eq(agentRuns.conversationId, conversationId),
      sql`${agentRuns.plan} <> '[]'::jsonb`,
    )).orderBy(sql`${agentRuns.createdAt} DESC`, sql`${agentRuns.id} DESC`).limit(1)
    return Array.isArray(run?.plan) ? run.plan : []
  }

  async get(id: string) {
    const [run] = await this.db.select().from(agentRuns).where(eq(agentRuns.id, id))
    return run
  }

  async getOwned(userId: string, id: string) {
    const [run] = await this.db.select().from(agentRuns)
      .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)))
    return run
  }

  async lockOwned(userId: string, id: string) {
    const [run] = await this.db.select().from(agentRuns)
      .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)))
      .for('update')
    return run
  }

  async activeForConversation(conversationId: string) {
    const [run] = await this.db.select().from(agentRuns).where(and(
      eq(agentRuns.conversationId, conversationId),
      inArray(agentRuns.status, ['queued', 'running', 'waiting', 'cancelling']),
    ))
    return run
  }

  async claim(id: string, leaseMilliseconds = 60_000) {
    const now = new Date()
    const [run] = await this.db.update(agentRuns).set({
      status: 'running',
      executionToken: randomUUID(),
      leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds),
      startedAt: sql`coalesce(${agentRuns.startedAt}, ${now})`,
      updatedAt: now,
    }).where(and(
      eq(agentRuns.id, id),
      isNull(agentRuns.cancelRequestedAt),
      or(
        eq(agentRuns.status, 'queued'),
        and(eq(agentRuns.status, 'running'), lte(agentRuns.leaseExpiresAt, now)),
      ),
    )).returning()
    return run
  }

  async claimCancellation(id: string, leaseMilliseconds = 60_000) {
    const now = new Date()
    const [run] = await this.db.update(agentRuns).set({
      status: 'running',
      executionToken: randomUUID(),
      leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds),
      startedAt: sql`coalesce(${agentRuns.startedAt}, ${now})`,
      updatedAt: now,
    }).where(and(
      eq(agentRuns.id, id),
      isNotNull(agentRuns.cancelRequestedAt),
      or(
        eq(agentRuns.status, 'cancelling'),
        and(eq(agentRuns.status, 'running'), lte(agentRuns.leaseExpiresAt, now)),
      ),
    )).returning()
    return run
  }

  async renewLease(id: string, executionToken: string, leaseMilliseconds = 60_000) {
    const now = new Date()
    const [run] = await this.db.update(agentRuns).set({
      leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds),
      updatedAt: now,
    }).where(and(
      eq(agentRuns.id, id),
      eq(agentRuns.executionToken, executionToken),
      eq(agentRuns.status, 'running'),
    )).returning()
    return run
  }

  private async lockExecution(run: AgentRun) {
    if (!run.executionToken) throw new AgentRunLeaseLostError()
    const [owned] = await this.db.select({ id: agentRuns.id }).from(agentRuns).where(and(
      eq(agentRuns.id, run.id),
      eq(agentRuns.executionToken, run.executionToken),
      eq(agentRuns.status, 'running'),
    )).for('update')
    if (!owned) throw new AgentRunLeaseLostError()
  }

  async appendEvent(
    run: AgentRun,
    type: string,
    data: Record<string, unknown>,
    patch: Partial<Pick<AgentRun,
      'status' | 'plan' | 'pendingQuestion' | 'browserProjection' | 'resumeInput' |
      'reconciledCheckpointId' | 'leaseExpiresAt' | 'completedAt'>> = {},
  ) {
    await this.lockExecution(run)
    const [event] = await this.db.insert(agentEvents).values({
      runId: run.id,
      turnId: run.turnId,
      type,
      data,
    }).returning()
    if (!event) throw new Error('event_persist_failed')
    const [updated] = await this.db.update(agentRuns).set({
      ...patch,
      lastEventSequence: event.sequence,
      updatedAt: new Date(),
    }).where(and(
      eq(agentRuns.id, run.id),
      eq(agentRuns.executionToken, run.executionToken!),
      eq(agentRuns.status, 'running'),
    )).returning({ id: agentRuns.id })
    if (!updated) throw new AgentRunLeaseLostError()
    return event
  }

  async replayHighWater(runId: string) {
    const [row] = await this.db.select({
      sequence: sql<string | null>`max(${agentEvents.sequence})`,
    }).from(agentEvents).where(eq(agentEvents.runId, runId))
    return row?.sequence == null ? 0n : BigInt(row.sequence)
  }

  async replayPage(runId: string, afterSequence: bigint, throughSequence: bigint, limit = 1_000) {
    const rows = await this.db.select().from(agentEvents).where(and(
      eq(agentEvents.runId, runId),
      gt(agentEvents.sequence, afterSequence),
      lte(agentEvents.sequence, throughSequence),
    )).orderBy(agentEvents.sequence).limit(limit + 1)
    return {
      events: rows.slice(0, limit),
      hasMore: rows.length > limit,
    }
  }

  async replay(runId: string, afterSequence = 0n, limit = 1_000) {
    const highWater = await this.replayHighWater(runId)
    return (await this.replayPage(runId, afterSequence, highWater, limit)).events
  }

  async recoverable(limit = 100) {
    const now = new Date()
    return this.db.select().from(agentRuns).where(or(
      eq(agentRuns.status, 'queued'),
      eq(agentRuns.status, 'cancelling'),
      and(eq(agentRuns.status, 'running'), lte(agentRuns.leaseExpiresAt, now)),
    )).orderBy(agentRuns.createdAt, agentRuns.id).limit(limit)
  }

  async requestCancellation(userId: string, id: string) {
    const now = new Date()
    const [run] = await this.db.update(agentRuns).set({
      status: 'cancelling',
      cancelRequestedAt: now,
      executionToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    }).where(and(
      eq(agentRuns.id, id),
      eq(agentRuns.userId, userId),
      inArray(agentRuns.status, ['queued', 'running', 'waiting']),
    )).returning()
    return run
  }

  async queueResume(userId: string, id: string, questionId: string, answer: ResumeAnswer) {
    const run = await this.lockOwned(userId, id)
    if (!run) return undefined
    const prior = run.resumeInput as { question_id?: unknown; answer?: unknown } | null
    const repeatedAnswer = typeof answer === 'string'
      ? prior?.answer === answer
      : Array.isArray(prior?.answer) && prior.answer.length === answer.length &&
        prior.answer.every((value, index) => value === answer[index])
    if (prior?.question_id === questionId && repeatedAnswer) return run
    if (run.status !== 'waiting') return undefined
    const question = run.pendingQuestion as { question_id?: unknown; id?: unknown } | null
    if ((question?.question_id ?? question?.id) !== questionId) return undefined
    const now = new Date()
    const transcriptAnswer = typeof answer === 'string'
      ? answer
      : answer.map((value) => `- ${value}`).join('\n')
    await this.db.insert(messages).values({
      conversationId: run.conversationId,
      role: 'user',
      content: transcriptAnswer,
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    })
    await this.db.update(messages).set({ status: 'streaming', updatedAt: now })
      .where(eq(messages.id, run.assistantMessageId))
    const [queued] = await this.db.update(agentRuns).set({
      status: 'queued',
      pendingQuestion: null,
      resumeInput: { question_id: questionId, answer },
      executionToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    }).where(and(eq(agentRuns.id, id), eq(agentRuns.status, 'waiting'))).returning()
    return queued
  }

  async setAssistant(run: AgentRun, patch: Partial<Pick<Message,
    'content' | 'reasoning' | 'status' | 'errorMessage' | 'activities'>>) {
    await this.lockExecution(run)
    const [message] = await this.db.update(messages).set({ ...patch, updatedAt: new Date() })
      .where(and(
        eq(messages.id, run.assistantMessageId),
        sql`exists (
          select 1 from ${agentRuns}
          where ${agentRuns.id} = ${run.id}
            and ${agentRuns.executionToken} = ${run.executionToken!}
            and ${agentRuns.status} = 'running'
        )`,
      )).returning()
    if (!message) throw new AgentRunLeaseLostError()
    if (message) {
      await this.db.update(conversations).set({ updatedAt: new Date() })
        .where(eq(conversations.id, run.conversationId))
    }
    return message
  }

  async assistant(run: AgentRun) {
    const [message] = await this.db.select().from(messages)
      .where(eq(messages.id, run.assistantMessageId))
    return message
  }

  async transcript(run: AgentRun) {
    return this.db.select({ role: messages.role, content: messages.content }).from(messages)
      .where(and(
        eq(messages.conversationId, run.conversationId),
        sql`${messages.content} <> ''`,
        or(eq(messages.role, 'user'), eq(messages.id, run.assistantMessageId), eq(messages.status, 'completed')),
      ))
      .orderBy(messages.createdAt, messages.id)
  }
}
