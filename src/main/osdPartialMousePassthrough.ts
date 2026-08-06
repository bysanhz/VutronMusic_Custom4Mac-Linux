import { app, BrowserWindow, ipcMain, screen, type IpcMainEvent } from 'electron'

const POLL_INTERVAL_MS = 16
const REGION_PADDING_DIP = 2

type NormalizedRegion = {
  enabled: boolean
  x: number
  y: number
  width: number
  height: number
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
  const input = value as Partial<NormalizedRegion>
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
    state.window.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined)
    state.ignoringMouse = ignore
  } catch (error) {
    console.warn('[OSD Passthrough] 切换鼠标穿透状态失败：', error)
  }
}

const isCursorInsideRegion = (state: OsdWindowState): boolean => {
  const region = state.region
  if (!region?.enabled || state.window.isDestroyed() || !state.window.isVisible()) return false

  const bounds = state.window.getBounds()
  const cursor = screen.getCursorScreenPoint()
  const left = bounds.x + bounds.width * region.x - REGION_PADDING_DIP
  const top = bounds.y + bounds.height * region.y - REGION_PADDING_DIP
  const right = left + bounds.width * region.width + REGION_PADDING_DIP * 2
  const bottom = top + bounds.height * region.height + REGION_PADDING_DIP * 2

  return cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom
}

const updateMousePassthrough = (): void => {
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

    // 锁定时：鼠标位于左侧封面控制区则恢复窗口交互；其余歌词区域继续穿透。
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

  const region = normalizeRegion(regionValue)
  const existing = states.get(event.sender.id)
  if (existing) {
    existing.region = region
    existing.window = window
  } else {
    states.set(event.sender.id, {
      window,
      region,
      locked: globalLocked,
      ignoringMouse: null
    })

    window.once('closed', () => {
      states.delete(event.sender.id)
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
  // 原有 OSD 逻辑也会在同一 IPC 中调用 setIgnoreMouseEvents；放到下一个任务中覆盖为局部策略。
  setTimeout(updateMousePassthrough, 0)
})

app.on('before-quit', () => {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  states.clear()
})
