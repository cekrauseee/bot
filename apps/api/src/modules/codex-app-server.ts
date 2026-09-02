import { createHmac } from 'node:crypto'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  ProviderConnectionError,
  type ProviderConnection,
  type ProviderConnectionAdapter,
  type ProviderLogin,
  type ProviderLoginStatus,
  type ProviderRateLimitWindow,
} from './provider-connections.js'

type JsonObject = Record<string, unknown>

export type CodexRateLimitWindow = ProviderRateLimitWindow
export type CodexConnection = ProviderConnection
export type CodexLogin = ProviderLogin

export type CodexDeviceCodeLogin = Extract<CodexLogin, { type: 'device_code' }>
export type CodexBrowserLogin = Extract<CodexLogin, { type: 'browser' }>

export type CodexLoginStatus = ProviderLoginStatus

export interface CodexConnectionService extends ProviderConnectionAdapter {}

export class CodexConnectionError extends ProviderConnectionError {
  constructor(
    readonly code:
      'codex_unavailable' | 'codex_already_connected' | 'codex_login_not_found',
    message: string,
    readonly status: number,
  ) {
    super(code, message, status)
    this.name = 'CodexConnectionError'
  }
}

type SpawnCodex = (
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv; stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type RpcResponse = {
  id?: number
  result?: unknown
  error?: unknown
  method?: string
  params?: unknown
}

type AccountResponse = {
  account?: { type?: string; email?: unknown; planType?: unknown } | null
}

type RateLimitWindowResponse = {
  usedPercent?: unknown
  windowDurationMins?: unknown
  resetsAt?: unknown
}

type RateLimitResponse = {
  rateLimits?: {
    primary?: RateLimitWindowResponse | null
    secondary?: RateLimitWindowResponse | null
    rateLimitReachedType?: unknown
  }
}

const unavailable = () =>
  new CodexConnectionError(
    'codex_unavailable',
    'OpenAI connection is temporarily unavailable.',
    503,
  )

const fixedChildEnvironment = (home: string): NodeJS.ProcessEnv => {
  const inherited = process.env
  const allowlisted = [
    'PATH',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'SSL_CERT_FILE',
    'CODEX_CA_CERTIFICATE',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
  ] as const
  return Object.fromEntries([
    ...allowlisted.flatMap((name) =>
      inherited[name] ? [[name, inherited[name]]] : [],
    ),
    ['CODEX_HOME', home],
  ])
}

const asObject = (value: unknown): JsonObject | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined

const publicWindow = (
  value: RateLimitWindowResponse | null | undefined,
): CodexRateLimitWindow | null => {
  if (
    !value ||
    typeof value.usedPercent !== 'number' ||
    !Number.isFinite(value.usedPercent)
  )
    return null
  const duration =
    typeof value.windowDurationMins === 'number' &&
    Number.isFinite(value.windowDurationMins)
      ? value.windowDurationMins
      : null
  const resetSeconds =
    typeof value.resetsAt === 'number' && Number.isFinite(value.resetsAt)
      ? value.resetsAt
      : null
  return {
    usedPercent: Math.max(0, Math.min(100, value.usedPercent)),
    windowDurationMinutes: duration,
    resetsAt:
      resetSeconds === null
        ? null
        : new Date(resetSeconds * 1_000).toISOString(),
  }
}

class CodexAppServerClient {
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly loginResults = new Map<
    string,
    { success: boolean; error: string | null }
  >()
  private activeLogin: CodexLogin | undefined
  private closed = false
  private closePromise: Promise<void> | undefined

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly requestTimeoutMs: number,
    private readonly loginMode: 'browser' | 'device',
  ) {
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => this.receive(line))
    child.stderr.resume()
    child.once('error', () => this.failAll(unavailable()))
    child.once('exit', () => this.failAll(unavailable()))
  }

  static async start(options: {
    binary: string
    home: string
    requestTimeoutMs: number
    loginMode: 'browser' | 'device'
    spawnCodex: SpawnCodex
  }) {
    await mkdir(options.home, { recursive: true, mode: 0o700 })
    const child = options.spawnCodex(
      options.binary,
      [
        'app-server',
        '--stdio',
        '-c',
        'cli_auth_credentials_store="file"',
        '-c',
        'forced_login_method="chatgpt"',
        '-c',
        'analytics.enabled=false',
      ],
      {
        env: fixedChildEnvironment(options.home),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    const client = new CodexAppServerClient(
      child,
      options.requestTimeoutMs,
      options.loginMode,
    )
    await client.request('initialize', {
      clientInfo: { name: 'my-bot', title: 'myBot', version: '0.1.0' },
      capabilities: { experimentalApi: false, requestAttestation: false },
    })
    client.notify('initialized')
    return client
  }

  async connection(): Promise<CodexConnection> {
    if (this.activeLogin && !this.loginResults.has(this.activeLogin.loginId)) {
      return {
        status: 'connecting',
        loginMode: this.loginMode,
        account: null,
        limits: null,
      }
    }
    const response = (await this.request('account/read', {
      refreshToken: false,
    })) as AccountResponse
    if (response.account?.type !== 'chatgpt') {
      return {
        status: 'disconnected',
        loginMode: this.loginMode,
        account: null,
        limits: null,
      }
    }
    let limits: CodexConnection['limits'] = null
    try {
      const result = (await this.request(
        'account/rateLimits/read',
      )) as RateLimitResponse
      limits = {
        primary: publicWindow(result.rateLimits?.primary),
        secondary: publicWindow(result.rateLimits?.secondary),
        reached: typeof result.rateLimits?.rateLimitReachedType === 'string',
      }
    } catch {
      limits = null
    }
    return {
      status: 'connected',
      loginMode: this.loginMode,
      account: {
        email:
          typeof response.account.email === 'string'
            ? response.account.email
            : null,
        planType:
          typeof response.account.planType === 'string'
            ? response.account.planType
            : 'unknown',
      },
      limits,
    }
  }

  async startLogin(): Promise<CodexLogin> {
    const current = await this.connection()
    if (current.status === 'connected') {
      throw new CodexConnectionError(
        'codex_already_connected',
        'An OpenAI account is already connected.',
        409,
      )
    }
    if (this.activeLogin && !this.loginResults.has(this.activeLogin.loginId))
      return this.activeLogin
    const params =
      this.loginMode === 'browser'
        ? {
            type: 'chatgpt',
            useHostedLoginSuccessPage: true,
            appBrand: 'chatgpt',
          }
        : { type: 'chatgptDeviceCode' }
    const response = asObject(await this.request('account/login/start', params))
    if (this.loginMode === 'browser') {
      if (
        response?.type !== 'chatgpt' ||
        typeof response.loginId !== 'string' ||
        typeof response.authUrl !== 'string'
      )
        throw unavailable()
      this.activeLogin = {
        type: 'browser',
        loginId: response.loginId,
        authUrl: response.authUrl,
      }
    } else {
      if (
        response?.type !== 'chatgptDeviceCode' ||
        typeof response.loginId !== 'string' ||
        typeof response.verificationUrl !== 'string' ||
        typeof response.userCode !== 'string'
      )
        throw unavailable()
      this.activeLogin = {
        type: 'device_code',
        loginId: response.loginId,
        verificationUrl: response.verificationUrl,
        userCode: response.userCode,
      }
    }
    return this.activeLogin
  }

  async loginStatus(loginId: string): Promise<CodexLoginStatus> {
    if (this.activeLogin?.loginId !== loginId) {
      throw new CodexConnectionError(
        'codex_login_not_found',
        'This OpenAI connection attempt is no longer active.',
        404,
      )
    }
    const result = this.loginResults.get(loginId)
    if (!result) return { status: 'pending' }
    if (!result.success) {
      this.activeLogin = undefined
      this.loginResults.delete(loginId)
      return {
        status: 'failed',
        message: 'Unable to connect the OpenAI account. Try again.',
      }
    }
    const connection = await this.connection()
    if (connection.status !== 'connected') return { status: 'pending' }
    this.activeLogin = undefined
    this.loginResults.delete(loginId)
    return { status: 'connected', connection }
  }

  async cancelLogin(loginId: string) {
    if (this.activeLogin?.loginId !== loginId || this.loginResults.has(loginId))
      throw new CodexConnectionError(
        'codex_login_not_found',
        'This OpenAI connection attempt is no longer active.',
        404,
      )
    await this.request('account/login/cancel', { loginId })
    this.activeLogin = undefined
    this.loginResults.delete(loginId)
  }

  async disconnect() {
    await this.request('account/logout')
    this.activeLogin = undefined
    this.loginResults.clear()
  }

  close(): Promise<void> {
    this.closePromise ??= new Promise((resolve) => {
      if (this.closed || this.child.exitCode !== null) {
        resolve()
        return
      }
      const timer = setTimeout(() => {
        this.child.kill('SIGKILL')
        resolve()
      }, 2_000)
      timer.unref()
      this.child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      this.child.kill('SIGTERM')
    })
    return this.closePromise
  }

  private request(method: string, params?: JsonObject): Promise<unknown> {
    if (this.closed || this.child.exitCode !== null)
      return Promise.reject(unavailable())
    const id = this.nextRequestId
    this.nextRequestId += 1
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(unavailable())
      }, this.requestTimeoutMs)
      timer.unref()
      this.pending.set(id, { resolve, reject, timer })
      const payload =
        params === undefined ? { method, id } : { method, id, params }
      this.child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return
        clearTimeout(timer)
        this.pending.delete(id)
        reject(unavailable())
      })
    })
  }

  private notify(method: string) {
    if (!this.closed && this.child.exitCode === null) {
      this.child.stdin.write(`${JSON.stringify({ method })}\n`)
    }
  }

  private receive(line: string) {
    let message: RpcResponse
    try {
      message = JSON.parse(line) as RpcResponse
    } catch {
      this.failAll(unavailable())
      return
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      if (message.error !== undefined) pending.reject(unavailable())
      else pending.resolve(message.result)
      return
    }
    if (message.method !== 'account/login/completed') return
    const params = asObject(message.params)
    if (
      typeof params?.loginId !== 'string' ||
      typeof params.success !== 'boolean'
    )
      return
    this.loginResults.set(params.loginId, {
      success: params.success,
      error: typeof params.error === 'string' ? params.error : null,
    })
  }

  private failAll(error: Error) {
    if (this.closed) return
    this.closed = true
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
  }
}

