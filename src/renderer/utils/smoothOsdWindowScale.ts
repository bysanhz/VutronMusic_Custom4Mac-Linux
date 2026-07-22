/* ======== newADD start====== */
/**
 * 桌面歌词窗口独立连续缩放。
 *
 * 概述：
 * 使用 Electron webFrame 对桌面歌词 renderer 整体缩放，使歌词、封面、按钮、
 * 间距、圆角和拖拽命中区域使用同一个连续比例。缩放范围与主窗口完全独立。
 */

const SMALL_DESIGN_WIDTH = 700
const SMALL_DESIGN_HEIGHT = 50
const NORMAL_DESIGN_WIDTH = 500
const NORMAL_DESIGN_HEIGHT = 600
const BASE_REFERENCE_FONT_SIZE = 16
const DEFAULT_MIN_FONT_SIZE = 12
const DEFAULT_MAX_FONT_SIZE = 24
const MIN_POSITIVE_FONT_SIZE = 1
const MAX_SHORT_AXIS_SCALE_MULTIPLIER = 1.25
const ZOOM_EPSILON = 0.004
const ZOOM_UPDATE_INTERVAL_MS = 34
const RESIZE_IDLE_DELAY_MS = 120

export const OSD_SCALE_MIN_FONT_SIZE_KEY = 'osdWindowScaleMinFontSize'
export const OSD_SCALE_MAX_FONT_SIZE_KEY = 'osdWindowScaleMaxFontSize'
export const OSD_SCALE_SETTINGS_CHANGE_EVENT = 'osd-window-scale-font-range-change'

type RuntimeWindow = Window & {
  __vutronSmoothOsdWindowScaleCleanup__?: () => void
}

type OsdScaleRange = {
  min: number
  max: number
}

const readPositiveNumber = (key: string, fallback: number) => {
  const raw = localStorage.getItem(key)
  if (raw === null || raw.trim() === '') return fallback

  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.max(MIN_POSITIVE_FONT_SIZE, value)
}

export const readOsdScaleRange = (): OsdScaleRange => {
  const first = readPositiveNumber(OSD_SCALE_MIN_FONT_SIZE_KEY, DEFAULT_MIN_FONT_SIZE)
  const second = readPositiveNumber(OSD_SCALE_MAX_FONT_SIZE_KEY, DEFAULT_MAX_FONT_SIZE)
  return first <= second ? { min: first, max: second } : { min: second, max: first }
}

const readOsdType = () => {
  try {
    const state = JSON.parse(localStorage.getItem('osdLyric') || '{}')
    return state.type === 'normal' ? 'normal' : 'small'
  } catch {
    return 'small'
  }
}

/**
 * 初始化桌面歌词窗口连续缩放。
 *
 * Returns:
 * 清理 resize、storage 和定时器监听的函数。
 */
export const initializeSmoothOsdWindowScale = () => {
  const runtimeWindow = window as RuntimeWindow
  runtimeWindow.__vutronSmoothOsdWindowScaleCleanup__?.()

  if (!window.mainApi?.setZoomFactor || !window.mainApi?.getZoomFactor) {
    return () => undefined
  }

  let animationFrameId: number | null = null
  let delayedUpdateTimer: number | null = null
  let resizeIdleTimer: number | null = null
  let lastZoomUpdateAt = 0
  let isApplyingZoom = false
  let pendingUpdate = false

  const updateZoomFactor = () => {
    if (isApplyingZoom) {
      pendingUpdate = true
      return
    }

    const currentZoomFactor = window.mainApi?.getZoomFactor() || 1
    const contentWidth = Math.max(1, window.innerWidth * currentZoomFactor)
    const contentHeight = Math.max(1, window.innerHeight * currentZoomFactor)
    const type = readOsdType()
    const designWidth = type === 'small' ? SMALL_DESIGN_WIDTH : NORMAL_DESIGN_WIDTH
    const designHeight = type === 'small' ? SMALL_DESIGN_HEIGHT : NORMAL_DESIGN_HEIGHT
    const widthScale = contentWidth / designWidth
    const heightScale = contentHeight / designHeight
    const areaScale = Math.sqrt(widthScale * heightScale)
    const shortAxisGuard = Math.min(widthScale, heightScale) * MAX_SHORT_AXIS_SCALE_MULTIPLIER
    const geometryScale = Math.min(areaScale, shortAxisGuard)

    const range = readOsdScaleRange()
    const minZoomFactor = range.min / BASE_REFERENCE_FONT_SIZE
    const maxZoomFactor = range.max / BASE_REFERENCE_FONT_SIZE
    const nextZoomFactor = Math.min(maxZoomFactor, Math.max(minZoomFactor, geometryScale))

    document.documentElement.style.setProperty(
      '--osd-window-zoom-factor',
      nextZoomFactor.toFixed(4)
    )
    document.documentElement.style.setProperty(
      '--osd-window-effective-reference-font-size',
      `${(nextZoomFactor * BASE_REFERENCE_FONT_SIZE).toFixed(2)}px`
    )

    if (Math.abs(nextZoomFactor - currentZoomFactor) < ZOOM_EPSILON) return

    isApplyingZoom = true
    pendingUpdate = false
    window.mainApi?.setZoomFactor(nextZoomFactor)
    lastZoomUpdateAt = performance.now()

    window.requestAnimationFrame(() => {
      isApplyingZoom = false
      if (pendingUpdate) scheduleUpdate()
    })
  }

  const runScheduledUpdate = () => {
    animationFrameId = null
    const remaining = ZOOM_UPDATE_INTERVAL_MS - (performance.now() - lastZoomUpdateAt)

    if (remaining > 0) {
      if (delayedUpdateTimer === null) {
        delayedUpdateTimer = window.setTimeout(() => {
          delayedUpdateTimer = null
          animationFrameId = window.requestAnimationFrame(runScheduledUpdate)
        }, remaining)
      }
      return
    }

    updateZoomFactor()
  }

  function scheduleUpdate() {
    if (animationFrameId !== null || delayedUpdateTimer !== null) return
    animationFrameId = window.requestAnimationFrame(runScheduledUpdate)
  }

  const handleResize = () => {
    scheduleUpdate()
    if (resizeIdleTimer !== null) window.clearTimeout(resizeIdleTimer)
    resizeIdleTimer = window.setTimeout(() => {
      resizeIdleTimer = null
      pendingUpdate = true
      scheduleUpdate()
    }, RESIZE_IDLE_DELAY_MS)
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === OSD_SCALE_MIN_FONT_SIZE_KEY ||
      event.key === OSD_SCALE_MAX_FONT_SIZE_KEY ||
      event.key === 'osdLyric'
    ) {
      pendingUpdate = true
      scheduleUpdate()
    }
  }

  updateZoomFactor()
  window.addEventListener('resize', handleResize, { passive: true })
  window.addEventListener('storage', handleStorage)
  window.addEventListener(OSD_SCALE_SETTINGS_CHANGE_EVENT, scheduleUpdate)

  const cleanup = () => {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(OSD_SCALE_SETTINGS_CHANGE_EVENT, scheduleUpdate)

    if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId)
    if (delayedUpdateTimer !== null) window.clearTimeout(delayedUpdateTimer)
    if (resizeIdleTimer !== null) window.clearTimeout(resizeIdleTimer)

    delete runtimeWindow.__vutronSmoothOsdWindowScaleCleanup__
  }

  runtimeWindow.__vutronSmoothOsdWindowScaleCleanup__ = cleanup
  return cleanup
}
/* =========== newADD end ======== */
