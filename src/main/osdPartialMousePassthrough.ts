import { app, BrowserWindow, ipcMain, screen, type IpcMainEvent } from 'electron'
import { isPointInsideRectangle } from './osdHitRegion'

const POLL_INTERVAL_MS = 16
const REGION_PADDING_DIP = 2

type NormalizedRegion = {
  enabled: boolean
  x: number
  y: number
  width: number
  height: number
}

type RegionPayload = Partial<NormalizedRegion> & {
  locked?: boolean
}

type OsdWindowState = {
  window: BrowserWindow
  region: NormalizedRegion | null
  locked: boolean
  ignoringMouse: boolean | null
}

const states = new Map<number, OsdWindowState>()
let pollTimer: NodeJS.Timeout | null = null
let globalLocked = false

const clampUnit = (value: unknown): number => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.min(1, Math.max(0, number))
}

const normalizeRegion = (value: unknown): NormalizedRegion | null => {
  if (!value || typeof value !== 'object') return null
  const input = value as RegionPayload
  const x = clampUnit(input.x)
  const y = clampUnit(input.y)
  const width = clampUnit(input.width)
  const height = clampUnit(input.height)

  if (!input.enabled || width <= 0 || height <= 0) {
    return { enabled: false, x, y, width, height }
  }

  return {
    enabled: true,
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y)
  }
}

const setIgnoreMouse = (state: OsdWindowState, ignore: boolean): void => {
  if (state.window.isDestroyed() || state.ignoringMouse === ignore) return

  try {
    if (ignore && process.platform === 'win32') {
      state.window.setIgnoreMouseEvents(true, { forward: true })
    } else {
      state.window.setIgnoreMouseEvents(ignore)
    }
    state.ignoringMouse = ignore
  } catch (error) {
    console.warn('[OSD Passthrough] 切换鼠标穿透状态失败：', error)
  }
}

const invalidateMouseState = (): void => {
  for (const state of states.values()) {
    state.ignoringMouse = null
  }
  setTimeout(updateMousePassthrough, 0)
}

const isCursorInsideRegion = (state: OsdWindowState): boolean => {
  const region = state.region
  if (!region?.enabled || state.window.isDestroyed() || !state.window.isVisible()) return false

  const bounds = state.window.getBounds()
  const cursor = screen.getCursorScreenPoint()
  return isPointInsideRectangle(
    cursor,
    {
      x: bounds.x + bounds.width * region.x,
      y: bounds.y + bounds.height * region.y,
      width: bounds.width * region.width,
      height: bounds.height * region.height
    },
    REGION_PADDING_DIP
  )
}

function updateMousePassthrough(): void {
  for (const [webContentsId, state] of states) {
    if (state.window.isDestroyed()) {
      states.delete(webContentsId)
      continue
    }

    state.locked = globalLocked
    if (!state.locked) {
      setIgnoreMouse(state, false)
      continue
    }

    if (!state.region?.enabled) {
      // 普通模式或左侧控件被隐藏时，继续使用原项目的完整穿透/解锁按钮逻辑。
      state.ignoringMouse = null
      continue
    }

    // 紧凑模式锁定时：左侧封面控制区恢复交互，其余歌词区域继续穿透。
    setIgnoreMouse(state, !isCursorInsideRegion(state))
  }

  if (states.size === 0 && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const ensurePollTimer = (): void => {
  if (pollTimer) return
  pollTimer = setInterval(updateMousePassthrough, POLL_INTERVAL_MS)
  pollTimer.unref?.()
}

const registerOsdWindow = (event: IpcMainEvent, regionValue: unknown): void => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return

  const payload =
    regionValue && typeof regionValue === 'object' ? (regionValue as RegionPayload) : null
  if (typeof payload?.locked === 'boolean') {
    globalLocked = payload.locked
  }

  const region = normalizeRegion(regionValue)
  const existing = states.get(event.sender.id)
  if (existing) {
    existing.region = region
    existing.window = window
    existing.ignoringMouse = null
  } else {
    states.set(event.sender.id, {
      window,
      region,
      locked: globalLocked,
      ignoringMouse: null
    })

    const webContentsId = event.sender.id
    window.once('closed', () => {
      states.delete(webContentsId)
    })
  }

  ensurePollTimer()
  queueMicrotask(updateMousePassthrough)
}

ipcMain.on('osd-control-hit-region', registerOsdWindow)

ipcMain.on('updateOsdState', (_event, data: unknown) => {
  if (!data || typeof data !== 'object') return
  const value = data as Record<string, unknown>
  if (typeof value.isLock !== 'boolean') return

  globalLocked = value.isLock
  // 原有 OSD 逻辑也会在同一 IPC 中调用 setIgnoreMouseEvents；清除缓存后再覆盖为局部策略。
  invalidateMouseState()
})

// 这些旧 IPC 会直接改写 BrowserWindow 的穿透状态；监听后清除缓存，避免局部策略被覆盖。
ipcMain.on('set-ignore-mouse', invalidateMouseState)
ipcMain.on('mouseleave', invalidateMouseState)
ipcMain.on('windowMouseleave', invalidateMouseState)

app.on('before-quit', () => {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  states.clear()
})
