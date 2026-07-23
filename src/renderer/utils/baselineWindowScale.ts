/* ======== newADD start====== */
import router from '../router'
import {
  WINDOW_SCALE_BASELINE_CHANGE_EVENT,
  WindowScaleBaseline,
  calculateWindowZoomFactor
} from '@/shared/windowScaleBaseline'
import {
  readWindowScaleBaseline,
  saveWindowScaleBaseline,
  syncWindowMinimumSize
} from './windowScaleBaselineStorage'

const TARGET = 'main' as const
const LEGACY_FONT_SIZE_KEY = 'appGlobalFontSize'
const REFERENCE_FONT_SIZE = 16
const ZOOM_EPSILON = 0.004
const ZOOM_UPDATE_INTERVAL_MS = 32
const RESIZE_IDLE_DELAY_MS = 140
const SETTINGS_RETRY_MS = 80
const SETTINGS_MAX_RETRIES = 24
const WINDOW_RESIZING_CLASS = 'vutron-window-resizing'

type RuntimeWindow = Window & {
  __vutronBaselineWindowScaleCleanup__?: () => void
}

type BaselineField = keyof WindowScaleBaseline

const FIELD_CONFIG: Record<
  BaselineField,
  {
    label: string
    unit: string
    step: number
  }
> = {
  minWidth: {
    label: '最小窗口宽度',
    unit: 'px',
    step: 20
  },
  minHeight: {
    label: '最小窗口高度',
    unit: 'px',
    step: 20
  },
  baseFontSize: {
    label: '基准字号',
    unit: 'px',
    step: 1
  }
}

const updateSettingText = (setting: HTMLElement) => {
  const item = setting.closest<HTMLElement>('.item')
  const title = item?.querySelector<HTMLElement>('.left .title')
  const description = item?.querySelector<HTMLElement>('.left .description')

  item?.classList.add('window-scale-font-range-item')

  if (title) title.textContent = '主窗口缩放基准'
  if (description) {
    description.textContent =
      '窗口达到设定的最小尺寸时使用基准字号；继续放大时，字体、封面、图标、按钮、间距和圆角会按同一比例缩放'
  }
}

const createFieldRow = (field: BaselineField) => {
  const config = FIELD_CONFIG[field]
  return `
    <div class="window-scale-font-row" data-baseline-field="${field}">
      <span class="window-scale-font-label">${config.label}</span>
      <button
        class="window-scale-font-button"
        data-baseline-action="decrease"
        type="button"
        aria-label="减小${config.label}"
      >−</button>
      <span class="window-scale-font-value" data-baseline-value="${field}"></span>
      <button
        class="window-scale-font-button"
        data-baseline-action="increase"
        type="button"
        aria-label="增大${config.label}"
      >+</button>
    </div>
  `
}

const mountBaselineSetting = () => {
  const setting = document.querySelector<HTMLElement>(
    '#app .system-settings .app-font-size-setting'
  )
  if (!setting) return false

  updateSettingText(setting)

  if (setting.dataset.windowScaleBaselineReady === 'true') {
    syncWindowMinimumSize(TARGET, readWindowScaleBaseline(TARGET))
    return true
  }

  setting.dataset.windowScaleBaselineReady = 'true'
  setting.classList.add('window-scale-font-range')
  setting.innerHTML = (
    Object.keys(FIELD_CONFIG) as BaselineField[]
  )
    .map(createFieldRow)
    .join('')

  const render = () => {
    const baseline = readWindowScaleBaseline(TARGET)

    for (const field of Object.keys(FIELD_CONFIG) as BaselineField[]) {
      const value = setting.querySelector<HTMLElement>(
        `[data-baseline-value="${field}"]`
      )
      if (value) {
        value.textContent = `${baseline[field]}${FIELD_CONFIG[field].unit}`
      }
    }
  }

  setting.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-baseline-action]'
    )
    const row = button?.closest<HTMLElement>('[data-baseline-field]')
    const field = row?.dataset.baselineField as BaselineField | undefined
    if (!button || !field) return

    const baseline = readWindowScaleBaseline(TARGET)
    const step = FIELD_CONFIG[field].step
    const direction =
      button.dataset.baselineAction === 'decrease' ? -1 : 1

    baseline[field] += step * direction
    saveWindowScaleBaseline(TARGET, baseline)
    render()
  })

  const baseline = readWindowScaleBaseline(TARGET)
  syncWindowMinimumSize(TARGET, baseline)
  render()
  return true
}

