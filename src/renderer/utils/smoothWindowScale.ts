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
 * 5. resize 事件通过 requestAnimationFrame 合并，避免拖动时重复渲染；
 * 6. 根据当前 zoomFactor 还原窗口真实内容尺寸，防止缩放反馈振荡；
 * 7. 该逻辑只运行在主窗口 renderer，不影响独立的桌面歌词 BrowserWindow。
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
const ZOOM_EPSILON = 0.001

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

const ensureSettingsStyle = () => {
  if (document.getElementById(SETTINGS_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = SETTINGS_STYLE_ID
  style.textContent = `
    #app .app-font-size-setting.window-scale-font-range {
      width: 236px;
      min-width: 236px;
      height: auto;
      min-height: 74px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: 6px;
      padding: 7px 9px;
    }

    #app .window-scale-font-row {
      display: grid;
      grid-template-columns: 42px 30px 58px 30px;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
    }

    #app .window-scale-font-label {
      white-space: nowrap;
      text-align: left;
      font-weight: 600;
      opacity: 0.72;
    }

    #app .window-scale-font-value {
      min-width: 58px;
      white-space: nowrap;
      text-align: center;
      font-weight: 700;
    }

    #app .window-scale-font-button {
      width: 30px;
      min-width: 30px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: color-mix(in srgb, var(--color-text), transparent 92%);
      color: var(--color-text);
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s ease, opacity 0.15s ease;
    }

    #app .window-scale-font-button:hover:not(:disabled) {
      background: color-mix(in srgb, var(--color-text), transparent 84%);
    }

    #app .window-scale-font-button:disabled {
      cursor: default;
      opacity: 0.3;
    }
  `
  ;(document.head || document.documentElement).appendChild(style)
}

const updateScaleSettingText = (setting: HTMLElement) => {
  const item = setting.closest<HTMLElement>('.item')
  const title = item?.querySelector<HTMLElement>('.left .title')
  const description = item?.querySelector<HTMLElement>('.left .description')

  if (title) title.textContent = '主界面缩放字体范围'
  if (description) {
    description.textContent = '窗口缩放时，所有界面元素的有效字号限制在此范围内'
  }
}

/**
 * 把原设置页中的单一字号控件转换为最小、最大字号范围控件。
 *
 * 该转换仅修改已经渲染出的设置页 DOM，不改变桌面歌词设置。若 Vue 后续重绘了
 * 原控件，MutationObserver 会再次恢复范围控件，避免设置页面状态变化后失效。
 */
const decorateScaleFontRangeSetting = () => {
  const setting = document.querySelector<HTMLElement>(
    '#app .system-settings .app-font-size-setting'
  )
  if (!setting) return

  updateScaleSettingText(setting)

  const rangeRows = setting.querySelectorAll('.window-scale-font-row')
  if (setting.dataset.windowScaleRangeReady === 'true' && rangeRows.length === 2) return

  setting.dataset.windowScaleRangeReady = 'true'
  setting.classList.add('window-scale-font-range')
  setting.innerHTML = `
    <div class="window-scale-font-row">
      <span class="window-scale-font-label">最小</span>
      <button class="window-scale-font-button" data-scale-action="min-decrease" type="button">−</button>
      <span class="window-scale-font-value" data-scale-value="min"></span>
      <button class="window-scale-font-button" data-scale-action="min-increase" type="button">+</button>
    </div>
    <div class="window-scale-font-row">
      <span class="window-scale-font-label">最大</span>
      <button class="window-scale-font-button" data-scale-action="max-decrease" type="button">−</button>
      <span class="window-scale-font-value" data-scale-value="max"></span>
      <button class="window-scale-font-button" data-scale-action="max-increase" type="button">+</button>
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
}

const initializeScaleFontRangeSetting = () => {
  ensureSettingsStyle()
  decorateScaleFontRangeSetting()

  const observer = new MutationObserver(() => {
    decorateScaleFontRangeSetting()
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  })

  return () => observer.disconnect()
}

/**
 * 初始化主窗口连续缩放监听。
 *
 * Returns:
 * 用于移除 resize、设置变化监听和 DOM 观察器的清理函数。
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

  const updateZoomFactor = () => {
    animationFrameId = null

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
    window.mainApi?.setZoomFactor(nextZoomFactor)
  }

  const scheduleZoomUpdate = () => {
    if (animationFrameId !== null) return
    animationFrameId = window.requestAnimationFrame(updateZoomFactor)
  }

  const stopSettingsObserver = initializeScaleFontRangeSetting()

  // 在 Vue 挂载前先设置一次，尽量避免窗口打开或恢复尺寸时出现首帧跳动。
  updateZoomFactor()
  window.addEventListener('resize', scheduleZoomUpdate, { passive: true })
  window.addEventListener(SCALE_SETTINGS_CHANGE_EVENT, scheduleZoomUpdate)

  const cleanup = () => {
    window.removeEventListener('resize', scheduleZoomUpdate)
    window.removeEventListener(SCALE_SETTINGS_CHANGE_EVENT, scheduleZoomUpdate)
    stopSettingsObserver()

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