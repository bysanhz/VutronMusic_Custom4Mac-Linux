import {
  app,
  ipcMain,
  protocol,
  safeStorage,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
import Store from 'electron-store'
import dns from 'dns/promises'
import fs from 'fs'
import path from 'path'
import {
  isPathInside,
  isPrivateIpAddress,
  isUnsafeHostname,
  parseSafeExternalUrl
} from './validation'

const INSTALL_KEY = '__VUTRON_RUNTIME_SECURITY_INSTALLED__'
const ENCRYPTED_PREFIX = 'vutron-secure:v1:'
const LOCAL_TRACK_DIRECTORY_CACHE_MS = 5000
const TRUSTED_ORIGINS = new Set([
  'http://localhost:41830',
  'http://127.0.0.1:41830',
  'http://localhost:40001',
  'http://127.0.0.1:40001'
])
const SENSITIVE_PATHS = new Set([
  'accounts.navidrome.password',
  'accounts.navidrome.anthorization',
  'accounts.navidrome.token',
  'accounts.navidrome.salt',
  'accounts.emby.password',
  'accounts.emby.accessToken',
  'accounts.jellyfin.password',
  'accounts.jellyfin.accessToken',
  'settings.lastfmSession.key',
  'settings.unblockNeteaseMusic.jooxCookie',
  'settings.unblockNeteaseMusic.qqCookie'
])
const KNOWN_ATOM_HOSTS = new Set([
  'get-default-pic',
  'get-pic-path',
  'get-color',
  'local-asset',
  'local-resource',
  'get-online-music'
])

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

type SecurityGlobal = typeof globalThis & {
  [INSTALL_KEY]?: boolean
}

let warnedEncryptionUnavailable = false
let cachedTrackDirectories: string[] = []
let cachedTrackDirectoriesAt = 0

const reportBlockedAction = (message: string, details?: unknown): void => {
  console.warn(`[Security] ${message}`, details ?? '')
}

const normalizeSenderOrigin = (contents: WebContents): string | null => {
  try {
    const value = contents.getURL()
    if (!value) return null
    const url = new URL(value)
    return url.origin
  } catch {
    return null
  }
}

const isTrustedSender = (contents: WebContents): boolean => {
  const origin = normalizeSenderOrigin(contents)
  return origin !== null && TRUSTED_ORIGINS.has(origin)
}

const isSensitivePath = (keyPath: string): boolean => SENSITIVE_PATHS.has(keyPath)

const canUseEncryption = (): boolean => {
  try {
    return app.isReady() && safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

const encryptSecret = (value: string): string => {
  if (!value || value.startsWith(ENCRYPTED_PREFIX)) return value
  if (!canUseEncryption()) {
    if (!warnedEncryptionUnavailable) {
      warnedEncryptionUnavailable = true
      reportBlockedAction('系统凭据加密暂不可用；敏感配置将在加密可用后首次读取时迁移')
    }
    return value
  }

  return ENCRYPTED_PREFIX + safeStorage.encryptString(value).toString('base64')
}

const decryptSecret = (value: string): string => {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value
  if (!canUseEncryption()) {
    reportBlockedAction('无法解密已保护的凭据，请检查系统钥匙串状态')
    return ''
  }

  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'))
  } catch (error) {
    reportBlockedAction('凭据解密失败', error)
    return ''
  }
}

const mapProtectedValue = (
  keyPath: string,
  value: unknown,
  mode: 'encrypt' | 'decrypt'
): unknown => {
  if (isSensitivePath(keyPath) && typeof value === 'string') {
    return mode === 'encrypt' ? encryptSecret(value) : decryptSecret(value)
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => mapProtectedValue(`${keyPath}.${index}`, item, mode))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        mapProtectedValue(keyPath ? `${keyPath}.${key}` : key, item, mode)
      ])
    )
  }

  return value
}

const installCredentialProtection = (): void => {
  const prototype = Store.prototype as any
  if (prototype.__vutronCredentialProtectionInstalled) return
  prototype.__vutronCredentialProtectionInstalled = true

  const originalGet = prototype.get
  const originalSet = prototype.set

  prototype.get = function protectedGet(key: string, defaultValue?: unknown) {
    const stored = originalGet.call(this, key, defaultValue)
    const decrypted = mapProtectedValue(key, stored, 'decrypt')

    if (
      isSensitivePath(key) &&
      typeof stored === 'string' &&
      stored &&
      !stored.startsWith(ENCRYPTED_PREFIX) &&
      canUseEncryption()
    ) {
      originalSet.call(this, key, encryptSecret(stored))
    }

    return decrypted
  }

  prototype.set = function protectedSet(key: string | Record<string, unknown>, value?: unknown) {
    if (typeof key === 'string') {
      return originalSet.call(this, key, mapProtectedValue(key, value, 'encrypt'))
    }

    const protectedEntries = Object.fromEntries(
      Object.entries(key).map(([entryKey, entryValue]) => [
        entryKey,
        mapProtectedValue(entryKey, entryValue, 'encrypt')
      ])
    )
    return originalSet.call(this, protectedEntries)
  }
}

