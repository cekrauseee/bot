import { describe, expect, it, vi } from 'vitest'
import { decryptGithubToken, encryptGithubToken, GithubConnectionService } from '../src/modules/github-connection.js'

describe('GitHub connection security', () => {
  it('encrypts tokens with authenticated AES-GCM envelopes', () => {
    const key = Buffer.alloc(32, 3)
    const encrypted = encryptGithubToken('gho_secret_value', key)
    expect(encrypted).not.toContain('gho_secret_value')
    expect(decryptGithubToken(encrypted, key)).toBe('gho_secret_value')
    expect(() => decryptGithubToken(encrypted, Buffer.alloc(32, 4))).toThrow()
  })

  it('reports unavailable without GitHub OAuth and encryption configuration', async () => {
    const service = new GithubConnectionService({} as never, {} as never, {
      githubClientId: '', githubClientSecret: '', githubTokenEncryptionKey: null,
    } as never)
    await expect(service.connection('00000000-0000-4000-8000-000000000001')).resolves.toMatchObject({
      status: 'unavailable', loginMode: 'browser',
    })
  })

  it('treats an expired or missing login state as failed', async () => {
    const service = new GithubConnectionService(
      { transaction: vi.fn().mockResolvedValue(undefined) } as never,
      { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(0) } as never,
      { githubClientId: 'client', githubClientSecret: 'secret', githubTokenEncryptionKey: Buffer.alloc(32) } as never,
    )
    await expect(service.loginStatus('00000000-0000-4000-8000-000000000001', 'expired'))
      .resolves.toEqual({ status: 'failed', message: 'Unable to connect the GitHub account. Try again.' })
  })

  it('accepts a system-browser callback without relying on a renderer cookie', async () => {
    const values = new Map<string, string>()
    const redis = {
      set: vi.fn(async (key: string, value: string) => { values.set(key, value); return 'OK' }),
      getdel: vi.fn(async (key: string) => values.get(key) ?? null),
      del: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      exists: vi.fn().mockResolvedValue(0),
    }
    const service = new GithubConnectionService(
      { transaction: vi.fn().mockResolvedValue(undefined) } as never,
      redis as never,
      {
        githubClientId: 'client', githubClientSecret: 'secret',
        githubRedirectUri: 'http://localhost:8000/auth/github/callback',
        githubTokenEncryptionKey: Buffer.alloc(32),
      } as never,
    )
    const login = await service.startLogin('00000000-0000-0000-0000-000000000001')
    expect(new URL(login.authUrl).searchParams.get('scope')).toBe('repo')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'github-access' }), { status: 200 }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1, login: 'octocat', email: 'octo@example.com' }), { status: 200 }),
    )
    try {
      await expect(service.completeCallback({ state: login.type === 'browser' ? login.state : undefined, code: 'oauth-code' }))
        .resolves.toBe('' + login.loginId)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      fetchMock.mockRestore()
    }
  })
})
