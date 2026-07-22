/* ======== newADD start====== */
import router from '../router'

/**
 * 主窗口全界面连续缩放。
 *
 * 概述：
 * 使用 Electron webFrame 对字体、SVG、图片、按钮、间距、卡片和全部路由页面应用
 * 同一个连续缩放比例。设置页的最小/最大字号控件由 Vue Router 路由事件驱动安装，
 * 不再依赖 hashchange、持续轮询或全页面 MutationObserver。
 *
 * 详细说明：
 * 1. 以 1080 × 720、16px 为设计基准；
 * 2. 使用窗口面积比例的平方根计算连续缩放目标；
 * 3. 使用较短轴保护限制极端宽高比，避免窗口很窄但很高时控件仍然过大；
 * 4. 最小、最大字号不设置固定业务范围，仅要求数值为正；
 * 5. 进入设置页面后有限次数等待 Vue 完成挂载，成功后立即停止重试；
 * 6. resize 更新限制在约 30 FPS，并在拖动结束后补一次最终更新；
 * 7. 拖动窗口期间临时关闭高成本视觉动画，停止拖动后自动恢复；
 * 8. 独立桌面歌词 BrowserWindow 不受此逻辑影响。
 */

const DESIGN_WIDTH = 1080
const DESIGN_HEIGHT = 720
const BASE_FONT_SIZE = 16
const DEFAULT_MIN_FONT_SIZE = 12
const DEFAULT_MAX_FONT_SIZE = 22
const MIN_POSITIVE_FONT_SIZE = 1
const MAX_SHORT_AXIS_SCALE_MULTIPLIER = 1.25
const ZOOM_EPSILON = 0.004
const ZOOM_UPDATE_INTERVAL_MS = 32
const RESIZE_IDLE_DELAY_MS = 140
const SETTINGS_DECORATION_RETRY_MS = 80
const SETTINGS_DECORATION_MAX_RETRIES = 24

const MIN_FONT_SIZE_KEY = 'appWindowScaleMinFontSize'
const MAX_FONT_SIZE_KEY = 'appWindowScaleMaxFontSize'
const LEGACY_FONT_SIZE_KEY = 'appGlobalFontSize'
const SCALE_SETTINGS_CHANGE_EVENT = 'app-window-scale-font-range-change'
const WINDOW_RESIZING_CLASS = 'vutron-window-resizing'

type RuntimeWindow = Window & {
  __vutronSmoothWindowScaleCleanup__?: () => void
}

type ScaleFontRange = {
  min: number
  max: number
}

const readStoredFontSize = (key: string, fallback: number) => {
  const storedValue = localStorage.getItem(key)
  if (storedValue === null || storedValue.trim() === '') return fallback

  const value = Number(storedValue)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.max(MIN_POSITIVE_FONT_SIZE, Math.round(value))
}

/**
 * 读取连续缩放使用的字号范围。
 *
 * Returns:
 * 满足 0 < min <= max 的最小、最大字号。
 */
const readScaleFontRange = (): ScaleFontRange => {
  const min = readStoredFontSize(MIN_FONT_SIZE_KEY, DEFAULT_MIN_FONT_SIZE)
  const max = readStoredFontSize(MAX_FONT_SIZE_KEY, DEFAULT_MAX_FONT_SIZE)
  return min <= max ? { min, max } : { min: max, max: min }
}

const saveScaleFontRange = (range: ScaleFontRange) => {
  const min = Math.max(MIN_POSITIVE_FONT_SIZE, Math.round(range.min))
  const max = Math.max(min, Math.round(range.max))

  localStorage.setItem(MIN_FONT_SIZE_KEY, String(min))
  localStorage.setItem(MAX_FONT_SIZE_KEY, String(max))
  window.dispatchEvent(new Event(SCALE_SETTINGS_CHANGE_EVENT))
}

const updateScaleSettingText = (setting: HTMLElement) => {
  const item = setting.closest<HTMLElement>('.item')
  const title = item?.querySelector<HTMLElement>('.left .title')
  const description = item?.querySelector<HTMLElement>('.left .description')

  item?.classList.add('window-scale-font-range-item')

  if (title && title.textContent !== '主界面缩放字体范围') {
    title.textContent = '主界面缩放字体范围'
  }

  const nextDescription =
    '窗口缩放时，字体、图标、图片、按钮和间距会统一缩放，并限制在此字号范围内'
  if (description && description.textContent !== nextDescription) {
    description.textContent = nextDescription
  }
}

/**
 * 将设置页原来的单值字号控件转换为最小/最大字号范围控件。
 *
 * 数值规则：
 * - 不设置固定最大值；
 * - 最小值只保留大于 0 的运行安全约束；
 * - 当最小值超过最大值时同步抬高最大值；
 * - 当最大值低于最小值时同步降低最小值。
 *
 * Returns:
 * 设置页控件存在且已完成初始化时返回 true，否则返回 false。
 */
