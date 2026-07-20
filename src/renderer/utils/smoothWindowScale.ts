/* ======== newADD start====== */
/**
 * 主窗口全界面连续缩放。
 *
 * 概述：
 * 使用 Electron webFrame 统一缩放字体、SVG、图片、按钮、间距与全部路由页面。
 * 设置页布局使用显式 class 和基于物理尺寸换算的 Grid 参数，避免依赖 :has()
 * 选择器后在部分 Electron/Chromium 环境中不生效。
 *
 * 详细说明：
 * 1. 以 1080 × 720、16px 为设计基准；
 * 2. 窗口面积比例的平方根作为连续缩放目标；
 * 3. 最小字号只要求大于 0，最大字号没有固定上限；
 * 4. 设置页在窄窗口中自动把字号卡片、外观、颜色和服务卡片排成多行；
 * 5. 设置页保留 620px 的物理最小内容宽度，剩余内容可通过底部辅助条横向移动；
 * 6. resize 使用 requestAnimationFrame 合并，并屏蔽 setZoomFactor 自身回调；
 * 7. 该逻辑只运行在主窗口，不影响独立桌面歌词窗口。
 */

const DESIGN_WIDTH = 1080
const DESIGN_HEIGHT = 720
const BASE_FONT_SIZE = 16
const DEFAULT_MIN_FONT_SIZE = 12
const DEFAULT_MAX_FONT_SIZE = 22
const MIN_POSITIVE_FONT_SIZE = 1
const SETTINGS_MIN_PHYSICAL_WIDTH = 620
const SETTINGS_PAIR_MIN_PHYSICAL_WIDTH = 220
const SETTINGS_RANGE_MIN_PHYSICAL_WIDTH = 270
const SETTINGS_APPEARANCE_MIN_PHYSICAL_WIDTH = 185
const SETTINGS_COLOR_MIN_PHYSICAL_WIDTH = 108
const SETTINGS_CARD_MIN_PHYSICAL_WIDTH = 180
const ZOOM_EPSILON = 0.002
const SETTINGS_CHECK_INTERVAL_MS = 500

const MIN_FONT_SIZE_KEY = 'appWindowScaleMinFontSize'
const MAX_FONT_SIZE_KEY = 'appWindowScaleMaxFontSize'
const LEGACY_FONT_SIZE_KEY = 'appGlobalFontSize'
const SCALE_SETTINGS_CHANGE_EVENT = 'app-window-scale-font-range-change'
const SETTINGS_STYLE_ID = 'vutron-window-scale-font-range-style'

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
 * 给设置页现有 DOM 添加稳定的显式布局 class。
 *
 * 这里只读取直接子元素并按实际结构添加 class；已经存在的 class 不会重复写入，
 * 因此不会形成 MutationObserver 式的更新循环。
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

/**
 * 注入设置页布局和字号范围控件样式。
 */
