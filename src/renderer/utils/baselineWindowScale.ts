/* ======== newADD start====== */
import { watch } from 'vue'
import router from '../router'
import i18n from '../plugins/i18n'
import {
  WINDOW_SCALE_BASELINE_CHANGE_EVENT,
  WindowScaleBaselineField,
  calculateWindowZoomFactor,
  getWindowScaleFieldRange
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
const ZOOM_UPDATE_INTERVAL_MS = 32
const RESIZE_IDLE_DELAY_MS = 140
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

const BASELINE_FIELDS = Object.keys(
  FIELD_CONFIG
) as WindowScaleBaselineField[]

const translate = (
  key: string,
  params?: Record<string, string>
) => {
  return params
    ? String(i18n.global.t(key, params))
    : String(i18n.global.t(key))
}

const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #app .app-font-size-setting.window-scale-font-range {
      width: min(100%, 340px) !important;
      max-width: 340px !important;
      min-height: 0 !important;
    }

    #app .window-scale-font-row {
      display: grid !important;
      grid-template-columns: minmax(108px, 1fr) 28px minmax(72px, 92px) 28px !important;
      grid-template-rows: auto auto;
      align-items: center;
      gap: 6px !important;
    }

    #app .window-scale-font-input {
      width: 100%;
      min-width: 0;
      height: 28px;
      padding: 0 6px;
      box-sizing: border-box;
      border: none;
      border-radius: 6px;
      outline: none;
      text-align: center;
      color: var(--color-text);
      background: color-mix(in srgb, var(--color-text), transparent 94%);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    #app .window-scale-font-input::-webkit-inner-spin-button,
    #app .window-scale-font-input::-webkit-outer-spin-button {
      appearance: none;
      margin: 0;
    }

    #app .window-scale-font-slider {
      grid-column: 1 / -1;
      width: 100%;
      min-width: 0;
      margin: 1px 0 3px;
      cursor: pointer;
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
  const description = item?.querySelector<HTMLElement>(
    '.left .description'
  )

  item?.classList.add('window-scale-font-range-item')

  if (title) {
    title.textContent = translate('settings.windowScale.mainTitle')
  }
  if (description) {
    description.textContent = translate(
      'settings.windowScale.mainDescription'
    )
  }
}

const createFieldRow = (field: WindowScaleBaselineField) => {
  const label = getFieldLabel(field)
  const range = getWindowScaleFieldRange(TARGET, field)
  const decreaseLabel = translate('settings.windowScale.decrease', {
    field: label
  })
  const increaseLabel = translate('settings.windowScale.increase', {
    field: label
  })
  const inputHint = translate('settings.windowScale.enterToApply')
  const sliderHint = translate('settings.windowScale.dragToAdjust', {
    field: label
  })

  return `
    <div class="window-scale-font-row" data-baseline-field="${field}">
      <span class="window-scale-font-label">${label}</span>
      <button
        class="window-scale-font-button"
        data-baseline-action="decrease"
        type="button"
        aria-label="${decreaseLabel}"
        title="${decreaseLabel}"
      >−</button>
      <input
        class="window-scale-font-input"
        data-baseline-input="${field}"
        type="number"
        min="${range.min}"
        max="${range.max}"
        step="${range.step}"
        inputmode="numeric"
        title="${inputHint}"
      />
      <button
        class="window-scale-font-button"
        data-baseline-action="increase"
        type="button"
        aria-label="${increaseLabel}"
        title="${increaseLabel}"
      >+</button>
      <input
        class="window-scale-font-slider"
        data-baseline-slider="${field}"
        type="range"
        min="${range.min}"
        max="${range.max}"
        step="${range.step}"
        title="${sliderHint}"
      />
    </div>
  `
}

const renderSettingValues = (setting: HTMLElement) => {
  const baseline = readWindowScaleBaseline(TARGET)

  for (const field of BASELINE_FIELDS) {
    const input = setting.querySelector<HTMLInputElement>(
      `[data-baseline-input="${field}"]`
    )
    const slider = setting.querySelector<HTMLInputElement>(
      `[data-baseline-slider="${field}"]`
    )
    const value = String(baseline[field])

    if (input) input.value = value
    if (slider) slider.value = value
  }
}

const resolveField = (element: Element | null) => {
  const row = element?.closest<HTMLElement>('[data-baseline-field]')
  return row?.dataset.baselineField as
    | WindowScaleBaselineField
    | undefined
}

const applyFieldValue = (
  setting: HTMLElement,
  field: WindowScaleBaselineField,
  value: number
) => {
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
    const range = getWindowScaleFieldRange(TARGET, field)
    const direction =
      button.dataset.baselineAction === 'decrease' ? -1 : 1

    applyFieldValue(
      setting,
      field,
      baseline[field] + range.step * direction
    )
  })

  setting.addEventListener('input', (event) => {
    const slider = (event.target as HTMLElement).closest<HTMLInputElement>(
      '[data-baseline-slider]'
    )
    const field = resolveField(slider)
    if (!slider || !field) return

    applyFieldValue(setting, field, Number(slider.value))
  })

  setting.addEventListener('change', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>(
      '[data-baseline-input]'
    )
    const field = resolveField(input)
    if (!input || !field) return

    applyFieldValue(setting, field, Number(input.value))
  })

  setting.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key !== 'Enter') return

    const input = (event.target as HTMLElement).closest<HTMLInputElement>(
      '[data-baseline-input]'
    )
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

  const scheduleMount = (
    attempt: number,
    currentGeneration: number
  ) => {
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
  const stopLocaleWatch = watch(
    () => i18n.global.locale.value,
    restartMount
  )
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
    runtimeWindow.__vutronBaselineWindowScaleCleanup__ =
      cleanupWithoutElectron
    return cleanupWithoutElectron
  }

  if (
    Number(localStorage.getItem(LEGACY_FONT_SIZE_KEY)) !==
    REFERENCE_FONT_SIZE
  ) {
    localStorage.setItem(
      LEGACY_FONT_SIZE_KEY,
      String(REFERENCE_FONT_SIZE)
    )
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
      ZOOM_UPDATE_INTERVAL_MS -
      (performance.now() - lastZoomUpdateAt)

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
