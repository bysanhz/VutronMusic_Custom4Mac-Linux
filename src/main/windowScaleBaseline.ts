/* ======== newADD start====== */
import { BrowserWindow, ipcMain } from 'electron'

export type WindowScaleTarget = 'main' | 'osd-small' | 'osd-normal'

export type WindowScaleBaseline = {
  minWidth: number
  minHeight: number
  baseFontSize: number
}

export const DEFAULT_WINDOW_SCALE_BASELINES: Record<
  WindowScaleTarget,
  WindowScaleBaseline
> = {
  main: {
    minWidth: 810,
    minHeight: 540,
    baseFontSize: 12
  },
  'osd-small': {
    minWidth: 420,
    minHeight: 50,
    baseFontSize: 12
  },
  'osd-normal': {
    minWidth: 360,
    minHeight: 400,
    baseFontSize: 12
  }
}

const normalizeDimension = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(1, Math.round(parsed))
}

const normalizeFontSize = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.round(parsed * 100) / 100
}

export const getDefaultWindowScaleBaseline = (
  target: WindowScaleTarget
): WindowScaleBaseline => {
  return { ...DEFAULT_WINDOW_SCALE_BASELINES[target] }
}

export const sanitizeWindowScaleBaseline = (
  target: WindowScaleTarget,
  value: Partial<WindowScaleBaseline> | null | undefined
): WindowScaleBaseline => {
  const fallback = DEFAULT_WINDOW_SCALE_BASELINES[target]

  return {
    minWidth: normalizeDimension(value?.minWidth, fallback.minWidth),
    minHeight: normalizeDimension(value?.minHeight, fallback.minHeight),
    baseFontSize: normalizeFontSize(
      value?.baseFontSize,
      fallback.baseFontSize
    )
  }
}

type CalibrationSession = {
  windowId: number
  bounds: Electron.Rectangle
  minimumSize: [number, number]
  resizable: boolean
  maximized: boolean
  fullScreen: boolean
}

type CalibrationPayload = {
  target: WindowScaleTarget
  baseline?: Partial<WindowScaleBaseline>
  action?: 'commit' | 'cancel'
}

const CALIBRATION_LISTENERS_KEY =
  '__VUTRON_WINDOW_SCALE_CALIBRATION_LISTENERS__'
const calibrationSessions = new Map<WindowScaleTarget, CalibrationSession>()

const findDesktopLyricWindow = () => {
  return (
    BrowserWindow.getAllWindows().find(
      (window) => window.getTitle() === '桌面歌词'
    ) || null
  )
}

const resolveCalibrationWindow = (
  senderWindow: BrowserWindow | null,
  target: WindowScaleTarget
) => {
  if (target === 'main') return senderWindow
  return findDesktopLyricWindow()
}

const captureCalibrationSession = (
  target: WindowScaleTarget,
  window: BrowserWindow
) => {
  const existing = calibrationSessions.get(target)
  if (existing?.windowId === window.id) return existing

  const session: CalibrationSession = {
    windowId: window.id,
    bounds: window.getBounds(),
    minimumSize: window.getMinimumSize(),
    resizable: window.isResizable(),
    maximized: window.isMaximized(),
    fullScreen: window.isFullScreen()
  }

  calibrationSessions.set(target, session)
  window.once('closed', () => {
    const current = calibrationSessions.get(target)
    if (current?.windowId === window.id) {
      calibrationSessions.delete(target)
    }
  })
  return session
}

const previewCalibrationBaseline = (
  senderWindow: BrowserWindow | null,
  payload: CalibrationPayload
) => {
  const target = payload.target
  const window = resolveCalibrationWindow(senderWindow, target)
  if (!window || window.isDestroyed()) return

  const baseline = sanitizeWindowScaleBaseline(target, payload.baseline)
  captureCalibrationSession(target, window)

  if (window.isFullScreen()) window.setFullScreen(false)
  if (window.isMaximized()) window.unmaximize()

  const bounds = window.getBounds()
  window.setMinimumSize(1, 1)
  window.setResizable(false)
  window.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: baseline.minWidth,
    height: baseline.minHeight
  })
}

const finishCalibration = (
  senderWindow: BrowserWindow | null,
  payload: CalibrationPayload
) => {
  const target = payload.target
  const window = resolveCalibrationWindow(senderWindow, target)
  const session = calibrationSessions.get(target)

  if (payload.action === 'commit') {
    if (window && !window.isDestroyed()) {
      const baseline = sanitizeWindowScaleBaseline(target, payload.baseline)
      window.setMinimumSize(baseline.minWidth, baseline.minHeight)
      window.setResizable(true)
    }
    calibrationSessions.delete(target)
    return
  }

  if (!window || window.isDestroyed() || !session) {
    calibrationSessions.delete(target)
    return
  }

  window.setMinimumSize(...session.minimumSize)
  window.setResizable(session.resizable)
  window.setBounds(session.bounds)

  if (session.maximized) window.maximize()
  if (session.fullScreen) window.setFullScreen(true)
  calibrationSessions.delete(target)
}

const installCalibrationListeners = () => {
  ipcMain.on(
    'preview-window-scale-baseline',
    (event, payload: CalibrationPayload) => {
      previewCalibrationBaseline(
        BrowserWindow.fromWebContents(event.sender),
        payload
      )
    }
  )

  ipcMain.on(
    'finish-window-scale-calibration',
    (event, payload: CalibrationPayload) => {
      finishCalibration(
        BrowserWindow.fromWebContents(event.sender),
        payload
      )
    }
  )
}

const runtimeGlobal = globalThis as Record<string, unknown>
if (!runtimeGlobal[CALIBRATION_LISTENERS_KEY]) {
  runtimeGlobal[CALIBRATION_LISTENERS_KEY] = true
  installCalibrationListeners()
}
/* =========== newADD end ======== */
