/* ======== newADD start====== */
/**
 * 主窗口全界面连续缩放。
 *
 * 概述：
 * 使用 Electron webFrame 的页面缩放能力，让主窗口中的字体、SVG 图标、图片、
 * 按钮、边距、圆角和所有路由页面使用同一个连续缩放比例。设置页中的最小字号
 * 与最大字号只决定用户希望的缩放边界，不再受到 10～28px 一类固定范围限制。
 *
 * 详细说明：
 * 1. 以 1080 × 720、16px 为设计基准；
 * 2. 使用窗口面积比例的平方根，使横向、纵向和对角拖动都会连续改变元素尺寸；
 * 3. 最小字号只保留必须大于 0 的运行安全约束，最大字号不设置固定上限；
 * 4. 设置页使用 auto-fit、minmax 和 Grid 自动换行，不设置突然切换的媒体查询断点；
 * 5. resize 事件通过 requestAnimationFrame 合并，并屏蔽 setZoomFactor 自身回调；
 * 6. 该逻辑只运行在主窗口 renderer，不影响独立的桌面歌词 BrowserWindow。
 */

const DESIGN_WIDTH = 1080
const DESIGN_HEIGHT = 720
const BASE_FONT_SIZE = 16
const DEFAULT_MIN_FONT_SIZE = 12
const DEFAULT_MAX_FONT_SIZE = 22
const MIN_POSITIVE_FONT_SIZE = 1
const ZOOM_EPSILON = 0.002
const SETTINGS_CHECK_INTERVAL_MS = 800

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
 * 读取连续缩放使用的有效字号范围。
 *
 * Returns:
 * 已校正且满足 0 < min <= max 的最小、最大字号。
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
 * 注入设置页自适应布局与字号范围控件样式。
 *
 * 设置页布局完全依赖可用宽度连续计算：空间足够时元素并排，空间不足时自动形成
 * 两排或多排，不使用固定窗口宽度临界点。
 */
