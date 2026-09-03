import { describe, expect, it } from 'vitest'
import { DesktopAuthService } from '../src/modules/auth/desktop.js'

function fakeRedis() {
  const records = new Map<string, Record<string, string>>()
  return {
    records,
    async hset(key: string, ...values: string[]) {
      const record = records.get(key) ?? {}
      for (let i = 0; i < values.length; i += 2) record[values[i]] = values[i + 1]
      records.set(key, record)
    },
    async expire() {},
    async hgetall(key: string) { return records.get(key) ?? {} },
    async eval(_script: string, _count: number, key: string, ...args: string[]) {
      const record = records.get(key)
      if (!record) return 0
      if (args.length === 1) {
        if (record.status === 'approved' && record.user_id === args[0]) return 1
        if (record.status !== 'pending') return 0
        record.status = 'approved'; record.user_id = args[0]; return 1
      }
      if (record.status !== 'approved') return false
      const token = record.user_id
      records.delete(key)
      return token
    },
  }
}

const settings = { webBaseUrl: 'https://web.example.test', sessionTtlSeconds: 3600 } as never

describe('DesktopAuthService', () => {
  it('keeps the high entropy secret out of the verification URL and exchanges once', async () => {
    const redis = fakeRedis()
    const service = new DesktopAuthService(redis as never, settings)
    const transaction = await service.start()
    expect(transaction.verificationUrl).toContain('desktop_transaction=')
    expect(transaction.verificationUrl).not.toContain(transaction.clientSecret)
    const completion = await service.complete(transaction.transactionId, 'user_123')
    expect(completion.callbackUrl).toBe(`mybot://auth/callback?transaction_id=${transaction.transactionId}`)
    await expect(service.complete(transaction.transactionId, 'user_123')).resolves.toEqual(completion)
    await expect(service.complete(transaction.transactionId, 'another_user')).rejects.toMatchObject({
      code: 'invalid_desktop_transaction',
    })
    const record = [...redis.records.values()][0]
    expect(record).toMatchObject({ status: 'approved', user_id: 'user_123' })
    expect(record).not.toHaveProperty('session_token')
    expect(await service.exchange(transaction.transactionId, 'wrong-secret')).toBeUndefined()
    expect(await service.exchange(transaction.transactionId, transaction.clientSecret)).toBe('user_123')
    expect(await service.exchange(transaction.transactionId, transaction.clientSecret)).toBeUndefined()
  })
})