const mountScaleFontRangeSetting = () => {
  const setting = document.querySelector<HTMLElement>(
    '#app .system-settings .app-font-size-setting'
  )
  if (!setting) return false

  updateScaleSettingText(setting)

  if (
    setting.dataset.windowScaleRangeReady === 'true' &&
    setting.querySelectorAll('.window-scale-font-row').length === 2
  ) {
    return true
  }

  setting.dataset.windowScaleRangeReady = 'true'
  setting.classList.add('window-scale-font-range')
  setting.innerHTML = `
    <div class="window-scale-font-row">
      <span class="window-scale-font-label">最小字号</span>
      <button class="window-scale-font-button" data-scale-action="min-decrease" type="button" aria-label="减小最小字号">−</button>
      <span class="window-scale-font-value" data-scale-value="min"></span>
      <button class="window-scale-font-button" data-scale-action="min-increase" type="button" aria-label="增大最小字号">+</button>
    </div>
    <div class="window-scale-font-row">
      <span class="window-scale-font-label">最大字号</span>
      <button class="window-scale-font-button" data-scale-action="max-decrease" type="button" aria-label="减小最大字号">−</button>
      <span class="window-scale-font-value" data-scale-value="max"></span>
      <button class="window-scale-font-button" data-scale-action="max-increase" type="button" aria-label="增大最大字号">+</button>
    </div>
  `

  const render = () => {
    const range = readScaleFontRange()
    const minValue = setting.querySelector<HTMLElement>('[data-scale-value="min"]')
    const maxValue = setting.querySelector<HTMLElement>('[data-scale-value="max"]')
    const minDecrease = setting.querySelector<HTMLButtonElement>(
      '[data-scale-action="min-decrease"]'
    )

    if (minValue) minValue.textContent = `${range.min}px`
    if (maxValue) maxValue.textContent = `${range.max}px`
    if (minDecrease) minDecrease.disabled = range.min <= MIN_POSITIVE_FONT_SIZE
  }

  setting.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-scale-action]')
    if (!button || button.disabled) return

    const range = readScaleFontRange()
    const action = button.dataset.scaleAction

    if (action === 'min-decrease') {
      range.min = Math.max(MIN_POSITIVE_FONT_SIZE, range.min - 1)
    } else if (action === 'min-increase') {
      range.min += 1
      if (range.min > range.max) range.max = range.min
    } else if (action === 'max-decrease') {
      range.max = Math.max(MIN_POSITIVE_FONT_SIZE, range.max - 1)
      if (range.max < range.min) range.min = range.max
    } else if (action === 'max-increase') {
      range.max += 1
    } else {
      return
    }

    saveScaleFontRange(range)
    render()
  })

  render()
  return true
}

/**
 * 使用 Vue Router 生命周期驱动设置页控件初始化。
 *
 * 路由完成后组件 DOM 可能尚未挂载，因此只进行有限次数短延迟重试；成功后不会保留
 * 任何定时器或 DOM 观察器。
 */
const initializeScaleSettingMount = () => {
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
      if (mountScaleFontRangeSetting()) return
      if (attempt >= SETTINGS_DECORATION_MAX_RETRIES) return

      retryTimer = window.setTimeout(() => {
        retryTimer = null
        scheduleMount(attempt + 1, currentGeneration)
      }, SETTINGS_DECORATION_RETRY_MS)
    })
  }

  const restartMount = () => {
    cancelPendingMount()
    const currentGeneration = generation
    scheduleMount(0, currentGeneration)
  }

  const removeAfterEach = router.afterEach(() => {
    restartMount()
  })

  // 支持应用启动时直接恢复到设置页。
  restartMount()

  return () => {
    cancelPendingMount()
    removeAfterEach()
  }
}

/**
 * 初始化主窗口连续缩放监听。
 *
 * Returns:
 * 用于移除 resize、设置变化监听和设置页初始化任务的清理函数。
 */
