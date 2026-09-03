import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, session, shell } from 'electron'
import { promises as fs, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function httpOrigin(value: string, name: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(`${name} must be an HTTP origin`)
  return url.origin
}

type DesktopPublicConfig = { WEB_BASE_URL?: unknown; VITE_API_BASE_URL?: unknown }
type PendingDesktopAuth = { transactionId: string; clientSecret: string; expiresAt: number }

function loadPublicConfig(): DesktopPublicConfig {
  const configPath = app.isPackaged
    ? path.join(process.resourcesPath, 'public-config.json')
    : path.resolve(__dirname, '../assets/generated/public-config.json')
  try { return JSON.parse(readFileSync(configPath, 'utf8')) as DesktopPublicConfig } catch { throw new Error(`Missing desktop public config: ${configPath}`) }
}

const publicConfig = loadPublicConfig()
const API_ORIGIN = httpOrigin(String(publicConfig.VITE_API_BASE_URL ?? ''), 'VITE_API_BASE_URL')
const WEB_ORIGIN = httpOrigin(String(publicConfig.WEB_BASE_URL ?? ''), 'WEB_BASE_URL')
const WS_API_ORIGIN = API_ORIGIN.replace(/^http/, 'ws')
const APP_ORIGIN = 'app://mybot'
const DEEP_LINK_SCHEME = 'mybot'
const DEEP_LINK_PREFIX = `${DEEP_LINK_SCHEME}://auth/callback`
const SESSION_FILE = 'desktop-session.bin'
const PENDING_AUTH_FILE = 'desktop-auth-pending.bin'

let sessionToken: string | undefined
let mainWindow: BrowserWindow | undefined
let sessionBoundaryInstalled = false
let desktopCallbackInFlight = false
let queuedDeepLinks: string[] = []

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

function validExternalUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return false
    if (url.protocol === 'https:') return true
    if (url.protocol !== 'http:') return false
    return url.origin === WEB_ORIGIN || url.origin === API_ORIGIN || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch { return false }
}

function validApiRequest(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol === 'ws:') url.protocol = 'http:'
    if (url.protocol === 'wss:') url.protocol = 'https:'
    return url.origin === API_ORIGIN
  } catch { return false }
}

function desktopCallbackTransactionId(value: string) {
  try {
    const url = new URL(value)
    const keys = [...url.searchParams.keys()]
    if (
      url.protocol !== `${DEEP_LINK_SCHEME}:` ||
      url.hostname !== 'auth' ||
      url.pathname !== '/callback' ||
      url.username ||
      url.password ||
      url.hash ||
      keys.length !== 1 ||
      keys[0] !== 'transaction_id'
    ) return undefined
    const transactionId = url.searchParams.get('transaction_id')
    return transactionId && /^[A-Za-z0-9_-]{32,64}$/.test(transactionId)
      ? transactionId
      : undefined
  } catch { return undefined }
}

function deepLinksFromArguments(arguments_: string[]) {
  return arguments_.filter((value) => value.startsWith(DEEP_LINK_PREFIX))
}

function focusMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function loadSession() {
  if (!safeStorage.isEncryptionAvailable()) return
  try {
    const encrypted = await fs.readFile(path.join(app.getPath('userData'), SESSION_FILE))
    sessionToken = safeStorage.decryptString(encrypted)
  } catch { sessionToken = undefined }
}

async function storeSession(token: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure desktop storage is unavailable')
  const file = path.join(app.getPath('userData'), SESSION_FILE)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, safeStorage.encryptString(token), { mode: 0o600 })
  sessionToken = token
}

