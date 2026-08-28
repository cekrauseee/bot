import { and, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { oauthIdentities, sessions, users } from './schema.js'
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