export const initializeSmoothWindowScale = () => {
  const runtimeWindow = window as RuntimeWindow
  runtimeWindow.__vutronSmoothWindowScaleCleanup__?.()

  // 设置页控件与 Electron preload 无关，必须优先初始化。
  const stopScaleSettingMount = initializeScaleSettingMount()

  if (!window.mainApi?.setZoomFactor || !window.mainApi?.getZoomFactor) {
    const cleanupWithoutElectron = () => {
      stopScaleSettingMount()
      delete runtimeWindow.__vutronSmoothWindowScaleCleanup__
    }

    runtimeWindow.__vutronSmoothWindowScaleCleanup__ = cleanupWithoutElectron
    return cleanupWithoutElectron
  }

  // 旧版单值字号会与 webFrame 缩放叠加，因此统一恢复为 16px 设计基准。
  if (Number(localStorage.getItem(LEGACY_FONT_SIZE_KEY)) !== BASE_FONT_SIZE) {
    localStorage.setItem(LEGACY_FONT_SIZE_KEY, String(BASE_FONT_SIZE))
    window.dispatchEvent(new Event('app-global-font-size-change'))
  }

  let animationFrameId: number | null = null
  let delayedUpdateTimer: number | null = null
  let resizeIdleTimer: number | null = null
  let lastZoomUpdateAt = 0
  let isApplyingZoomFactor = false
  let pendingZoomUpdate = false

  const updateZoomFactor = () => {
    if (isApplyingZoomFactor) {
      pendingZoomUpdate = true
      return
    }

    const currentZoomFactor = window.mainApi?.getZoomFactor() || 1

    // webFrame 缩放会改变 innerWidth/innerHeight；乘回当前比例得到 BrowserWindow
    // 实际内容区尺寸，避免缩放后再次计算产生反馈振荡。
    const contentWidth = Math.max(1, window.innerWidth * currentZoomFactor)
    const contentHeight = Math.max(1, window.innerHeight * currentZoomFactor)
    const widthScale = contentWidth / DESIGN_WIDTH
    const heightScale = contentHeight / DESIGN_HEIGHT
    const areaScale = Math.sqrt(widthScale * heightScale)
    const shortAxisGuard = Math.min(widthScale, heightScale) * MAX_SHORT_AXIS_SCALE_MULTIPLIER
    const geometryScale = Math.min(areaScale, shortAxisGuard)

    const fontRange = readScaleFontRange()
    const minZoomFactor = fontRange.min / BASE_FONT_SIZE
    const maxZoomFactor = fontRange.max / BASE_FONT_SIZE
    const nextZoomFactor = Math.min(maxZoomFactor, Math.max(minZoomFactor, geometryScale))
    const effectiveFontSize = BASE_FONT_SIZE * nextZoomFactor
    document.documentElement.style.setProperty(
      '--main-window-zoom-factor',
      nextZoomFactor.toFixed(4)
    )
    document.documentElement.style.setProperty(
      '--main-window-effective-font-size',
      `${effectiveFontSize.toFixed(2)}px`
    )
    document.documentElement.style.setProperty(
      '--main-window-min-font-size',
      `${fontRange.min}px`
    )
    document.documentElement.style.setProperty(
      '--main-window-max-font-size',
      `${fontRange.max}px`
    )

    if (Math.abs(nextZoomFactor - currentZoomFactor) < ZOOM_EPSILON) return

    isApplyingZoomFactor = true
    pendingZoomUpdate = false
    window.mainApi?.setZoomFactor(nextZoomFactor)
    lastZoomUpdateAt = performance.now()

    window.requestAnimationFrame(() => {
      isApplyingZoomFactor = false
      if (pendingZoomUpdate) scheduleZoomUpdate()
    })
  }

  const runScheduledZoomUpdate = () => {
    animationFrameId = null

    const elapsed = performance.now() - lastZoomUpdateAt
    const remaining = ZOOM_UPDATE_INTERVAL_MS - elapsed

    if (remaining > 0) {
      if (delayedUpdateTimer === null) {
        delayedUpdateTimer = window.setTimeout(() => {
          delayedUpdateTimer = null
          animationFrameId = window.requestAnimationFrame(runScheduledZoomUpdate)
        }, remaining)
      }
      return
    }

    updateZoomFactor()
  }

  function scheduleZoomUpdate() {
    if (animationFrameId !== null || delayedUpdateTimer !== null) return
    animationFrameId = window.requestAnimationFrame(runScheduledZoomUpdate)
  }

  const handleResize = () => {
    document.documentElement.classList.add(WINDOW_RESIZING_CLASS)
    scheduleZoomUpdate()

    if (resizeIdleTimer !== null) window.clearTimeout(resizeIdleTimer)
    resizeIdleTimer = window.setTimeout(() => {
      resizeIdleTimer = null
      pendingZoomUpdate = true
      scheduleZoomUpdate()

      window.requestAnimationFrame(() => {
        document.documentElement.classList.remove(WINDOW_RESIZING_CLASS)
      })
    }, RESIZE_IDLE_DELAY_MS)
  }

  const handleScaleSettingsChange = () => {
    pendingZoomUpdate = true
    scheduleZoomUpdate()
  }

  updateZoomFactor()
  window.addEventListener('resize', handleResize, { passive: true })
  window.addEventListener(SCALE_SETTINGS_CHANGE_EVENT, handleScaleSettingsChange)

  const cleanup = () => {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener(SCALE_SETTINGS_CHANGE_EVENT, handleScaleSettingsChange)
    stopScaleSettingMount()
    document.documentElement.classList.remove(WINDOW_RESIZING_CLASS)

    if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId)
    if (delayedUpdateTimer !== null) window.clearTimeout(delayedUpdateTimer)
    if (resizeIdleTimer !== null) window.clearTimeout(resizeIdleTimer)

    animationFrameId = null
    delayedUpdateTimer = null
    resizeIdleTimer = null
    delete runtimeWindow.__vutronSmoothWindowScaleCleanup__
  }

  runtimeWindow.__vutronSmoothWindowScaleCleanup__ = cleanup
  return cleanup
}
/* =========== newADD end ======== */