async function clearSession() {
  if (sessionToken && validApiRequest(`${API_ORIGIN}/auth/sign-out`)) {
    try { await fetch(`${API_ORIGIN}/auth/sign-out`, { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` } }) } catch { /* local sign-out must still clear storage */ }
  }
  sessionToken = undefined
  await fs.rm(path.join(app.getPath('userData'), SESSION_FILE), { force: true })
}

async function storePendingDesktopAuth(value: PendingDesktopAuth) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure desktop storage is unavailable')
  const file = path.join(app.getPath('userData'), PENDING_AUTH_FILE)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600 })
}

async function loadPendingDesktopAuth() {
  if (!safeStorage.isEncryptionAvailable()) return undefined
  try {
    const encrypted = await fs.readFile(path.join(app.getPath('userData'), PENDING_AUTH_FILE))
    const value = JSON.parse(safeStorage.decryptString(encrypted)) as Partial<PendingDesktopAuth>
    if (
      typeof value.transactionId !== 'string' ||
      !/^[A-Za-z0-9_-]{32,64}$/.test(value.transactionId) ||
      typeof value.clientSecret !== 'string' ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(value.clientSecret) ||
      typeof value.expiresAt !== 'number' ||
      !Number.isSafeInteger(value.expiresAt)
    ) return undefined
    return value as PendingDesktopAuth
  } catch { return undefined }
}

async function clearPendingDesktopAuth() {
  await fs.rm(path.join(app.getPath('userData'), PENDING_AUTH_FILE), { force: true })
}

async function startBrowserSignIn() {
  const response = await fetch(`${API_ORIGIN}/auth/desktop/start`, { method: 'POST', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('Unable to start desktop sign-in')
  const result = await response.json() as { transaction_id?: string; client_secret?: string; verification_url?: string; expires_in_seconds?: number }
  if (
    typeof result.transaction_id !== 'string' ||
    !/^[A-Za-z0-9_-]{32,64}$/.test(result.transaction_id) ||
    typeof result.client_secret !== 'string' ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(result.client_secret) ||
    typeof result.verification_url !== 'string' ||
    !Number.isInteger(result.expires_in_seconds) ||
    (result.expires_in_seconds ?? 0) <= 0
  ) throw new Error('Invalid desktop sign-in response')

  const verification = new URL(result.verification_url)
  if (
    verification.origin !== WEB_ORIGIN ||
    verification.pathname !== '/sign' ||
    verification.searchParams.get('desktop_transaction') !== result.transaction_id ||
    verification.searchParams.has('client_secret')
  ) throw new Error('Invalid desktop verification URL')

  await storePendingDesktopAuth({
    transactionId: result.transaction_id,
    clientSecret: result.client_secret,
    expiresAt: Date.now() + (result.expires_in_seconds as number) * 1_000,
  })
  try {
    await shell.openExternal(verification.toString())
  } catch (error) {
    await clearPendingDesktopAuth()
    throw error
  }
}

async function showDesktopAuthError() {
  if (!mainWindow) await createWindow()
  await mainWindow?.loadURL(`${APP_ORIGIN}/sign?desktop=error`)
  focusMainWindow()
}

async function handleDesktopCallback(value: string) {
  const transactionId = desktopCallbackTransactionId(value)
  if (!transactionId || desktopCallbackInFlight) return
  desktopCallbackInFlight = true
  focusMainWindow()

  try {
    const pending = await loadPendingDesktopAuth()
    if (!pending) {
      if (sessionToken) return
      throw new Error('Desktop sign-in request is invalid or expired')
    }
    if (pending.transactionId !== transactionId) return
    if (pending.expiresAt <= Date.now()) throw new Error('Desktop sign-in request is invalid or expired')
    const exchange = await fetch(`${API_ORIGIN}/auth/desktop/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: pending.transactionId, client_secret: pending.clientSecret }),
    })
    if (!exchange.ok) throw new Error('Desktop sign-in exchange failed')
    const exchanged = await exchange.json() as { token?: string }
    if (!exchanged.token || !/^[A-Za-z0-9_-]{32,256}$/.test(exchanged.token)) throw new Error('Invalid desktop session response')
    await storeSession(exchanged.token)
    await clearPendingDesktopAuth()
    if (!mainWindow) await createWindow()
    else await mainWindow.loadURL(`${APP_ORIGIN}/`)
    focusMainWindow()
  } catch {
    await clearPendingDesktopAuth()
    await showDesktopAuthError()
  } finally {
    desktopCallbackInFlight = false
  }
}

