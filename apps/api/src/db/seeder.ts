import { createHash } from 'node:crypto'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { AuthRepository, normalizeEmail, type User } from './repository.js'
import { conversations, messages, sessions, users } from './schema.js'
import { seedConversations, seedMessageCount } from './seed-data.js'
import type { Db } from './database.js'

const DEMO_EMAIL = 'demo@mybot.local'

export type SeedTarget = 'active-session' | 'explicit-email' | 'only-user' | 'demo-user'

export type SeedResult = {
  userId: string
  target: SeedTarget
  conversationIds: Record<string, string>
  conversationCount: number
  messageCount: number
}

export function seedUuid(...parts: string[]) {
  const bytes = createHash('sha256').update(parts.join('\0')).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const validEmail = (value: string) =>
  value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

async function emailUser(db: Db, rawEmail: string, target: SeedTarget) {
  const email = normalizeEmail(rawEmail)
  if (!validEmail(email)) throw new Error('Seed user email must be a valid email address')
  const repository = new AuthRepository(db)
  const user = await repository.getOrCreateEmailUser(email, {
    ...(email === DEMO_EMAIL ? { firstName: 'Alex', lastName: 'Morgan' } : {}),
    emailVerifiedAt: new Date(),
  })
  return { user, target }
}

async function resolveSeedUser(db: Db, explicitEmail?: string): Promise<{
  user: User
  target: SeedTarget
}> {
  if (explicitEmail?.trim()) return emailUser(db, explicitEmail, 'explicit-email')

  const [active] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sql`coalesce(${sessions.lastSeenAt}, ${sessions.createdAt})`))
    .limit(1)
  if (active) return { user: active.user, target: 'active-session' }

  const existingUsers = await db.select().from(users).orderBy(desc(users.updatedAt)).limit(2)
  if (existingUsers.length === 1) return { user: existingUsers[0], target: 'only-user' }
  return emailUser(db, DEMO_EMAIL, 'demo-user')
}

const timestamp = (
  now: Date,
  daysAgo: number,
  minuteOffset: number,
  lastMinuteOffset: number,
) => {
  const value = new Date(now)
  value.setDate(value.getDate() - daysAgo)
  value.setMinutes(value.getMinutes() - (lastMinuteOffset - minuteOffset))
  return value
}

export async function seedApplication(
  db: Db,
  options: { email?: string; now?: Date } = {},
): Promise<SeedResult> {
  const now = options.now ?? new Date()
  if (Number.isNaN(now.getTime())) throw new Error('Seed date must be valid')
  const { user, target } = await resolveSeedUser(db, options.email)
  const conversationIds: Record<string, string> = {}

  for (const fixture of seedConversations) {
    const conversationId = seedUuid('mybot-seed-v1', user.id, 'conversation', fixture.key)
    conversationIds[fixture.key] = conversationId
    const lastMinuteOffset = fixture.messages.at(-1)!.minuteOffset
    const firstMessageAt = timestamp(
      now,
      fixture.daysAgo,
      fixture.messages[0].minuteOffset,
      lastMinuteOffset,
    )
    const lastMessageAt = timestamp(now, fixture.daysAgo, lastMinuteOffset, lastMinuteOffset)

    await db.insert(conversations).values({
      id: conversationId,
      userId: user.id,
      title: fixture.title,
      createdAt: new Date(firstMessageAt.getTime() - 60_000),
      updatedAt: lastMessageAt,
    }).onConflictDoUpdate({
      target: conversations.id,
      set: { title: fixture.title },
    })

    for (const fixtureMessage of fixture.messages) {
      const messageId = seedUuid(
        'mybot-seed-v1',
        user.id,
        'message',
        fixture.key,
        fixtureMessage.key,
      )
      const messageAt = timestamp(
        now,
        fixture.daysAgo,
        fixtureMessage.minuteOffset,
        lastMinuteOffset,
      )
      const assistant = fixtureMessage.role === 'assistant'
      const values = {
        id: messageId,
        conversationId,
        role: fixtureMessage.role,
        content: fixtureMessage.content,
        reasoning: fixtureMessage.reasoning ?? null,
        status: 'completed',
        errorMessage: null,
        model: assistant ? fixtureMessage.model ?? 'gpt-5.6-sol' : null,
        reasoningEffort: assistant ? fixtureMessage.reasoningEffort ?? 'medium' : null,
        speed: assistant ? fixtureMessage.speed ?? 'standard' : null,
        activities: fixtureMessage.activities ?? [],
        createdAt: messageAt,
        updatedAt: messageAt,
      }
      await db.insert(messages).values(values).onConflictDoUpdate({
        target: messages.id,
        set: {
          content: values.content,
          reasoning: values.reasoning,
          status: values.status,
          errorMessage: values.errorMessage,
          model: values.model,
          reasoningEffort: values.reasoningEffort,
          speed: values.speed,
          activities: values.activities,
        },
      })
    }
  }

  return {
    userId: user.id,
    target,
    conversationIds,
    conversationCount: seedConversations.length,
    messageCount: seedMessageCount,
  }
}