const ensureSettingsStyle = () => {
  if (document.getElementById(SETTINGS_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = SETTINGS_STYLE_ID
  style.textContent = `
    #app #main {
      overflow-x: auto;
      overscroll-behavior: contain;
    }

    #app .system-settings {
      min-width: 0;
    }

    #app .system-settings .main-container {
      min-width: 0;
      padding-right: clamp(14px, 3vw, 30px) !important;
      padding-left: clamp(104px, 16vw, 160px) !important;
    }

    #app .system-settings .main-container > .container {
      min-width: 0;
      overflow: visible;
      padding-bottom: 20px;
    }

    #app .system-settings .slideBar {
      left: clamp(12px, 2.5vw, 28px) !important;
      width: clamp(82px, 13vw, 120px) !important;
      max-width: none !important;
    }

    /* 普通设置项：由两列连续收缩为一列，不产生突变临界点。 */
    #app .system-settings .item:has(> .left):has(> .right):not(.no-flex) {
      display: grid !important;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
      align-items: center;
      column-gap: clamp(14px, 3vw, 34px);
      row-gap: 10px;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    #app .system-settings .item:has(> .left):has(> .right) > .left {
      min-width: 0;
      padding-right: 0 !important;
    }

    #app .system-settings .item:has(> .left):has(> .right) > .right {
      min-width: 0;
      max-width: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      justify-self: end;
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

    /* 字号范围项：说明与控件可并排，也可在窄窗口中自然上下排列。 */
    #app .system-settings .window-scale-font-range-item {
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)) !important;
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
      max-width: 340px;
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

    /* 外观预览：宽时一排，窄时自动形成任意数量的行。 */
    #app .system-settings .item:has(> .appearance) {
      display: grid !important;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 118px), 1fr));
      align-items: start !important;
      gap: 14px !important;
      width: 100%;
      min-width: 0;
      margin-top: 8px;
      margin-bottom: 20px;
    }

    #app .system-settings .item:has(> .appearance) > div:first-child {
      grid-column: 1 / -1;
      font-weight: 600;
      opacity: 0.78;
    }

    #app .system-settings .item:has(> .appearance) > .appearance {
      width: 100% !important;
      min-width: 0;
      box-sizing: border-box;
      cursor: pointer;
    }

    #app .system-settings .item:has(> .appearance) > .appearance img {
      width: 100% !important;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      box-sizing: border-box;
    }

    /* 强调色与颜色选择器：按可用宽度自动换成 n 排。 */
    #app .system-settings .item:has(> .colors) {
      display: block !important;
      width: 100%;
      min-width: 0;
      margin-bottom: 24px;
    }

    #app .system-settings .item:has(> .colors) > div:first-child {
      margin-bottom: 10px;
      font-weight: 600;
      opacity: 0.78;
    }

    #app .system-settings .item > .colors {
      width: 100% !important;
      display: grid !important;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 68px), 1fr));
      align-items: start;
      justify-content: initial !important;
      gap: 12px;
    }

    #app .system-settings .item > .colors .theme-color {
      min-width: 0;
      margin: 0 !important;
      align-items: center;
    }

    #app .system-settings .item > .colors .theme-color-item {
      width: clamp(42px, 5vw, 58px) !important;
      height: clamp(42px, 5vw, 58px) !important;
    }

    /* 其它直接由多个卡片组成的设置块同样自动换行。 */
    #app .system-settings .item:has(> .stream-item),
    #app .system-settings .item:has(> .color):not(:has(> .colors)) {
      display: grid !important;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
      align-items: start !important;
      gap: 14px;
      width: 100%;
      min-width: 0;
    }

    #app .system-settings .item:has(> .stream-item) > div:first-child {
      grid-column: 1 / -1;
    }

    #app .system-settings .stream-item {
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

  item?.classList.add('window-scale-font-range-item')

  if (title && title.textContent !== nextTitle) title.textContent = nextTitle
  if (description && description.textContent !== nextDescription) {
    description.textContent = nextDescription
  }
}

/**
 * 把原设置页中的单一字号控件转换为最小、最大字号范围控件。
 *
 * Returns:
 * 找到并完成转换时返回 true；设置页尚未渲染时返回 false。
 */
const decorateScaleFontRangeSetting = () => {
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
      range.max -= 1
      if (range.max < MIN_POSITIVE_FONT_SIZE) range.max = MIN_POSITIVE_FONT_SIZE
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

const initializeScaleFontRangeSetting = () => {
  ensureSettingsStyle()
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
 * 用于移除 resize、设置变化监听和低频设置检测的清理函数。
 */
export const initializeSmoothWindowScale = () => {
  const runtimeWindow = window as RuntimeWindow

  runtimeWindow.__vutronSmoothWindowScaleCleanup__?.()

  if (!window.mainApi?.setZoomFactor || !window.mainApi?.getZoomFactor) {
    return () => undefined
  }

  // 旧版单一字号会与页面级缩放叠加，因此固定回 16px 基准。
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

    // 页面缩放会改变 innerWidth/innerHeight。乘回当前比例后得到 BrowserWindow
    // 实际内容区尺寸，从而避免缩放比例在 resize 过程中来回振荡。
    const contentWidth = Math.max(1, window.innerWidth * currentZoomFactor)
    const contentHeight = Math.max(1, window.innerHeight * currentZoomFactor)

    const widthScale = contentWidth / DESIGN_WIDTH
    const heightScale = contentHeight / DESIGN_HEIGHT
    const areaScale = Math.sqrt(widthScale * heightScale)

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

    if (Math.abs(nextZoomFactor - currentZoomFactor) < ZOOM_EPSILON) return

    isApplyingZoomFactor = true
    try {
      window.mainApi?.setZoomFactor(nextZoomFactor)
    } finally {
      window.requestAnimationFrame(() => {
        isApplyingZoomFactor = false
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
