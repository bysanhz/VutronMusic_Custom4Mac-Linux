import { app, BrowserWindow, ipcMain, screen, type IpcMainEvent } from 'electron'
import store from './store'
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
  lockRegion: NormalizedRegion | null
  autoHidden: boolean
  ignoringMouse: boolean | null
  temporaryIgnoreOverride: boolean | null
  appliedLocked: boolean | null
}

const states = new Map<number, OsdWindowState>()
let pollTimer: ReturnType<typeof setInterval> | null = null

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

const isCursorInsideRegion = (
  state: OsdWindowState,
  region: NormalizedRegion | null
): boolean => {
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
  // Linux 端没有桌面歌词锁定按钮，并且渲染层启动时也强制保持解锁。
  // 若 electron-store 中残留旧的 isLock=true，主进程此前仍会把整个窗口设为鼠标穿透，
  // 直接导致边缘 resize handle 收不到 hover/pointerdown。这里让主进程与 Linux UI 语义一致。
  const locked = process.platform === 'linux' ? false : Boolean(store.get('osdWin.isLock'))

  for (const [webContentsId, state] of states) {
    if (state.window.isDestroyed()) {
      states.delete(webContentsId)
      continue
    }

    if (state.appliedLocked !== locked) {
      state.window.setVisibleOnAllWorkspaces(locked)
      state.appliedLocked = locked
    }

    if (!locked) {
      state.autoHidden = false
      state.temporaryIgnoreOverride = null
      setIgnoreMouse(state, false)
      continue
    }

    if (state.temporaryIgnoreOverride !== null) {
      setIgnoreMouse(state, state.temporaryIgnoreOverride)
      continue
    }

    const insideLockButton = isCursorInsideRegion(state, state.lockRegion)
    const insideVisibleControls =
      !state.autoHidden && isCursorInsideRegion(state, state.region)

    // 锁定后的停留隐藏只保留“解锁”按钮可交互：
    // 左侧封面/播放控制区虽然仍在 DOM 中，但必须和已隐藏歌词一起穿透。
    // 解锁按钮使用独立命中区，因此 macOS 在整个窗口穿透时也能被主进程主动恢复交互。
    setIgnoreMouse(state, !(insideLockButton || insideVisibleControls))
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

const ensureOsdWindowState = (event: IpcMainEvent): OsdWindowState | null => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return null

  const existing = states.get(event.sender.id)
  if (existing) {
    existing.window = window
    return existing
  }

  const state: OsdWindowState = {
    window,
    region: null,
    lockRegion: null,
    autoHidden: false,
    ignoringMouse: null,
    temporaryIgnoreOverride: null,
    appliedLocked: null
  }
  states.set(event.sender.id, state)

  const webContentsId = event.sender.id
  window.once('closed', () => {
    states.delete(webContentsId)
  })

  ensurePollTimer()
  return state
}

const registerControlHitRegion = (event: IpcMainEvent, regionValue: unknown): void => {
  const state = ensureOsdWindowState(event)
  if (!state) return

  state.region = normalizeRegion(regionValue)
  state.ignoringMouse = null
  queueMicrotask(updateMousePassthrough)
}

const registerLockHitRegion = (event: IpcMainEvent, regionValue: unknown): void => {
  const state = ensureOsdWindowState(event)
  if (!state) return

  state.lockRegion = normalizeRegion(regionValue)
  state.ignoringMouse = null
  queueMicrotask(updateMousePassthrough)
}

ipcMain.on('osd-control-hit-region', registerControlHitRegion)
ipcMain.on('osd-lock-hit-region', registerLockHitRegion)

ipcMain.on('osd-auto-hidden', (event, hidden: unknown) => {
  const state = ensureOsdWindowState(event)
  if (!state) return

  state.autoHidden = hidden === true
  state.temporaryIgnoreOverride = null
  state.ignoringMouse = null
  queueMicrotask(updateMousePassthrough)
})

ipcMain.on('updateOsdState', (_event, data: unknown) => {
  if (!data || typeof data !== 'object') return
  const value = data as Record<string, unknown>
  if (typeof value.isLock !== 'boolean') return

  // 主进程 electron-store 是锁定状态的唯一真值来源。
  // updateOsdState 的 store 写入由 IPCs 完成；延迟到本轮事件监听结束后再读取，避免监听顺序竞态。
  for (const state of states.values()) {
    state.temporaryIgnoreOverride = null
    if (!value.isLock) state.autoHidden = false
  }
  invalidateMouseState()
})

ipcMain.on('set-ignore-mouse', (event, ignore: unknown) => {
  const state = states.get(event.sender.id)
  if (!state) return

  state.temporaryIgnoreOverride = Boolean(ignore)
  state.ignoringMouse = null
  setTimeout(updateMousePassthrough, 0)
})

ipcMain.on('mouseleave', (event) => {
  const state = states.get(event.sender.id)
  if (!state) return

  state.temporaryIgnoreOverride = null
  state.ignoringMouse = null
  setTimeout(updateMousePassthrough, 0)
})

ipcMain.on('windowMouseleave', (event) => {
  const state = states.get(event.sender.id)
  if (!state) return

  state.temporaryIgnoreOverride = null
  state.ignoringMouse = null
  setTimeout(updateMousePassthrough, 0)
})

app.on('before-quit', () => {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  states.clear()
})
