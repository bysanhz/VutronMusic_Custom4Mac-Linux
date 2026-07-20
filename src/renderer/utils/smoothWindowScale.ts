/* ======== newADD start====== */
/**
 * 主窗口全界面连续缩放。
 *
 * 概述：
 * 使用 Electron webFrame 对主窗口中的字体、SVG、图片、按钮、间距、卡片和路由页面
 * 应用同一个连续缩放比例。CSS 只负责容器不足时的自动换行，不再根据 zoomFactor
 * 反向放大任何元素。
 *
 * 详细说明：
 * 1. 以 1080 × 720、16px 为设计基准；
 * 2. 通过窗口面积比例的平方根计算连续缩放目标；
 * 3. 设置页的最小、最大字号没有固定业务上限，仅要求字号为正数；
 * 4. 设置页现有 DOM 只添加稳定的布局 class，不使用 MutationObserver；
 * 5. resize 通过 requestAnimationFrame 合并，并屏蔽 setZoomFactor 自身触发的回调；
 * 6. 独立桌面歌词 BrowserWindow 不受此逻辑影响。
 */

const DESIGN_WIDTH = 1080
const DESIGN_HEIGHT = 720
const BASE_FONT_SIZE = 16
const DEFAULT_MIN_FONT_SIZE = 12
const DEFAULT_MAX_FONT_SIZE = 22
const MIN_POSITIVE_FONT_SIZE = 1
const ZOOM_EPSILON = 0.002
const SETTINGS_CHECK_INTERVAL_MS = 500

const MIN_FONT_SIZE_KEY = 'appWindowScaleMinFontSize'
const MAX_FONT_SIZE_KEY = 'appWindowScaleMaxFontSize'
const LEGACY_FONT_SIZE_KEY = 'appGlobalFontSize'
const SCALE_SETTINGS_CHANGE_EVENT = 'app-window-scale-font-range-change'

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

/**
 * 给设置页现有结构添加明确的布局 class。
 *
 * 这里只检查直接子元素，并且 classList.toggle 在状态不变时不会写 DOM，因此不会形成
 * 之前 MutationObserver 式的更新循环。
 */
const decorateSettingsLayoutClasses = () => {
  const settings = document.querySelector<HTMLElement>('#app .system-settings')
  if (!settings) return false

  settings.classList.add('settings-responsive-layout')

  settings.querySelectorAll<HTMLElement>('.item').forEach((item) => {
    const children = Array.from(item.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
    )
    const hasDirectClass = (className: string) =>
      children.some((child) => child.classList.contains(className))

    const hasPair = hasDirectClass('left') && hasDirectClass('right')
    const hasAppearance = hasDirectClass('appearance')
    const hasColors = hasDirectClass('colors')
    const hasStreamCard = hasDirectClass('stream-item')
    const hasDirectColorCard = hasDirectClass('color') && !hasColors

    item.classList.toggle('settings-pair-item', hasPair && !item.classList.contains('no-flex'))
    item.classList.toggle('settings-appearance-grid', hasAppearance)
    item.classList.toggle('settings-colors-grid', hasColors)
    item.classList.toggle('settings-multi-card-grid', hasStreamCard || hasDirectColorCard)
  })

  return true
}

const updateScaleSettingText = (setting: HTMLElement) => {
  const item = setting.closest<HTMLElement>('.item')
  const title = item?.querySelector<HTMLElement>('.left .title')
  const description = item?.querySelector<HTMLElement>('.left .description')
  const nextTitle = '主界面缩放字体范围'
  const nextDescription = '窗口缩放时，字体、图标、图片、按钮和间距统一限制在此字号范围内'

  item?.classList.add('window-scale-font-range-item', 'settings-pair-item')

  if (title && title.textContent !== nextTitle) title.textContent = nextTitle
  if (description && description.textContent !== nextDescription) {
    description.textContent = nextDescription
  }
}

/**
 * 把设置页原来的单一字号控件转换为最小、最大字号范围控件。
 *
 * Returns:
 * 设置页存在并已完成初始化时返回 true，否则返回 false。
 */