const getStoredStreamPassword = async (platform: string): Promise<string> => {
  if (!['navidrome', 'emby', 'jellyfin'].includes(platform)) return ''
  const { default: store } = await import('../store')
  return (store.get(`accounts.${platform}.password`) as string) || ''
}

const prepareIpcArguments = async (channel: string, args: unknown[]): Promise<unknown[]> => {
  if (channel === 'msgOpenExternalLink' && !parseSafeExternalUrl(args[0])) {
    throw new Error('Blocked unsafe external URL')
  }

  if (channel === 'delete-screenshot') {
    const screenshotPath = typeof args[0] === 'string' ? args[0] : ''
    if (!(await isAllowedScreenshotPath(screenshotPath))) {
      throw new Error('Blocked screenshot deletion outside the screenshot directory')
    }
  }

  if (channel === 'stream-login') {
    const data = args[0]
    if (data && typeof data === 'object') {
      const loginData = { ...(data as Record<string, unknown>) }
      const platform = String(loginData.platform || '')
      if (!loginData.password) {
        loginData.password = await getStoredStreamPassword(platform)
      }
      return [loginData, ...args.slice(1)]
    }
  }

  return args
}

const sanitizeIpcResult = (channel: string, result: unknown): unknown => {
  if (channel !== 'get-stream-account' || !result || typeof result !== 'object') return result
  const account = result as Record<string, unknown>
  return {
    ...account,
    password: '',
    hasPassword: Boolean(account.password)
  }
}

const installIpcGuards = (): void => {
  const target = ipcMain as any
  if (target.__vutronIpcGuardsInstalled) return
  target.__vutronIpcGuardsInstalled = true

  const originalOn = ipcMain.on.bind(ipcMain)
  const originalOnce = ipcMain.once.bind(ipcMain)
  const originalHandle = ipcMain.handle.bind(ipcMain)

  const wrapEventListener = (channel: string, listener: (...args: any[]) => unknown) => {
    return async (event: IpcMainEvent, ...args: unknown[]) => {
      if (!isTrustedSender(event.sender)) {
        reportBlockedAction(`拒绝不可信渲染进程调用 IPC: ${channel}`, event.sender.getURL())
        return
      }

      try {
        const nextArgs = await prepareIpcArguments(channel, args)
        return await listener(event, ...nextArgs)
      } catch (error) {
        reportBlockedAction(`拒绝 IPC 调用: ${channel}`, error)
      }
    }
  }

  target.on = (channel: string, listener: (...args: any[]) => unknown) =>
    originalOn(channel, wrapEventListener(channel, listener))
  target.once = (channel: string, listener: (...args: any[]) => unknown) =>
    originalOnce(channel, wrapEventListener(channel, listener))
  target.handle = (channel: string, listener: (...args: any[]) => unknown) =>
    originalHandle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!isTrustedSender(event.sender)) {
        throw new Error(`Rejected untrusted IPC sender for ${channel}`)
      }
      const nextArgs = await prepareIpcArguments(channel, args)
      const result = await listener(event, ...nextArgs)
      return sanitizeIpcResult(channel, result)
    })
}

const isSafeRemoteUrl = async (value: string): Promise<boolean> => {
  const url = parseSafeExternalUrl(value)
  if (!url) return false
  if (isUnsafeHostname(url.hostname)) return false

  try {
    const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true })
    return addresses.length > 0 && addresses.every((item) => !isPrivateIpAddress(item.address))
  } catch {
    return false
  }
}

const realpathIfPresent = async (value: string): Promise<string | null> => {
  if (!value) return null
  try {
    return await fs.promises.realpath(value)
  } catch {
    return null
  }
}

const getLocalTrackDirectories = async (): Promise<string[]> => {
  const now = Date.now()
  if (now - cachedTrackDirectoriesAt < LOCAL_TRACK_DIRECTORY_CACHE_MS) {
    return cachedTrackDirectories
  }

  try {
    const [{ db, Tables }] = await Promise.all([import('../db')])
    const rows = db.findAll(Tables.Track)
    const directories = new Set<string>()

    for (const row of rows as Array<{ json?: string }>) {
      try {
        const track = JSON.parse(row.json || '{}') as {
          filePath?: string
          url?: string
          cache?: boolean
        }
        const candidates = [track.filePath, track.cache ? track.url : undefined]
        for (const candidate of candidates) {
          if (typeof candidate !== 'string' || !candidate) continue
          const resolved = await realpathIfPresent(candidate)
          if (resolved) directories.add(path.dirname(resolved))
        }
      } catch {
        // Ignore malformed cache rows; the database layer already records structural errors.
      }
    }

    cachedTrackDirectories = [...directories]
    cachedTrackDirectoriesAt = now
  } catch (error) {
    reportBlockedAction('读取本地音乐允许目录失败', error)
    cachedTrackDirectories = []
    cachedTrackDirectoriesAt = now
  }

  return cachedTrackDirectories
}