type ManagedClient = {
  client: Promise<CodexAppServerClient>
  idleTimer: ReturnType<typeof setTimeout>
}

export class CodexAppServerManager implements CodexConnectionService {
  private readonly clients = new Map<string, ManagedClient>()

  constructor(
    private readonly options: {
      binary: string
      homeRoot: string
      identityKey: string
      requestTimeoutMs?: number
      idleTimeoutMs?: number
      spawnCodex?: SpawnCodex
      loginMode: 'browser' | 'device'
    },
  ) {}

  async connection(userId: string) {
    const key = this.userKey(userId)
    if (!this.clients.has(key)) {
      try {
        await access(join(this.options.homeRoot, key, 'auth.json'))
      } catch {
        return {
          status: 'disconnected',
          loginMode: this.options.loginMode,
          account: null,
          limits: null,
        } as const
      }
    }
    return this.withClient(userId, (client) => client.connection())
  }

  async startLogin(userId: string) {
    return this.withClient(userId, (client) => client.startLogin())
  }

  async loginStatus(userId: string, loginId: string) {
    return this.withClient(userId, (client) => client.loginStatus(loginId))
  }

  async cancelLogin(userId: string, loginId: string) {
    return this.withClient(userId, (client) => client.cancelLogin(loginId))
  }