const initializeSettingMount = () => {
  let retryTimer: number | null = null
  let retryFrame: number | null = null
  let generation = 0

  const cancelPendingMount = () => {
    generation += 1

    if (retryTimer !== null) {
      window.clearTimeout(retryTimer)
      retryTimer = null
    }
    if (retryFrame !== null) {
      window.cancelAnimationFrame(retryFrame)
      retryFrame = null
    }
  }

  const scheduleMount = (attempt: number, currentGeneration: number) => {
    if (currentGeneration !== generation) return

    retryFrame = window.requestAnimationFrame(() => {
      retryFrame = null
      if (currentGeneration !== generation) return
      if (mountBaselineSetting()) return
      if (attempt >= SETTINGS_MAX_RETRIES) return

      retryTimer = window.setTimeout(() => {
        retryTimer = null
        scheduleMount(attempt + 1, currentGeneration)
      }, SETTINGS_RETRY_MS)
    })
  }

  const restartMount = () => {
    cancelPendingMount()
    scheduleMount(0, generation)
  }

  const removeAfterEach = router.afterEach(restartMount)
  restartMount()

  return () => {
    cancelPendingMount()
    removeAfterEach()
  }
}

export const initializeBaselineWindowScale = () => {
  const runtimeWindow = window as RuntimeWindow
  runtimeWindow.__vutronBaselineWindowScaleCleanup__?.()

  const stopSettingMount = initializeSettingMount()

  if (!window.mainApi?.setZoomFactor || !window.mainApi?.getZoomFactor) {
    const cleanupWithoutElectron = () => {
      stopSettingMount()
      delete runtimeWindow.__vutronBaselineWindowScaleCleanup__
    }
    runtimeWindow.__vutronBaselineWindowScaleCleanup__ =
      cleanupWithoutElectron
    return cleanupWithoutElectron
  }

  if (Number(localStorage.getItem(LEGACY_FONT_SIZE_KEY)) !== REFERENCE_FONT_SIZE) {
    localStorage.setItem(LEGACY_FONT_SIZE_KEY, String(REFERENCE_FONT_SIZE))
    window.dispatchEvent(new Event('app-global-font-size-change'))
  }

  syncWindowMinimumSize(TARGET, readWindowScaleBaseline(TARGET))

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
    const contentWidth = Math.max(
      1,
      window.innerWidth * currentZoomFactor
    )
    const contentHeight = Math.max(
      1,
      window.innerHeight * currentZoomFactor
    )
    const baseline = readWindowScaleBaseline(TARGET)
    const nextZoomFactor = calculateWindowZoomFactor(
      contentWidth,
      contentHeight,
      baseline
    )

    document.documentElement.style.setProperty(
      '--main-window-zoom-factor',
      nextZoomFactor.toFixed(4)
    )
    document.documentElement.style.setProperty(
      '--main-window-effective-font-size',
      `${(nextZoomFactor * REFERENCE_FONT_SIZE).toFixed(2)}px`
    )
    document.documentElement.style.setProperty(
      '--main-window-min-width',
      `${baseline.minWidth}px`
    )
    document.documentElement.style.setProperty(
      '--main-window-min-height',
      `${baseline.minHeight}px`
    )
    document.documentElement.style.setProperty(
      '--main-window-base-font-size',
      `${baseline.baseFontSize}px`
    )

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
    const remaining =
      ZOOM_UPDATE_INTERVAL_MS - (performance.now() - lastZoomUpdateAt)

    if (remaining > 0) {
      if (delayedUpdateTimer === null) {
        delayedUpdateTimer = window.setTimeout(() => {
          delayedUpdateTimer = null
          animationFrameId = window.requestAnimationFrame(
            runScheduledUpdate
          )
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
    document.documentElement.classList.add(WINDOW_RESIZING_CLASS)
    scheduleUpdate()

    if (resizeIdleTimer !== null) window.clearTimeout(resizeIdleTimer)
    resizeIdleTimer = window.setTimeout(() => {
      resizeIdleTimer = null
      pendingUpdate = true
      scheduleUpdate()

      window.requestAnimationFrame(() => {
        document.documentElement.classList.remove(WINDOW_RESIZING_CLASS)
      })
    }, RESIZE_IDLE_DELAY_MS)
  }

  const handleBaselineChange = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (detail?.target && detail.target !== TARGET) return
    pendingUpdate = true
    scheduleUpdate()
  }

  updateZoomFactor()
  window.addEventListener('resize', handleResize, { passive: true })
  window.addEventListener(
    WINDOW_SCALE_BASELINE_CHANGE_EVENT,
    handleBaselineChange
  )

  const cleanup = () => {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener(
      WINDOW_SCALE_BASELINE_CHANGE_EVENT,
      handleBaselineChange
    )
    stopSettingMount()
    document.documentElement.classList.remove(WINDOW_RESIZING_CLASS)

    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId)
    }
    if (delayedUpdateTimer !== null) {
      window.clearTimeout(delayedUpdateTimer)
    }
    if (resizeIdleTimer !== null) {
      window.clearTimeout(resizeIdleTimer)
    }

    delete runtimeWindow.__vutronBaselineWindowScaleCleanup__
  }

  runtimeWindow.__vutronBaselineWindowScaleCleanup__ = cleanup
  return cleanup
}
/* =========== newADD end ======== */