const ensureSettingsStyle = () => {
  if (document.getElementById(SETTINGS_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = SETTINGS_STYLE_ID
  style.textContent = `
    #app #main {
      overflow-x: auto !important;
      overscroll-behavior: contain;
    }

    #app #main::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
    }

    #app .system-settings.settings-responsive-layout {
      width: 100%;
      min-width: var(--settings-page-min-logical-width, 900px);
      box-sizing: border-box;
    }

    #app .system-settings.settings-responsive-layout .main-container {
      min-width: 0;
      padding-right: clamp(14px, 3vw, 30px) !important;
      padding-left: clamp(104px, 16vw, 160px) !important;
    }

    #app .system-settings.settings-responsive-layout .main-container > .container {
      min-width: 0;
      overflow: visible;
      padding-bottom: 24px;
    }

    #app .system-settings.settings-responsive-layout .slideBar {
      left: clamp(12px, 2.5vw, 28px) !important;
      width: clamp(82px, 13vw, 120px) !important;
      max-width: none !important;
    }

    #app .system-settings .settings-pair-item {
      display: grid !important;
      grid-template-columns: repeat(
        auto-fit,
        minmax(var(--settings-pair-column-min, 220px), 1fr)
      );
      align-items: center;
      column-gap: clamp(14px, 3vw, 34px);
      row-gap: 10px;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    #app .system-settings .settings-pair-item > .left {
      min-width: 0;
      padding-right: 0 !important;
    }

    #app .system-settings .settings-pair-item > .right {
      min-width: 0;
      max-width: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      justify-self: stretch;
      flex-wrap: wrap;
      gap: 8px;
    }

    #app .system-settings .item .title {
      overflow: visible !important;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.4;
      -webkit-line-clamp: unset !important;
      line-clamp: unset !important;
    }

    #app .system-settings .item .description {
      margin-top: 4px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    #app .system-settings :is(select, input, button, .custom-select) {
      max-width: 100%;
      box-sizing: border-box;
    }

    #app .system-settings .window-scale-font-range-item {
      grid-template-columns: repeat(
        auto-fit,
        minmax(var(--settings-range-column-min, 270px), 1fr)
      ) !important;
      align-items: center !important;
      gap: clamp(14px, 3vw, 30px) !important;
      margin: 8px 0 18px !important;
      padding: clamp(11px, 2vw, 16px) !important;
      border-radius: 14px;
      background: color-mix(in srgb, var(--color-secondary-bg), transparent 42%);
    }

    #app .system-settings .window-scale-font-range-item > .left .title {
      font-weight: 650;
      opacity: 0.9;
    }

    #app .system-settings .window-scale-font-range-item > .left .description {
      max-width: 420px;
      opacity: 0.62;
    }

    #app .system-settings .window-scale-font-range-item > .right {
      width: 100%;
      justify-self: stretch !important;
    }

    #app .app-font-size-setting.window-scale-font-range {
      width: 100%;
      min-width: 0;
      max-width: 360px;
      min-height: 82px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: 7px;
      padding: 9px 11px;
      border: 1px solid color-mix(in srgb, var(--color-text), transparent 91%);
      border-radius: 11px;
      background: var(--color-secondary-bg);
      box-shadow: 0 5px 18px color-mix(in srgb, black, transparent 95%);
    }

    #app .window-scale-font-row {
      display: grid;
      grid-template-columns: minmax(58px, auto) 32px minmax(52px, 1fr) 32px;
      align-items: center;
      gap: 7px;
      width: 100%;
      min-height: 31px;
    }

    #app .window-scale-font-label {
      white-space: nowrap;
      text-align: left;
      font-weight: 650;
      opacity: 0.68;
    }

    #app .window-scale-font-value {
      min-width: 52px;
      white-space: nowrap;
      text-align: center;
      font-weight: 750;
      font-variant-numeric: tabular-nums;
    }

    #app .window-scale-font-button {
      width: 32px;
      min-width: 32px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 7px;
      background: color-mix(in srgb, var(--color-text), transparent 92%);
      color: var(--color-text);
      font-weight: 750;
      cursor: pointer;
      transition: background 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
    }

    #app .window-scale-font-button:hover:not(:disabled) {
      background: color-mix(in srgb, var(--color-text), transparent 83%);
    }

    #app .window-scale-font-button:active:not(:disabled) {
      transform: scale(0.92);
    }

    #app .window-scale-font-button:disabled {
      cursor: default;
      opacity: 0.28;
    }

    #app .system-settings .settings-appearance-grid {
      display: grid !important;
      grid-template-columns: repeat(
        auto-fit,
        minmax(var(--settings-appearance-card-min, 185px), 1fr)
      );
      align-items: start !important;
      gap: 14px !important;
      width: 100%;
      min-width: 0;
      margin-top: 8px;
      margin-bottom: 20px;
    }

    #app .system-settings .settings-appearance-grid > div:first-child {
      grid-column: 1 / -1;
      font-weight: 600;
      opacity: 0.78;
    }

    #app .system-settings .settings-appearance-grid > .appearance {
      width: 100% !important;
      min-width: 0;
      box-sizing: border-box;
      cursor: pointer;
    }

    #app .system-settings .settings-appearance-grid > .appearance img {
      width: 100% !important;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      box-sizing: border-box;
    }

    #app .system-settings .settings-colors-grid {
      display: block !important;
      width: 100%;
      min-width: 0;
      margin-bottom: 24px;
    }

    #app .system-settings .settings-colors-grid > div:first-child {
      margin-bottom: 10px;
      font-weight: 600;
      opacity: 0.78;
    }

    #app .system-settings .settings-colors-grid > .colors {
      width: 100% !important;
      display: grid !important;
      grid-template-columns: repeat(
        auto-fit,
        minmax(var(--settings-color-card-min, 108px), 1fr)
      );
      align-items: start;
      justify-content: initial !important;
      gap: 12px;
    }

    #app .system-settings .settings-colors-grid .theme-color {
      min-width: 0;
      margin: 0 !important;
      align-items: center;
    }

    #app .system-settings .settings-colors-grid .theme-color-item {
      width: clamp(42px, 5vw, 58px) !important;
      height: clamp(42px, 5vw, 58px) !important;
    }

    #app .system-settings .settings-multi-card-grid {
      display: grid !important;
      grid-template-columns: repeat(
        auto-fit,
        minmax(var(--settings-multi-card-min, 180px), 1fr)
      );
      align-items: start !important;
      gap: 14px;
      width: 100%;
      min-width: 0;
    }

    #app .system-settings .settings-multi-card-grid > .stream-item {
      width: 100% !important;
      min-width: 0;
      height: auto !important;
      min-height: 150px;
    }

    #app .system-settings #shortcut-table {
      max-width: 100%;
      overflow-x: auto;
      overscroll-behavior-x: contain;
    }
  `
  ;(document.head || document.documentElement).appendChild(style)
}

const updateScaleSettingText = (setting: HTMLElement) => {
  const item = setting.closest<HTMLElement>('.item')
  const title = item?.querySelector<HTMLElement>('.left .title')
  const description = item?.querySelector<HTMLElement>('.left .description')
  const nextTitle = '主界面缩放字体范围'
  const nextDescription = '窗口缩放时，字体、图标、按钮和间距统一限制在此字号范围内'

  item?.classList.add('window-scale-font-range-item', 'settings-pair-item')

  if (title && title.textContent !== nextTitle) title.textContent = nextTitle
  if (description && description.textContent !== nextDescription) {
    description.textContent = nextDescription
  }
}

/**
 * 把旧的单一字号控件转换为最小、最大字号范围控件。
 *
 * Returns:
 * 找到并完成转换时返回 true；设置页尚未渲染时返回 false。
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
    if (action === 'max-increase') range.max += 1

    saveScaleFontRange(range)
    render()
  }

  render()
  return true
}

const initializeScaleFontRangeSetting = () => {
  ensureSettingsStyle()
  decorateScaleFontRangeSetting()

  const settingsCheckTimer = window.setInterval(() => {
    decorateScaleFontRangeSetting()
  }, SETTINGS_CHECK_INTERVAL_MS)

  return () => window.clearInterval(settingsCheckTimer)
}

/**
 * 根据页面缩放比例，把期望的物理布局尺寸换算成 CSS 逻辑尺寸。
 */
const updateSettingsLayoutVariables = (zoomFactor: number) => {
  const safeZoomFactor = Math.max(0.01, zoomFactor)
  const rootStyle = document.documentElement.style

  rootStyle.setProperty(
    '--settings-page-min-logical-width',
    `${(SETTINGS_MIN_PHYSICAL_WIDTH / safeZoomFactor).toFixed(2)}px`
  )
  rootStyle.setProperty(
    '--settings-pair-column-min',
    `${(SETTINGS_PAIR_MIN_PHYSICAL_WIDTH / safeZoomFactor).toFixed(2)}px`
  )
  rootStyle.setProperty(
    '--settings-range-column-min',
    `${(SETTINGS_RANGE_MIN_PHYSICAL_WIDTH / safeZoomFactor).toFixed(2)}px`
  )
  rootStyle.setProperty(
    '--settings-appearance-card-min',
    `${(SETTINGS_APPEARANCE_MIN_PHYSICAL_WIDTH / safeZoomFactor).toFixed(2)}px`
  )
  rootStyle.setProperty(
    '--settings-color-card-min',
    `${(SETTINGS_COLOR_MIN_PHYSICAL_WIDTH / safeZoomFactor).toFixed(2)}px`
  )
  rootStyle.setProperty(
    '--settings-multi-card-min',
    `${(SETTINGS_CARD_MIN_PHYSICAL_WIDTH / safeZoomFactor).toFixed(2)}px`
  )
}

/**
 * 初始化主窗口连续缩放监听。
 *
 * Returns:
 * 用于移除 resize、设置变化监听和低频设置检测的清理函数。
 */
export const initializeSmoothWindowScale = () => {
  const runtimeWindow = window as RuntimeWindow
  runtimeWindow.__vutronSmoothWindowScaleCleanup__?.()

  if (!window.mainApi?.setZoomFactor || !window.mainApi?.getZoomFactor) {
    return () => undefined
  }

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
    updateSettingsLayoutVariables(nextZoomFactor)
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

  const stopSettingsCheck = initializeScaleFontRangeSetting()

  updateZoomFactor()
  window.addEventListener('resize', scheduleZoomUpdate, { passive: true })
  window.addEventListener(SCALE_SETTINGS_CHANGE_EVENT, scheduleZoomUpdate)

  const cleanup = () => {
    window.removeEventListener('resize', scheduleZoomUpdate)
    window.removeEventListener(SCALE_SETTINGS_CHANGE_EVENT, scheduleZoomUpdate)
    stopSettingsCheck()

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