const getStaticAllowedRoots = async (): Promise<string[]> => {
  const candidates = [
    app.getPath('userData'),
    app.getPath('music'),
    app.getAppPath(),
    process.resourcesPath
  ]
  const roots = await Promise.all(candidates.map(realpathIfPresent))
  return roots.filter((item): item is string => Boolean(item))
}

const isAllowedLocalReadPath = async (value: string): Promise<boolean> => {
  let candidate = value
  if (process.platform === 'win32' && candidate.match(/^\/[A-Za-z]:/)) {
    candidate = candidate.slice(1)
  }

  const resolved = await realpathIfPresent(candidate)
  if (!resolved) return false

  const roots = [...(await getStaticAllowedRoots()), ...(await getLocalTrackDirectories())]
  return roots.some((root) => isPathInside(resolved, root))
}

const isAllowedScreenshotPath = async (value: string): Promise<boolean> => {
  const screenshotsRoot = path.join(app.getPath('userData'), 'screenshots')
  const resolvedRoot = (await realpathIfPresent(screenshotsRoot)) || path.resolve(screenshotsRoot)
  const resolvedFile = (await realpathIfPresent(value)) || path.resolve(value)
  return isPathInside(resolvedFile, resolvedRoot)
}

const validateAtomRequest = async (requestUrl: string): Promise<Response | null> => {
  let request: URL
  try {
    request = new URL(requestUrl)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  if (!KNOWN_ATOM_HOSTS.has(request.host)) {
    return new Response('Not Found', { status: 404 })
  }

  if (request.host === 'get-online-music') {
    const target = decodeURIComponent(request.pathname.slice(1)) + request.search
    if (!(await isSafeRemoteUrl(target))) {
      reportBlockedAction('阻止不安全的远程音频请求', target)
      return new Response('Forbidden', { status: 403 })
    }
  }

  if (request.host === 'get-pic-path') {
    const filePath = decodeURIComponent(request.pathname.slice(1))
    if (!(await isAllowedLocalReadPath(filePath))) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  if (request.host === 'local-resource') {
    const filePath = decodeURIComponent(request.pathname.slice(1))
    if (!(await isAllowedLocalReadPath(filePath))) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  if (request.host === 'local-asset') {
    const type = request.searchParams.get('type')
    if (type === 'stream' || type === 'json') {
      const filePath = decodeURIComponent(request.searchParams.get('path') || '')
      if (!(await isAllowedLocalReadPath(filePath))) {
        return new Response('Forbidden', { status: 403 })
      }
    }
  }

  return null
}

const installProtocolGuard = (): void => {
  const target = protocol as any
  if (target.__vutronProtocolGuardInstalled) return
  target.__vutronProtocolGuardInstalled = true

  const originalHandle = protocol.handle.bind(protocol)
  target.handle = (scheme: string, handler: (request: Request) => Promise<Response> | Response) => {
    return originalHandle(scheme, async (request: Request) => {
      if (scheme === 'atom') {
        const blockedResponse = await validateAtomRequest(request.url)
        if (blockedResponse) return blockedResponse
      }
      return await handler(request)
    })
  }
}

const installNavigationGuard = (): void => {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      const safeUrl = parseSafeExternalUrl(url)
      if (safeUrl) void shell.openExternal(safeUrl.toString())
      else reportBlockedAction('阻止不安全的新窗口 URL', url)
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      let trusted = false
      try {
        trusted = TRUSTED_ORIGINS.has(new URL(url).origin)
      } catch {
        trusted = false
      }

      if (!trusted) {
        event.preventDefault()
        const safeUrl = parseSafeExternalUrl(url)
        if (safeUrl) void shell.openExternal(safeUrl.toString())
        else reportBlockedAction('阻止不安全的页面导航', url)
      }
    })
  })
}

const installRuntimeSecurity = (): void => {
  const runtimeGlobal = globalThis as SecurityGlobal
  if (runtimeGlobal[INSTALL_KEY]) return
  runtimeGlobal[INSTALL_KEY] = true

  installCredentialProtection()
  installIpcGuards()
  installProtocolGuard()
  installNavigationGuard()
}

installRuntimeSecurity()