function dispatchDeepLink(value: string) {
  if (!desktopCallbackTransactionId(value)) return
  if (!app.isReady()) {
    queuedDeepLinks.push(value)
    return
  }
  void handleDesktopCallback(value)
}

function registerDeepLinkHandler() {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])])
    return
  }
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
}

function installSessionBoundary() {
  if (sessionBoundaryInstalled) return
  sessionBoundaryInstalled = true
  const filter = { urls: ['*://*/*'] }
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (sessionToken && validApiRequest(details.url)) details.requestHeaders.Authorization = `Bearer ${sessionToken}`
    callback({ requestHeaders: details.requestHeaders })
  })
  session.defaultSession.webRequest.onHeadersReceived({ urls: [`${APP_ORIGIN}/*`] }, (details, callback) => {
    const responseHeaders = details.responseHeaders ?? {}
    responseHeaders['Content-Security-Policy'] = [`default-src 'self'; connect-src 'self' ${API_ORIGIN} ${WS_API_ORIGIN}; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`]
    callback({ responseHeaders })
  })
}

async function createWindow() {
  await loadSession()
  installSessionBoundary()
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 720, minHeight: 520,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  mainWindow.on('closed', () => { mainWindow = undefined })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (validExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) { event.preventDefault(); if (validExternalUrl(url)) void shell.openExternal(url) }
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  await mainWindow.loadURL(`${APP_ORIGIN}/`)
}

registerDeepLinkHandler()

app.on('open-url', (event, url) => {
  event.preventDefault()
  dispatchDeepLink(url)
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    focusMainWindow()
    for (const deepLink of deepLinksFromArguments(commandLine)) dispatchDeepLink(deepLink)
  })

  app.whenReady().then(async () => {
    protocol.handle('app', async (request) => {
      try {
        const requested = new URL(request.url)
        if (requested.hostname !== 'mybot') return new Response('Not Found', { status: 404 })
        const relative = decodeURIComponent(requested.pathname).replace(/^\/+/, '')
        if (relative.includes('\0')) return new Response('Not Found', { status: 404 })
        const root = app.isPackaged
          ? path.resolve(process.resourcesPath, 'dist')
          : path.resolve(__dirname, '../../web/dist')
        const candidate = path.resolve(root, relative || 'index.html')
        const relativeToRoot = path.relative(root, candidate)
        if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return new Response('Not Found', { status: 404 })
        let file = candidate
        try {
          const stat = await fs.stat(candidate)
          if (!stat.isFile()) throw new Error('not a file')
        } catch {
          // BrowserRouter navigational paths are handled by the SPA entrypoint;
          // missing asset-like paths remain a genuine 404.
          if (path.extname(relativeToRoot)) return new Response('Not Found', { status: 404 })
          file = path.join(root, 'index.html')
        }
        return await net.fetch(pathToFileURL(file).toString())
      } catch { return new Response('Not Found', { status: 404 }) }
    })
    ipcMain.handle('desktop:platform-info', (event) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Invalid IPC sender')
      return { platform: process.platform, version: app.getVersion() }
    })
    ipcMain.handle('desktop:start-browser-sign-in', async (event) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Invalid IPC sender')
      return startBrowserSignIn()
    })
    ipcMain.handle('desktop:clear-session', async (event) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Invalid IPC sender')
      await clearSession()
    })
    ipcMain.handle('desktop:open-external-url', async (event, value: unknown) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Invalid IPC sender')
      if (typeof value !== 'string' || !validExternalUrl(value)) throw new Error('External URL is not allowed')
      await shell.openExternal(value)
    })
    await createWindow()

    const initialDeepLinks = [
      ...queuedDeepLinks,
      ...deepLinksFromArguments(process.argv),
    ]
    queuedDeepLinks = []
    for (const deepLink of initialDeepLinks) await handleDesktopCallback(deepLink)
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void createWindow() })
}
