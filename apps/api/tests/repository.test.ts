import { describe, expect, it } from 'vitest'
import { AuthRepository } from '../src/db/repository.js'
import { users } from '../src/db/schema.js'

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'person@example.com',
  firstName: null,
  lastName: null,
  avatarUrl: null,
  emailVerifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}
const identity = {
  id: '00000000-0000-0000-0000-000000000002',
  userId: user.id,
  provider: 'google',
  providerSubject: 'subject-1',
  providerEmail: 'person@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('AuthRepository Google identity updates', () => {
  it('updates only the authenticated Google provider subject email', async () => {
    const updatePredicates: unknown[] = []
    let selectCount = 0
    const db = {
      select: () => {
        const query = {
          from: () => query,
          where: async () => {
            selectCount += 1
            return selectCount === 1 ? [identity] : [user]
          },
        }
        return query
      },
      update: (table: unknown) => ({
        set: () => ({
          where: (predicate: unknown) => {
            updatePredicates.push(predicate)
            return table === users ? { returning: async () => [user] } : Promise.resolve([])
          },
        }),
      }),
    }

    await new AuthRepository(db as never).getOrCreateGoogleUser({
      providerSubject: identity.providerSubject,
      email: user.email,
      providerEmail: 'new@example.com',
    })

    expect(updatePredicates).toHaveLength(2)
    const oauthPredicate = updatePredicates[1]
    const serialized = JSON.stringify(oauthPredicate, (key, value) => {
      if (key === 'table' || key === 'encoder' || key === 'decoder') return undefined
      if (typeof value === 'function') return undefined
      return value
    })
    expect(serialized).toContain('provider_subject')
  })
})
