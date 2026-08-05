import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import { isPathInside } from './validation'
import { assertPublicRemoteUrl } from './remoteUrl'

const INSTALL_KEY = '__vutronPathIpcGuardInstalled'
const LOCAL_RESOURCE_GRANTS_KEY = 'security.localResourceGrants'
const SAFE_LIST_EXTENSIONS = new Set([
  'mp3',
  'aiff',
  'aif',
  'flac',
  'alac',
  'm4a',
  'aac',
  'wav',
  'opus',
  'ogg',
  'mp4',
  'webm',
  'mov',
  'm4v',
  'mkv',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'avif',
  'json',
  'lrc'
])

type LocalResourceGrant = {
  path: string
  type: 'file' | 'directory'
}

type PathGuardGlobal = typeof globalThis & Record<string, any>

const realpathIfPresent = async (value: string): Promise<string | null> => {
  if (!value || value.includes('\0')) return null
  try {
    return await fs.promises.realpath(value)
  } catch {
    return null
  }
}

const getStoredGrants = async (): Promise<LocalResourceGrant[]> => {
  const { default: store } = await import('../store')
  const value = store.get(LOCAL_RESOURCE_GRANTS_KEY)
  if (!Array.isArray(value)) return []

  return value.filter(
    (item): item is LocalResourceGrant =>
      Boolean(
        item &&
          typeof item.path === 'string' &&
          (item.type === 'file' || item.type === 'directory')
      )
  )
}

const getLocalTrackFilesAndDirectories = async (): Promise<{
  files: Set<string>
  directories: Set<string>
}> => {
  const { db, Tables } = await import('../db')
  const files = new Set<string>()
  const directories = new Set<string>()

  for (const row of db.findAll(Tables.Track) as Array<{ json?: string }>) {
    try {
      const track = JSON.parse(row.json || '{}') as {
        filePath?: string
        url?: string
        cache?: boolean
      }
      const candidates = [track.filePath, track.cache ? track.url : undefined]
      for (const candidate of candidates) {
        if (!candidate) continue
        const resolved = await realpathIfPresent(candidate)
        if (!resolved) continue
        files.add(resolved)
        directories.add(path.dirname(resolved))
      }
    } catch {
      // Malformed cache rows are ignored; the database layer reports structural failures.
    }
  }

  return { files, directories }
}

const getStaticRoots = async (): Promise<string[]> => {
  const candidates = [
    app.getPath('music'),
    app.getAppPath(),
    process.resourcesPath,
    path.join(app.getPath('userData'), 'audioCache'),
    path.join(app.getPath('userData'), 'screenshots')
  ]
  const roots = await Promise.all(candidates.map(realpathIfPresent))
  return roots.filter((item): item is string => item !== null)
}

const isGrantedPath = async (
  value: string,
  expectedType: 'file' | 'directory' | 'either'
): Promise<boolean> => {
  const resolved = await realpathIfPresent(value)
  if (!resolved) return false

  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(resolved)
  } catch {
    return false
  }
  if (expectedType === 'file' && !stat.isFile()) return false
  if (expectedType === 'directory' && !stat.isDirectory()) return false
  if (expectedType === 'either' && !stat.isFile() && !stat.isDirectory()) return false

  const grants = await getStoredGrants()
  if (
    grants.some((grant) =>
      grant.type === 'file' ? grant.path === resolved : isPathInside(resolved, grant.path)
    )
  ) {
    return true
  }

  const { files, directories } = await getLocalTrackFilesAndDirectories()
  if (files.has(resolved) || directories.has(resolved)) return true

  const roots = await getStaticRoots()
  return roots.some((root) => isPathInside(resolved, root))
}

const validateExtensions = (extensions: unknown): string[] => {
  if (!Array.isArray(extensions) || extensions.length > 32) {
    throw new Error('文件扩展名列表无效')
  }

  const normalized = extensions.map((item) => String(item).toLowerCase().replace(/^\./, ''))
  if (normalized.some((extension) => !SAFE_LIST_EXTENSIONS.has(extension))) {
    throw new Error('请求了不允许枚举的文件类型')
  }
  return normalized
}

const validatePathArguments = async (channel: string, args: unknown[]): Promise<unknown[]> => {
  if (channel === 'msgScanLocalMusic') {
    const data = args[0] as { filePath?: unknown } | undefined
    const directories = Array.isArray(data?.filePath) ? data.filePath : []
    if (
      !directories.length ||
      directories.some(
        (directory) => typeof directory !== 'string' || !isGrantedPath(directory, 'directory')
      )
    ) {
      const results = await Promise.all(
        directories.map((directory) =>
          typeof directory === 'string' ? isGrantedPath(directory, 'directory') : false
        )
      )
      if (!results.length || results.some((allowed) => !allowed)) {
        throw new Error('本地音乐扫描目录未获得授权')
      }
    }
  } else if (channel === 'getFilesInFolder') {
    const folderPath = args[0]
    if (typeof folderPath !== 'string' || !(await isGrantedPath(folderPath, 'directory'))) {
      throw new Error('文件枚举目录未获得授权')
    }
    args[1] = validateExtensions(args[1])
  } else if (channel === 'msgCheckFileExist') {
    const candidates = Array.isArray(args[0]) ? args[0] : []
    const results = await Promise.all(
      candidates.map((candidate) =>
        typeof candidate === 'string' ? isGrantedPath(candidate, 'either') : false
      )
    )
    if (results.some((allowed) => !allowed)) {
      throw new Error('拒绝检查未授权路径')
    }
  } else if (channel === 'msgShowInFolder') {
    const value = args[0]
    if (typeof value !== 'string' || !(await isGrantedPath(value, 'file'))) {
      throw new Error('拒绝显示未授权文件')
    }
  } else if (channel === 'write-cover') {
    const data = args[0] as { filePath?: unknown; currentPlayingPath?: unknown; picUrl?: unknown }
    for (const value of [data?.filePath, data?.currentPlayingPath]) {
      if (value && (typeof value !== 'string' || !(await isGrantedPath(value, 'file')))) {
        throw new Error('拒绝修改未授权的音频文件')
      }
    }

    if (typeof data?.picUrl === 'string' && data.picUrl) {
      await assertPublicRemoteUrl(data.picUrl)
    }
  }

  return args
}

const installPathIpcGuard = (): void => {
  const target = ipcMain as typeof ipcMain & PathGuardGlobal
  if (target[INSTALL_KEY]) return
  target[INSTALL_KEY] = true

  const guardedOn = ipcMain.on.bind(ipcMain)
  const guardedHandle = ipcMain.handle.bind(ipcMain)

  target.on = (channel: string, listener: (...args: any[]) => unknown) =>
    guardedOn(channel, async (event: IpcMainEvent, ...args: unknown[]) => {
      try {
        const validatedArgs = await validatePathArguments(channel, args)
        return await listener(event, ...validatedArgs)
      } catch (error) {
        console.warn(`[Security] 已阻止文件系统 IPC: ${channel}`, error)
      }
    })

  target.handle = (channel: string, listener: (...args: any[]) => unknown) =>
    guardedHandle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const validatedArgs = await validatePathArguments(channel, args)
      return await listener(event, ...validatedArgs)
    })
}

installPathIpcGuard()