const decorateScaleFontRangeSetting = () => {
  decorateSettingsLayoutClasses()

  const setting = document.querySelector<HTMLElement>(
    '#app .system-settings .app-font-size-setting'
  )
  if (!setting) return false

  updateScaleSettingText(setting)

  const rangeRows = setting.querySelectorAll('.window-scale-font-row')
  if (setting.dataset.windowScaleRangeReady === 'true' && rangeRows.length === 2) {
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

  setting.onclick = (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-scale-action]')
    if (!button || button.disabled) return

    const range = readScaleFontRange()
    const action = button.dataset.scaleAction

    if (action === 'min-decrease') {
      range.min = Math.max(MIN_POSITIVE_FONT_SIZE, range.min - 1)
    }
    if (action === 'min-increase') {
      range.min += 1
      if (range.min > range.max) range.max = range.min
    }
    if (action === 'max-decrease') {
      range.max = Math.max(MIN_POSITIVE_FONT_SIZE, range.max - 1)
      if (range.max < range.min) range.min = range.max
    }
    if (action === 'max-increase') {
      range.max += 1
    }

    saveScaleFontRange(range)
    render()
  }

  render()
  return true
}

const initializeSettingsDecoration = () => {
  decorateScaleFontRangeSetting()

  const settingsCheckTimer = window.setInterval(() => {
    decorateScaleFontRangeSetting()
  }, SETTINGS_CHECK_INTERVAL_MS)

  return () => window.clearInterval(settingsCheckTimer)
}

/**
 * 初始化主窗口连续缩放监听。
 *
 * Returns:
 * 用于移除 resize、设置变化监听和设置页低频检测的清理函数。
 */
export const initializeSmoothWindowScale = () => {
  const runtimeWindow = window as RuntimeWindow
  runtimeWindow.__vutronSmoothWindowScaleCleanup__?.()

  if (!window.mainApi?.setZoomFactor || !window.mainApi?.getZoomFactor) {
    return () => undefined
  }

  // 旧版单独字号会与 webFrame 缩放叠加，因此统一恢复为 16px 设计基准。
  if (Number(localStorage.getItem(LEGACY_FONT_SIZE_KEY)) !== BASE_FONT_SIZE) {
    localStorage.setItem(LEGACY_FONT_SIZE_KEY, String(BASE_FONT_SIZE))
    window.dispatchEvent(new Event('app-global-font-size-change'))
  }

  let animationFrameId: number | null = null
  let isApplyingZoomFactor = false

  const updateZoomFactor = () => {
    animationFrameId = null
    if (isApplyingZoomFactor) return

    const currentZoomFactor = window.mainApi?.getZoomFactor() || 1

    // webFrame 缩放会改变 innerWidth/innerHeight。乘回当前比例得到 BrowserWindow
    // 实际内容区尺寸，避免缩放后再次计算产生反馈振荡。
    const contentWidth = Math.max(1, window.innerWidth * currentZoomFactor)
    const contentHeight = Math.max(1, window.innerHeight * currentZoomFactor)
    const areaScale = Math.sqrt(
      (contentWidth / DESIGN_WIDTH) * (contentHeight / DESIGN_HEIGHT)
    )

    const fontRange = readScaleFontRange()
    const minZoomFactor = fontRange.min / BASE_FONT_SIZE
    const maxZoomFactor = fontRange.max / BASE_FONT_SIZE
    const nextZoomFactor = Math.min(maxZoomFactor, Math.max(minZoomFactor, areaScale))
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

    decorateSettingsLayoutClasses()

    if (Math.abs(nextZoomFactor - currentZoomFactor) < ZOOM_EPSILON) return

    isApplyingZoomFactor = true
    try {
      window.mainApi?.setZoomFactor(nextZoomFactor)
    } finally {
      window.requestAnimationFrame(() => {
        isApplyingZoomFactor = false
        decorateSettingsLayoutClasses()
      })
    }
  }

  const scheduleZoomUpdate = () => {
    if (animationFrameId !== null || isApplyingZoomFactor) return
    animationFrameId = window.requestAnimationFrame(updateZoomFactor)
  }

  const stopSettingsDecoration = initializeSettingsDecoration()

  updateZoomFactor()
  window.addEventListener('resize', scheduleZoomUpdate, { passive: true })
  window.addEventListener(SCALE_SETTINGS_CHANGE_EVENT, scheduleZoomUpdate)

  const cleanup = () => {
    window.removeEventListener('resize', scheduleZoomUpdate)
    window.removeEventListener(SCALE_SETTINGS_CHANGE_EVENT, scheduleZoomUpdate)
    stopSettingsDecoration()

    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }

    delete runtimeWindow.__vutronSmoothWindowScaleCleanup__
  }

  runtimeWindow.__vutronSmoothWindowScaleCleanup__ = cleanup
  return cleanup
}
/* =========== newADD end ======== */
