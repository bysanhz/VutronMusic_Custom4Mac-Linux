import {
  shell,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { promises as dns } from 'dns'
import fs from 'fs'
import { isIP } from 'net'
import path from 'path'
import Constants from './utils/Constants'
import log from './log'

const TRUSTED_RENDERER_ORIGINS = new Set(
  [Constants.APP_INDEX_URL_DEV, Constants.APP_INDEX_URL_PROD, Constants.APP_OSD_URL].map(
    (value) => new URL(value).origin
  )
)

const PUBLIC_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])
const REMOTE_FETCH_PROTOCOLS = new Set(['https:', 'http:'])

export const AUDIO_FILE_EXTENSIONS = new Set([
  '.mp3',
  '.aiff',
  '.aif',
  '.flac',
  '.alac',
  '.m4a',
  '.aac',
  '.wav',
  '.opus',
  '.ogg'
])

export const MEDIA_FILE_EXTENSIONS = new Set([
  ...AUDIO_FILE_EXTENSIONS,
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.mkv'
])

const normalizeHostname = (hostname: string) => hostname.trim().toLowerCase().replace(/\.$/, '')

const isPrivateIpv4 = (address: string): boolean => {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return true

  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

const isPrivateIpAddress = (address: string): boolean => {
  const normalized = address.toLowerCase()
  const version = isIP(normalized)
  if (version === 4) return isPrivateIpv4(normalized)
  if (version !== 6) return true

  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length))
  }

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  )
}

export const isTrustedRendererUrl = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl)
    return TRUSTED_RENDERER_ORIGINS.has(url.origin)
  } catch {
    return false
  }
}

export const assertTrustedIpcEvent = (
  event: IpcMainEvent | IpcMainInvokeEvent
): void => {
  const senderUrl = event.senderFrame?.url || event.sender.getURL()
  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error(`拒绝来自非受信页面的 IPC 调用：${senderUrl || 'unknown'}`)
  }
}

export const parseExternalUrl = (rawUrl: string): URL => {
  const url = new URL(rawUrl)
  if (!PUBLIC_EXTERNAL_PROTOCOLS.has(url.protocol)) {
    throw new Error(`不允许打开 ${url.protocol} 链接`)
  }
  if ((url.protocol === 'http:' || url.protocol === 'https:') && (url.username || url.password)) {
    throw new Error('外部链接不得包含用户名或密码')
  }
  return url
}

export const openExternalUrl = async (rawUrl: string): Promise<boolean> => {
  try {
    const url = parseExternalUrl(rawUrl)
    await shell.openExternal(url.toString())
    return true
  } catch (error) {
    log.warn('[Security] 已阻止不安全的外部链接', rawUrl, error)
    return false
  }
}

export const assertSafeRemoteFetchUrl = async (rawUrl: string): Promise<URL> => {
  const url = new URL(rawUrl)
  if (!REMOTE_FETCH_PROTOCOLS.has(url.protocol)) {
    throw new Error(`不允许通过主进程请求 ${url.protocol} 地址`)
  }
  if (url.username || url.password) {
    throw new Error('远程请求地址不得包含用户名或密码')
  }

  const hostname = normalizeHostname(url.hostname)
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('不允许请求本机或内部网络地址')
  }

  if (isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) throw new Error('不允许请求私有或保留 IP 地址')
    return url
  }

  const resolved = await dns.lookup(hostname, { all: true, verbatim: true })
  if (!resolved.length || resolved.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error('域名解析到了私有或保留 IP 地址')
  }

  return url
}

export const resolveReadableFile = (
  requestedPath: string,
  allowedExtensions: ReadonlySet<string>,
  maxBytes = Number.POSITIVE_INFINITY
): string => {
  if (!requestedPath || requestedPath.includes('\0')) throw new Error('文件路径无效')

  const resolvedPath = fs.realpathSync(requestedPath)
  const stat = fs.statSync(resolvedPath)
  if (!stat.isFile()) throw new Error('目标不是普通文件')
  if (stat.size > maxBytes) throw new Error('文件超过允许的大小')

  const extension = path.extname(resolvedPath).toLowerCase()
  if (!allowedExtensions.has(extension)) {
    throw new Error(`不允许读取 ${extension || '无扩展名'} 文件`)
  }

  return resolvedPath
}

export const resolvePathInside = (rootPath: string, requestedPath: string): string => {
  const root = fs.realpathSync(rootPath)
  const target = fs.realpathSync(requestedPath)
  const relative = path.relative(root, target)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('目标路径不在允许目录中')
  }

  return target
}

export const installWindowSecurityGuards = (window: BrowserWindow): void => {
  const guardNavigation = (event: Electron.Event, targetUrl: string) => {
    if (isTrustedRendererUrl(targetUrl)) return
    event.preventDefault()
    void openExternalUrl(targetUrl)
  }

  window.webContents.on('will-navigate', guardNavigation)
  window.webContents.on('will-redirect', guardNavigation)
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url)
    return { action: 'deny' }
  })
}
