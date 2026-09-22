/* ======== newADD start====== */
import { watch } from 'vue'
import router from '../router'
import i18n from '../plugins/i18n'
import {
  WINDOW_SCALE_BASELINE_CHANGE_EVENT,
  WindowScaleBaselineField,
  WindowScaleStepMode,
  calculateWindowZoomFactor,
  getWindowScaleAdjustmentStep
} from './windowScaleBaseline'
import {
  readWindowScaleBaseline,
  saveWindowScaleBaseline,
  syncWindowMinimumSize
} from './windowScaleBaselineStorage'

const TARGET = 'main' as const
const LEGACY_FONT_SIZE_KEY = 'appGlobalFontSize'
const REFERENCE_FONT_SIZE = 16
const ZOOM_EPSILON = 0.004
// Linux/Chromium 在原生窗口连续缩放时，同时高频改 webFrame zoom 会触发整页重复栅格化。
// 保留实时跟随，但把 Linux 更新节奏放宽到约 16 FPS；拖拽结束后仍会立即做最终校准。
const IS_LINUX_RUNTIME = Boolean(window.env?.isLinux)
const ZOOM_UPDATE_INTERVAL_MS = IS_LINUX_RUNTIME ? 64 : 32
const RESIZE_IDLE_DELAY_MS = IS_LINUX_RUNTIME ? 110 : 140
const SETTINGS_RETRY_MS = 80
const SETTINGS_MAX_RETRIES = 24
const WINDOW_RESIZING_CLASS = 'vutron-window-resizing'
const STYLE_ID = 'main-window-scale-baseline-style'

type RuntimeWindow = Window & {
  __vutronBaselineWindowScaleCleanup__?: () => void
}

type FieldConfig = {
  labelKey: string
}

const FIELD_CONFIG: Record<WindowScaleBaselineField, FieldConfig> = {
  minWidth: {
    labelKey: 'settings.windowScale.minWidth'
  },
  minHeight: {
    labelKey: 'settings.windowScale.minHeight'
  },
  baseFontSize: {
    labelKey: 'settings.windowScale.baseFontSize'
  }
}

const BASELINE_FIELDS = Object.keys(FIELD_CONFIG) as WindowScaleBaselineField[]

const translate = (key: string, params?: Record<string, string>) => {
  return params ? String(i18n.global.t(key, params)) : String(i18n.global.t(key))
}

