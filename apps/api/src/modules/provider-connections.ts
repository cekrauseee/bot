import type { Database, Db } from '../db/database.js'
import { ProviderConnectionRepository } from '../db/repository.js'

export type ProviderRateLimitWindow = {
  usedPercent: number
  windowDurationMinutes: number | null
  resetsAt: string | null
}

export type ProviderConnection = {
  status: 'unavailable' | 'disconnected' | 'connecting' | 'connected'
  loginMode: 'browser' | 'device'
  account: { email: string | null; planType: string } | null
  limits: {
    primary: ProviderRateLimitWindow | null
    secondary: ProviderRateLimitWindow | null
    reached: boolean
  } | null
}

export type ProviderLogin =
  | { type: 'browser'; loginId: string; authUrl: string; state?: string }
  | {
      type: 'device_code'
      loginId: string
      verificationUrl: string
      userCode: string
    }

export type ProviderLoginStatus =
  | { status: 'pending' }
  | { status: 'connected'; connection: ProviderConnection }
  | { status: 'failed'; message: string }

export type ProviderConnectionContext = {
  callbackTarget: 'web' | 'desktop'
}

export type ProviderLoginContext = ProviderConnectionContext

export interface ProviderConnectionAdapter {
  connection(userId: string, context?: ProviderConnectionContext): Promise<ProviderConnection>
  startLogin(userId: string, context?: ProviderLoginContext): Promise<ProviderLogin>
  loginStatus(userId: string, loginId: string): Promise<ProviderLoginStatus>
  cancelLogin(userId: string, loginId: string): Promise<void>
  disconnect(userId: string): Promise<void>
  close(): Promise<void>
}

export type ProviderConnectionRegistration = {
  provider: string
  loginMode: ProviderConnection['loginMode']
  adapter?: ProviderConnectionAdapter
}

export type ProviderConnectionRegistry = Readonly<
  Record<string, ProviderConnectionRegistration>
>

export class ProviderConnectionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ProviderConnectionError'
  }
}

export interface ProviderConnectionSettings {
  isActive(userId: string, provider: string, db?: Db): Promise<boolean>
  activeStates(userId: string, providers: readonly string[]): Promise<Map<string, boolean>>
  setActive(userId: string, provider: string, active: boolean): Promise<boolean>
}

export class DatabaseProviderConnectionSettings implements ProviderConnectionSettings {
  constructor(private readonly database: Database) {}

  isActive(userId: string, provider: string, db?: Db) {
    if (db) return new ProviderConnectionRepository(db).isActive(userId, provider)
    return this.database.transaction((transaction) =>
      new ProviderConnectionRepository(transaction).isActive(userId, provider))
  }

  activeStates(userId: string, providers: readonly string[]) {
    return this.database.transaction((db) =>
      new ProviderConnectionRepository(db).activeStates(userId, providers))
  }

  setActive(userId: string, provider: string, active: boolean) {
    return this.database.transaction((db) =>
      new ProviderConnectionRepository(db).setActive(userId, provider, active))
  }
}
