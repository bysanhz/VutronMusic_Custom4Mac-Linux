/* ======== newADD start====== */
/**
 * 主窗口全界面连续缩放。
 *
 * 概述：
 * 使用 Electron webFrame 的页面缩放能力，让主窗口中的字体、SVG 图标、图片、
 * 按钮、边距、圆角和所有路由页面使用同一个连续缩放比例。设置页中的最小字号
 * 与最大字号用于约束缩放范围，防止小窗口中文字过小或大窗口界面过度放大。
 *
 * 详细说明：
 * 1. 以 1080 × 720、16px 为设计基准；
 * 2. 使用窗口面积比例的平方根，使横向、纵向和对角拖动都会连续改变元素尺寸；
 * 3. 默认有效字号限制为 12～22px，并允许在设置页中分别调整；
 * 4. 原有“主界面字体大小”控件会在运行时转换为“缩放字体范围”控件；
 * 5. 设置页使用连续 Grid 布局，避免标题、外观卡片和强调色在窄窗口中相互挤压；
 * 6. resize 事件通过 requestAnimationFrame 合并，避免拖动时重复渲染；
 * 7. 设置控件使用低频检测，不再观察整个 DOM，避免播放器与页面更新触发死循环；
 * 8. 该逻辑只运行在主窗口 renderer，不影响独立的桌面歌词 BrowserWindow。
 */

const DESIGN_WIDTH = 1080
const DESIGN_HEIGHT = 720
const MIN_LAYOUT_WIDTH = 768
const MIN_LAYOUT_HEIGHT = 480
const BASE_FONT_SIZE = 16
const ALLOWED_MIN_FONT_SIZE = 10
const ALLOWED_MAX_FONT_SIZE = 28
const DEFAULT_MIN_FONT_SIZE = 12
const DEFAULT_MAX_FONT_SIZE = 22
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

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value))
}

const readStoredFontSize = (key: string, fallback: number) => {
  const storedValue = localStorage.getItem(key)
  if (storedValue === null || storedValue.trim() === '') return fallback

  const value = Number(storedValue)
  if (!Number.isFinite(value)) return fallback
  return clamp(Math.round(value), ALLOWED_MIN_FONT_SIZE, ALLOWED_MAX_FONT_SIZE)
}

/**
 * 读取连续缩放使用的有效字号范围。
 *
 * Returns:
 * 已校正且满足 min <= max 的最小、最大字号。
 */
const readScaleFontRange = (): ScaleFontRange => {
  const min = readStoredFontSize(MIN_FONT_SIZE_KEY, DEFAULT_MIN_FONT_SIZE)
  const max = readStoredFontSize(MAX_FONT_SIZE_KEY, DEFAULT_MAX_FONT_SIZE)

  return min <= max ? { min, max } : { min: max, max: min }
}

const saveScaleFontRange = (range: ScaleFontRange) => {
  const min = clamp(Math.round(range.min), ALLOWED_MIN_FONT_SIZE, ALLOWED_MAX_FONT_SIZE)
  const max = clamp(Math.round(range.max), min, ALLOWED_MAX_FONT_SIZE)

  localStorage.setItem(MIN_FONT_SIZE_KEY, String(min))
  localStorage.setItem(MAX_FONT_SIZE_KEY, String(max))
  window.dispatchEvent(new Event(SCALE_SETTINGS_CHANGE_EVENT))
}

/**
 * 注入设置页布局与字号范围控件样式。
 *
 * 所有尺寸均使用 Grid、minmax 和 clamp 连续计算，不设置会突然切换布局模型的
 * 媒体查询临界点。
 */