const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #app .app-font-size-setting.window-scale-font-range {
      width: min(100%, 420px) !important;
      max-width: 420px !important;
      min-height: 0 !important;
    }

    #app .window-scale-font-row {
      display: grid !important;
      grid-template-columns:
        minmax(82px, 1fr)
        24px
        18px
        minmax(56px, 68px)
        18px
        24px !important;
      grid-template-rows: 30px;
      align-items: center;
      gap: 4px !important;
    }

    #app .window-scale-font-row .window-scale-font-button {
      min-width: 0 !important;
      justify-self: center;
      align-self: center;
      padding: 0;
      border: 1px solid transparent !important;
      border-radius: 999px;
      color: color-mix(in srgb, var(--color-primary) 54%, transparent) !important;
      background: color-mix(in srgb, var(--color-primary) 5%, transparent) !important;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      transition:
        color 0.16s ease,
        background-color 0.16s ease,
        border-color 0.16s ease,
        transform 0.16s ease;
    }

    #app .window-scale-font-row .window-scale-font-button[data-step-mode='coarse'] {
      width: 24px !important;
      height: 24px;
      font-size: 16px;
      line-height: 1;
      font-weight: 650;
      color: color-mix(in srgb, var(--color-primary) 60%, transparent) !important;
      background: color-mix(in srgb, var(--color-primary) 5.5%, transparent) !important;
    }

    #app .window-scale-font-row .window-scale-font-button[data-step-mode='fine'] {
      width: 18px !important;
      height: 18px;
      font-size: 11px;
      line-height: 1;
      font-weight: 600;
      color: color-mix(in srgb, var(--color-primary) 44%, transparent) !important;
      background: color-mix(in srgb, var(--color-primary) 3%, transparent) !important;
    }

    #app .window-scale-font-row .window-scale-font-button:hover:not(:disabled) {
      color: color-mix(in srgb, var(--color-primary) 78%, transparent) !important;
      background: color-mix(in srgb, var(--color-primary) 10%, transparent) !important;
      border-color: color-mix(in srgb, var(--color-primary) 14%, transparent) !important;
    }

    #app .window-scale-font-input {
      width: 100%;
      min-width: 0;
      height: 27px;
      padding: 0 6px;
      box-sizing: border-box;
      border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent) !important;
      border-radius: 7px;
      outline: none;
      text-align: center;
      color: var(--color-primary) !important;
      caret-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 7%, transparent) !important;
      font-weight: 820;
      font-variant-numeric: tabular-nums;
    }

    #app .window-scale-font-input::-webkit-inner-spin-button,
    #app .window-scale-font-input::-webkit-outer-spin-button {
      appearance: none;
      margin: 0;
    }

  `
  document.head.appendChild(style)
}

const getFieldLabel = (field: WindowScaleBaselineField) => {
  return translate(FIELD_CONFIG[field].labelKey)
}

const updateSettingText = (setting: HTMLElement) => {
  const item = setting.closest<HTMLElement>('.item')
  const title = item?.querySelector<HTMLElement>('.left .title')
  const description = item?.querySelector<HTMLElement>('.left .description')

  item?.classList.add('window-scale-font-range-item')

  if (title) {
    title.textContent = translate('settings.windowScale.mainTitle')
  }
  if (description) {
    description.textContent = translate('settings.windowScale.mainDescription')
  }
}

const formatStepValue = (value: number) => {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

const createStepButton = (
  field: WindowScaleBaselineField,
  direction: 'decrease' | 'increase',
  mode: WindowScaleStepMode
) => {
  const label = getFieldLabel(field)
  const step = getWindowScaleAdjustmentStep(field, mode)
  const stepText = formatStepValue(step)
  const sign = direction === 'decrease' ? '−' : '+'
  const titleKey =
    mode === 'coarse'
      ? direction === 'decrease'
        ? 'settings.windowScale.coarseDecrease'
        : 'settings.windowScale.coarseIncrease'
      : direction === 'decrease'
        ? 'settings.windowScale.fineDecrease'
        : 'settings.windowScale.fineIncrease'
  const title = translate(titleKey, { field: label, step: stepText })

  return `
    <button
      class="window-scale-font-button"
      data-baseline-action="${direction}"
      data-step-mode="${mode}"
      type="button"
      aria-label="${title}"
      title="${title}"
    >${sign}</button>
  `
}

const createFieldRow = (field: WindowScaleBaselineField) => {
  const label = getFieldLabel(field)
  const fineStep = getWindowScaleAdjustmentStep(field, 'fine')
  const inputHint = translate('settings.windowScale.enterToApply')

  return `
    <div class="window-scale-font-row" data-baseline-field="${field}">
      <span class="window-scale-font-label">${label}</span>
      ${createStepButton(field, 'decrease', 'coarse')}
      ${createStepButton(field, 'decrease', 'fine')}
      <input
        class="window-scale-font-input"
        data-baseline-input="${field}"
        type="number"
        step="${fineStep}"
        inputmode="${field === 'baseFontSize' ? 'decimal' : 'numeric'}"
        title="${inputHint}"
      />
      ${createStepButton(field, 'increase', 'fine')}
      ${createStepButton(field, 'increase', 'coarse')}
    </div>
  `
}

const renderSettingValues = (setting: HTMLElement) => {
  const baseline = readWindowScaleBaseline(TARGET)

  for (const field of BASELINE_FIELDS) {
    const input = setting.querySelector<HTMLInputElement>(`[data-baseline-input="${field}"]`)
    const value = String(baseline[field])

    if (input) input.value = value
  }
}

const resolveField = (element: Element | null) => {
  const row = element?.closest<HTMLElement>('[data-baseline-field]')
  return row?.dataset.baselineField as WindowScaleBaselineField | undefined
}

const applyFieldValue = (setting: HTMLElement, field: WindowScaleBaselineField, value: number) => {
  if (!Number.isFinite(value)) {
    renderSettingValues(setting)
    return
  }

  const baseline = readWindowScaleBaseline(TARGET)
  baseline[field] = value
  saveWindowScaleBaseline(TARGET, baseline)
  renderSettingValues(setting)
}

const installSettingListeners = (setting: HTMLElement) => {
  setting.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-baseline-action]'
    )
    const field = resolveField(button)
    if (!button || !field) return

    const baseline = readWindowScaleBaseline(TARGET)
    const direction = button.dataset.baselineAction === 'decrease' ? -1 : 1
    const mode = button.dataset.stepMode === 'fine' ? 'fine' : 'coarse'
    const step = getWindowScaleAdjustmentStep(field, mode)

    applyFieldValue(setting, field, baseline[field] + step * direction)
  })

  setting.addEventListener('change', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-baseline-input]')
    const field = resolveField(input)
    if (!input || !field) return

    applyFieldValue(setting, field, Number(input.value))
  })

  setting.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key !== 'Enter') return

    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-baseline-input]')
    const field = resolveField(input)
    if (!input || !field) return

    keyboardEvent.preventDefault()
    applyFieldValue(setting, field, Number(input.value))
    input.blur()
  })
}

const mountBaselineSetting = () => {
  const setting = document.querySelector<HTMLElement>(
    '#app .system-settings .app-font-size-setting'
  )
  if (!setting) return false

  injectStyle()
  updateSettingText(setting)
  setting.classList.add('window-scale-font-range')
  setting.innerHTML = BASELINE_FIELDS.map(createFieldRow).join('')

  if (setting.dataset.windowScaleBaselineReady !== 'true') {
    setting.dataset.windowScaleBaselineReady = 'true'
    installSettingListeners(setting)
  }

  const baseline = readWindowScaleBaseline(TARGET)
  syncWindowMinimumSize(TARGET, baseline)
  renderSettingValues(setting)
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
  const stopLocaleWatch = watch(() => i18n.global.locale.value, restartMount)
  restartMount()

  return () => {
    cancelPendingMount()
    removeAfterEach()
    stopLocaleWatch()
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
    runtimeWindow.__vutronBaselineWindowScaleCleanup__ = cleanupWithoutElectron
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
    const contentWidth = Math.max(1, window.innerWidth * currentZoomFactor)
    const contentHeight = Math.max(1, window.innerHeight * currentZoomFactor)
    const baseline = readWindowScaleBaseline(TARGET)
    const nextZoomFactor = calculateWindowZoomFactor(contentWidth, contentHeight, baseline, TARGET)

    document.documentElement.style.setProperty(
      '--main-window-zoom-factor',
      nextZoomFactor.toFixed(4)
    )
    document.documentElement.style.setProperty(
      '--main-window-effective-font-size',
      `${(nextZoomFactor * REFERENCE_FONT_SIZE).toFixed(2)}px`
    )
    document.documentElement.style.setProperty('--main-window-min-width', `${baseline.minWidth}px`)
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
    document.documentElement.classList.add(WINDOW_RESIZING_CLASS)
    scheduleUpdate()

    if (resizeIdleTimer !== null) window.clearTimeout(resizeIdleTimer)
    resizeIdleTimer = window.setTimeout(() => {
      resizeIdleTimer = null
      pendingUpdate = true
      scheduleUpdate()

      // 最终 zoom 更新会引起一次完整重排。Linux 上等两个 paint frame 再恢复
      // backdrop-filter/transition，避免同一帧同时做最终栅格化和昂贵特效重建。
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.documentElement.classList.remove(WINDOW_RESIZING_CLASS)
        })
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
  window.addEventListener(WINDOW_SCALE_BASELINE_CHANGE_EVENT, handleBaselineChange)

  const cleanup = () => {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener(WINDOW_SCALE_BASELINE_CHANGE_EVENT, handleBaselineChange)
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