  async disconnect(userId: string) {
    const key = this.userKey(userId)
    await this.withClient(userId, async (client) => {
      try {
        await client.disconnect()
      } finally {
        await client.close()
        this.remove(key)
      }
    })
  }

  async close() {
    const clients = [...this.clients.values()]
    this.clients.clear()
    for (const managed of clients) clearTimeout(managed.idleTimer)
    await Promise.allSettled(
      clients.map(async ({ client }) => (await client).close()),
    )
  }

  private client(userId: string): Promise<CodexAppServerClient> {
    const key = this.userKey(userId)
    const existing = this.clients.get(key)
    if (existing) {
      this.resetIdle(key, existing)
      return existing.client
    }
    const home = join(this.options.homeRoot, key)
    const client = CodexAppServerClient.start({
      binary: this.options.binary,
      home,
      requestTimeoutMs: this.options.requestTimeoutMs ?? 15_000,
      loginMode: this.options.loginMode,
      spawnCodex:
        this.options.spawnCodex ??
        ((command, args, options) =>
          spawn(command, args, { ...options, shell: false })),
    }).catch((error) => {
      this.remove(key)
      throw error instanceof CodexConnectionError ? error : unavailable()
    })
    const managed = {
      client,
      idleTimer: setTimeout(
        () => undefined,
        this.options.idleTimeoutMs ?? 300_000,
      ),
    }
    managed.idleTimer.unref()
    this.clients.set(key, managed)
    this.resetIdle(key, managed)
    return client
  }

  private async withClient<T>(
    userId: string,
    operation: (client: CodexAppServerClient) => Promise<T>,
  ): Promise<T> {
    const key = this.userKey(userId)
    const client = await this.client(userId)
    try {
      return await operation(client)
    } catch (error) {
      if (
        error instanceof CodexConnectionError &&
        error.code === 'codex_unavailable'
      ) {
        this.remove(key)
        await client.close()
      }
      throw error
    }
  }

  private resetIdle(key: string, managed: ManagedClient) {
    clearTimeout(managed.idleTimer)
    managed.idleTimer = setTimeout(() => {
      if (this.clients.get(key) !== managed) return
      this.clients.delete(key)
      void managed.client.then(
        (client) => client.close(),
        () => undefined,
      )
    }, this.options.idleTimeoutMs ?? 300_000)
    managed.idleTimer.unref()
  }

  private remove(key: string) {
    const managed = this.clients.get(key)
    if (!managed) return
    clearTimeout(managed.idleTimer)
    this.clients.delete(key)
  }

  private userKey(userId: string) {
    return createHmac('sha256', this.options.identityKey)
      .update(userId)
      .digest('hex')
  }
}
