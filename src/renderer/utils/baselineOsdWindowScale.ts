/* ======== newADD start====== */
import {
  WINDOW_SCALE_BASELINE_CHANGE_EVENT,
  WindowScaleTarget,
  calculateWindowZoomFactor
} from './windowScaleBaseline'
import {
  getWindowScaleBaselineStorageKeys,
  readWindowScaleBaseline
} from './windowScaleBaselineStorage'

const REFERENCE_FONT_SIZE = 16
const ZOOM_EPSILON = 0.004
const ZOOM_UPDATE_INTERVAL_MS = 34
const RESIZE_IDLE_DELAY_MS = 120

type RuntimeWindow = Window & {
  __vutronBaselineOsdWindowScaleCleanup__?: () => void
}

const readOsdTarget = (): WindowScaleTarget => {
  try {
    const state = JSON.parse(localStorage.getItem('osdLyric') || '{}')
    return state.type === 'normal' ? 'osd-normal' : 'osd-small'
  } catch {
    return 'osd-small'
  }
}

export const initializeBaselineOsdWindowScale = () => {
  const runtimeWindow = window as RuntimeWindow
  runtimeWindow.__vutronBaselineOsdWindowScaleCleanup__?.()

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
    const target = readOsdTarget()
    const baseline = readWindowScaleBaseline(target)
    const nextZoomFactor = calculateWindowZoomFactor(contentWidth, contentHeight, baseline)

    document.documentElement.style.setProperty(
      '--osd-window-zoom-factor',
      nextZoomFactor.toFixed(4)
    )
    document.documentElement.style.setProperty(
      '--osd-window-effective-reference-font-size',
      `${(nextZoomFactor * REFERENCE_FONT_SIZE).toFixed(2)}px`
    )
    document.documentElement.style.setProperty('--osd-window-min-width', `${baseline.minWidth}px`)
    document.documentElement.style.setProperty('--osd-window-min-height', `${baseline.minHeight}px`)
    document.documentElement.style.setProperty(
      '--osd-window-base-font-size',
      `${baseline.baseFontSize}px`
    )
    document.documentElement.dataset.osdScaleMode = target
    document.documentElement.dataset.osdWindowZoom = nextZoomFactor.toFixed(4)

    if (Math.abs(nextZoomFactor - currentZoomFactor) < ZOOM_EPSILON) {
      return
    }

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
    const target = readOsdTarget()
    const keys = getWindowScaleBaselineStorageKeys(target)

    if (event.key === 'osdLyric' || keys.includes(event.key || '')) {
      pendingUpdate = true
      scheduleUpdate()
    }
  }

  const handleBaselineChange = (event: Event) => {
    const detail = (event as CustomEvent).detail
    const target = readOsdTarget()
    if (detail?.target && detail.target !== target) return
    pendingUpdate = true
    scheduleUpdate()
  }

  updateZoomFactor()
  window.addEventListener('resize', handleResize, { passive: true })
  window.addEventListener('storage', handleStorage)
  window.addEventListener(WINDOW_SCALE_BASELINE_CHANGE_EVENT, handleBaselineChange)

  const cleanup = () => {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(WINDOW_SCALE_BASELINE_CHANGE_EVENT, handleBaselineChange)

    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId)
    }
    if (delayedUpdateTimer !== null) {
      window.clearTimeout(delayedUpdateTimer)
    }
    if (resizeIdleTimer !== null) {
      window.clearTimeout(resizeIdleTimer)
    }

    delete runtimeWindow.__vutronBaselineOsdWindowScaleCleanup__
  }

  runtimeWindow.__vutronBaselineOsdWindowScaleCleanup__ = cleanup
  return cleanup
}
/* =========== newADD end ======== */
