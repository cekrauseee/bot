import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CodexAppServerManager } from '../src/modules/codex-app-server.js'

type RpcRequest = {
  id?: number
  method?: string
  params?: Record<string, unknown>
}

class FakeCodexProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  exitCode: number | null = null
  account: { type: 'chatgpt'; email: string; planType: string } | null = null
  loginMode: 'browser' | 'device' = 'device'
  readonly requests: RpcRequest[] = []
  private buffer = ''

  constructor() {
    super()
    this.stdin.on('data', (chunk) => {
      this.buffer += chunk.toString()
      let newline = this.buffer.indexOf('\n')
      while (newline >= 0) {
        const line = this.buffer.slice(0, newline)
        this.buffer = this.buffer.slice(newline + 1)
        this.handle(JSON.parse(line) as RpcRequest)
        newline = this.buffer.indexOf('\n')
      }
    })
  }

  kill = vi.fn((signal?: NodeJS.Signals | number) => {
    this.exitCode = signal === 'SIGKILL' ? 137 : 0
    queueMicrotask(() => this.emit('exit', this.exitCode, signal))
    return true
  })

  completeLogin(loginId: string, success = true) {
    if (success)
      this.account = {
        type: 'chatgpt',
        email: 'person@example.com',
        planType: 'plus',
      }
    this.notify('account/login/completed', {
      loginId,
      success,
      error: success ? null : 'private provider error',
    })
  }

  private handle(request: RpcRequest) {
    this.requests.push(request)
    if (request.id === undefined) return
    if (request.method === 'initialize') return this.respond(request.id, {})
    if (request.method === 'account/read') {
      return this.respond(request.id, {
        account: this.account,
        requiresOpenaiAuth: true,
      })
    }
    if (request.method === 'account/login/start') {
      return this.respond(request.id, {
        type: this.loginMode === 'browser' ? 'chatgpt' : 'chatgptDeviceCode',
        loginId: 'login-1',
        authUrl: 'https://auth.openai.com/codex/login',
        verificationUrl: 'https://auth.openai.com/codex/device',
        userCode: 'ABCD-1234',
      })
    }
    if (request.method === 'account/rateLimits/read') {
      return this.respond(request.id, {
        rateLimits: {
          primary: {
            usedPercent: 25,
            windowDurationMins: 300,
            resetsAt: 1_900_000_000,
          },
          secondary: null,
          rateLimitReachedType: null,
        },
      })
    }
    if (request.method === 'account/logout') {
      this.account = null
      return this.respond(request.id, {})
    }
    if (request.method === 'account/login/cancel')
      return this.respond(request.id, {})
    this.stdout.write(
      `${JSON.stringify({ id: request.id, error: { message: 'private provider response' } })}\n`,
    )
  }

  private respond(id: number, result: unknown) {
    this.stdout.write(`${JSON.stringify({ id, result })}\n`)
  }

  private notify(method: string, params: unknown) {
    this.stdout.write(`${JSON.stringify({ method, params })}\n`)
  }
}

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function fixture(loginMode: 'browser' | 'device' = 'device') {
  const root = await mkdtemp(join(tmpdir(), 'my-bot-codex-test-'))
  roots.push(root)
  const processes: FakeCodexProcess[] = []
  const spawns: Array<{
    command: string
    args: readonly string[]
    env: NodeJS.ProcessEnv
  }> = []
  const manager = new CodexAppServerManager({
    binary: 'codex-test',
    homeRoot: root,
    identityKey: 'identity-key-that-is-long-enough',
    requestTimeoutMs: 1_000,
    idleTimeoutMs: 60_000,
    loginMode,
    spawnCodex: (command, args, options) => {
      const process = new FakeCodexProcess()
      process.loginMode = loginMode
      processes.push(process)
      spawns.push({ command, args, env: options.env })
      return process as never
    },
  })
  return { manager, processes, spawns }
}

describe('Codex app-server connection manager', () => {
  it('runs an isolated device-code flow and projects only safe account limits', async () => {
    const { manager, processes, spawns } = await fixture()

    await expect(manager.connection('user-one')).resolves.toEqual({
      status: 'disconnected',
      loginMode: 'device',
      account: null,
      limits: null,
    })
    const login = await manager.startLogin('user-one')
    expect(login).toEqual({
      type: 'device_code',
      loginId: 'login-1',
      verificationUrl: 'https://auth.openai.com/codex/device',
      userCode: 'ABCD-1234',
    })
    await expect(
      manager.loginStatus('user-one', login.loginId),
    ).resolves.toEqual({ status: 'pending' })

    processes[0].completeLogin(login.loginId)
    await expect(
      manager.loginStatus('user-one', login.loginId),
    ).resolves.toMatchObject({
      status: 'connected',
      connection: {
        account: { email: 'person@example.com', planType: 'plus' },
        limits: {
          primary: { usedPercent: 25, windowDurationMinutes: 300 },
          reached: false,
        },
      },
    })

    expect(spawns[0]).toMatchObject({ command: 'codex-test' })
    expect(spawns[0].args).toContain('cli_auth_credentials_store="file"')
    expect(spawns[0].env.CODEX_HOME).not.toContain('user-one')
    expect(spawns[0].env).not.toHaveProperty('OPENAI_API_KEY')
    expect(processes[0].requests.map(({ method }) => method)).toContain(
      'initialized',
    )
    await manager.close()
  })

  it('isolates pending logins by user and clears the Codex session on disconnect', async () => {
    const { manager, processes } = await fixture()
    const login = await manager.startLogin('user-one')

    await expect(
      manager.loginStatus('user-two', login.loginId),
    ).rejects.toMatchObject({
      code: 'codex_login_not_found',
      status: 404,
    })

    processes[0].completeLogin(login.loginId)
    await manager.loginStatus('user-one', login.loginId)
    await manager.disconnect('user-one')
    expect(processes[0].requests.map(({ method }) => method)).toContain(
      'account/logout',
    )
    await manager.close()
  })

  it('uses fixed public errors for connection conflicts', async () => {
    const { manager, processes } = await fixture()
    const login = await manager.startLogin('user-one')
    processes[0].completeLogin(login.loginId)
    await manager.loginStatus('user-one', login.loginId)

    await expect(manager.startLogin('user-one')).rejects.toMatchObject({
      code: 'codex_already_connected',
      message: 'An OpenAI account is already connected.',
    })
    await manager.close()
  })

  it('supports browser login and owned cancellation', async () => {
    const { manager, processes } = await fixture('browser')
    const login = await manager.startLogin('user-one')
    expect(login).toEqual({
      type: 'browser',
      loginId: 'login-1',
      authUrl: 'https://auth.openai.com/codex/login',
    })
    await manager.cancelLogin('user-one', login.loginId)
    expect(
      processes[0].requests.find(
        ({ method }) => method === 'account/login/cancel',
      )?.params,
    ).toEqual({ loginId: 'login-1' })
    await manager.close()
  })
})