const ensureSettingsStyle = () => {
  if (document.getElementById(SETTINGS_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = SETTINGS_STYLE_ID
  style.textContent = `
    /* 设置页整体：适度收窄二级导航占用，为正文和控件留出稳定宽度。 */
    #app .system-settings .main-container {
      padding-right: clamp(18px, 3vw, 30px) !important;
      padding-left: clamp(150px, 18vw, 180px) !important;
    }

    #app .system-settings .slideBar {
      left: clamp(18px, 3vw, 30px) !important;
      width: clamp(108px, 14vw, 120px) !important;
      max-width: none !important;
    }

    /* 标准设置项统一为连续两列布局，避免说明区被右侧控件挤成逐字换行。 */
    #app .system-settings .item:has(> .left):has(> .right):not(.no-flex) {
      display: grid !important;
      grid-template-columns: minmax(210px, 1fr) minmax(164px, auto);
      align-items: center;
      column-gap: clamp(18px, 3vw, 36px);
      row-gap: 8px;
      width: 100%;
      box-sizing: border-box;
    }

    #app .system-settings .item:has(> .left):has(> .right) > .left {
      min-width: 0;
      padding-right: 0 !important;
    }

    #app .system-settings .item:has(> .left):has(> .right) > .right {
      min-width: 164px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      justify-self: end;
    }

    #app .system-settings .item .title {
      overflow: visible !important;
      white-space: normal;
      line-height: 1.4;
      -webkit-line-clamp: unset !important;
      line-clamp: unset !important;
    }

    #app .system-settings .item .description {
      margin-top: 4px;
      line-height: 1.45;
    }

    /* 字号范围项使用完整卡片，而不是把双行控件塞进原来的单行小控件槽。 */
    #app .system-settings .window-scale-font-range-item {
      grid-template-columns: minmax(250px, 1fr) 270px !important;
      align-items: center !important;
      gap: clamp(18px, 3vw, 34px) !important;
      margin: 8px 0 18px !important;
      padding: 14px 16px !important;
      border-radius: 14px;
      background: color-mix(in srgb, var(--color-secondary-bg), transparent 42%);
    }

    #app .system-settings .window-scale-font-range-item > .left .title {
      white-space: nowrap;
      font-weight: 650;
      opacity: 0.9;
    }

    #app .system-settings .window-scale-font-range-item > .left .description {
      max-width: 390px;
      opacity: 0.62;
    }

    #app .app-font-size-setting.window-scale-font-range {
      width: 270px;
      min-width: 270px;
      height: auto;
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
      box-shadow: 0 5px 18px color-mix(in srgb, black, transparent 95%);
    }

    #app .window-scale-font-row {
      display: grid;
      grid-template-columns: 48px 32px minmax(64px, 1fr) 32px;
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
      min-width: 64px;
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

    /* 外观预览固定为一行三列，标题独占整行，卡片按可用宽度连续伸缩。 */
    #app .system-settings .item:has(> .appearance) {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(118px, 1fr));
      align-items: start !important;
      gap: 14px !important;
      width: 100%;
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

    /* 强调色使用自适应网格，避免最后一个颜色被裁出窗口。 */
    #app .system-settings .item:has(> .colors) {
      display: block !important;
      width: 100%;
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
      grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
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
      width: clamp(46px, 5vw, 58px) !important;
      height: clamp(46px, 5vw, 58px) !important;
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

  // 只在内容确实不同时写 DOM，避免写入操作反复触发布局与组件更新。
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
    const minIncrease = setting.querySelector<HTMLButtonElement>(
      '[data-scale-action="min-increase"]'
    )
    const maxDecrease = setting.querySelector<HTMLButtonElement>(
      '[data-scale-action="max-decrease"]'
    )
    const maxIncrease = setting.querySelector<HTMLButtonElement>(
      '[data-scale-action="max-increase"]'
    )

    if (minValue) minValue.textContent = `${range.min}px`
    if (maxValue) maxValue.textContent = `${range.max}px`
    if (minDecrease) minDecrease.disabled = range.min <= ALLOWED_MIN_FONT_SIZE
    if (minIncrease) minIncrease.disabled = range.min >= range.max
    if (maxDecrease) maxDecrease.disabled = range.max <= range.min
    if (maxIncrease) maxIncrease.disabled = range.max >= ALLOWED_MAX_FONT_SIZE
  }

  setting.onclick = (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-scale-action]')
    if (!button || button.disabled) return

    const range = readScaleFontRange()
    const action = button.dataset.scaleAction

    if (action === 'min-decrease') range.min -= 1
    if (action === 'min-increase') range.min += 1
    if (action === 'max-decrease') range.max -= 1
    if (action === 'max-increase') range.max += 1

    saveScaleFontRange(range)
    render()
  }

  render()
  return true
}

/**
 * 初始化设置页字号范围控件。
 *
 * 使用低频定时检测替代对整个 documentElement 的 MutationObserver。单次检测只执行
 * 一个 querySelector，并且已转换的控件会立即返回，因此不会被播放器进度、轮播图、
 * 歌词更新等高频 DOM 变化放大为持续主线程负载。
 */
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

  // Vite 热更新时先清理上一轮监听，避免重复注册。
  runtimeWindow.__vutronSmoothWindowScaleCleanup__?.()

  if (!window.mainApi?.setZoomFactor || !window.mainApi?.getZoomFactor) {
    return () => undefined
  }

  // 旧版“单一全局字号”会与页面级缩放叠加。迁移为 16px 基准后，最终有效字号
  // 完全由下面的最小、最大字号范围控制。
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
    const widthFitScale = contentWidth / MIN_LAYOUT_WIDTH
    const heightFitScale = contentHeight / MIN_LAYOUT_HEIGHT

    const fontRange = readScaleFontRange()
    const minZoomFactor = fontRange.min / BASE_FONT_SIZE
    const maxZoomFactor = fontRange.max / BASE_FONT_SIZE

    // 先使用窗口面积得到连续目标，再考虑逻辑布局完整性；最后再次用字号范围
    // 进行硬限制，因此极小窗口中界面宁可保持可读，也不会继续缩成无法辨认的大小。
    const fitConstrainedScale = Math.min(areaScale, widthFitScale, heightFitScale)
    const nextZoomFactor = clamp(fitConstrainedScale, minZoomFactor, maxZoomFactor)
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
      // setZoomFactor 是同步调用；在下一帧再解除保护，屏蔽它自身引发的 resize 回调。
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

  // 在 Vue 挂载前先设置一次，尽量避免窗口打开或恢复尺寸时出现首帧跳动。
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