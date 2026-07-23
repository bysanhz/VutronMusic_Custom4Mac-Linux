/* ======== newADD start====== */
import { watch } from 'vue'
import type { Router } from 'vue-router'
import i18n from '../plugins/i18n'
import { WINDOW_SCALE_BASELINE_CHANGE_EVENT } from './windowScaleBaseline'
import {
  cancelWindowScaleCalibration,
  commitWindowScaleBaseline,
  previewWindowScaleBaseline,
  readWindowScaleBaseline
} from './windowScaleBaselineStorage'

const TARGET = 'osd-small' as const
const FIELD = 'miniControlBaseSize' as const
const CONTROL_SELECTOR = '#osd-window-scale-baseline-setting'
const SECTION_SELECTOR = `${CONTROL_SELECTOR} [data-section-target="${TARGET}"]`
const ROW_ID = 'mini-osd-control-base-setting'
const STYLE_ID = 'window-scale-calibration-visibility-style'
const RELATIVE_SLIDER_RANGE = 100

let observer: MutationObserver | null = null
let scheduleFrame: number | null = null
let miniCalibrationActive = false
let originalOsdLyricRaw: string | null | undefined
let sliderStartValue: number | null = null

const translate = (key: string, params?: Record<string, string>) => {
  return params
    ? String(i18n.global.t(key, params))
    : String(i18n.global.t(key))
}

const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .window-scale-calibration-actions {
      display: none !important;
      margin: 0 !important;
      padding: 6px 0 0 !important;
      border: 0 !important;
    }

    [data-window-scale-calibrating='true']
      > .window-scale-calibration-actions {
      display: block !important;
    }

    .window-scale-calibration-hint {
      display: none !important;
    }

    .window-scale-calibration-buttons {
      justify-content: flex-end !important;
    }
  `
  document.head.appendChild(style)
}

const createRow = () => {
  const label = translate('settings.windowScale.miniControlBaseSize')
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

  const row = document.createElement('div')
  row.id = ROW_ID
  row.className = 'osd-window-scale-row'
  row.dataset.target = TARGET
  row.dataset.field = FIELD
  row.innerHTML = `
    <span class="osd-window-scale-label">${label}</span>
    <button
      type="button"
      class="osd-window-scale-button"
      data-mini-control-action="decrease"
      aria-label="${decreaseLabel}"
      title="${decreaseLabel}"
    >−</button>
    <input
      type="number"
      class="osd-window-scale-input"
      data-mini-control-input="true"
      step="0.1"
      inputmode="decimal"
      title="${inputHint}"
    />
    <button
      type="button"
      class="osd-window-scale-button"
      data-mini-control-action="increase"
      aria-label="${increaseLabel}"
      title="${increaseLabel}"
    >+</button>
    <input
      type="range"
      class="osd-window-scale-slider"
      data-mini-control-slider="true"
      min="-${RELATIVE_SLIDER_RANGE}"
      max="${RELATIVE_SLIDER_RANGE}"
      step="1"
      value="0"
      title="${sliderHint}"
    />
  `
  return row
}

const getSection = () => {
  return document.querySelector<HTMLElement>(SECTION_SELECTOR)
}

const getInput = () => {
  return document.querySelector<HTMLInputElement>(
    `#${ROW_ID} [data-mini-control-input="true"]`
  )
}

const getSlider = () => {
  return document.querySelector<HTMLInputElement>(
    `#${ROW_ID} [data-mini-control-slider="true"]`
  )
}

const renderValue = () => {
  const baseline = readWindowScaleBaseline(TARGET)
  const input = getInput()
  const slider = getSlider()

  if (input) input.value = String(baseline.miniControlBaseSize)
  if (slider && sliderStartValue === null) slider.value = '0'
}

const ensureRow = () => {
  scheduleFrame = null
  observer?.disconnect()
  injectStyle()

  const section = getSection()
  if (section && !document.getElementById(ROW_ID)) {
    const row = createRow()
    const actions = section.querySelector(
      '.window-scale-calibration-actions'
    )

    if (actions) {
      actions.insertAdjacentElement('beforebegin', row)
    } else {
      section.appendChild(row)
    }
  }

  if (section && miniCalibrationActive) {
    section.dataset.windowScaleCalibrating = 'true'
  }

  renderValue()
  observer?.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
}

const scheduleEnsureRow = () => {
  if (scheduleFrame !== null) return
  scheduleFrame = window.requestAnimationFrame(ensureRow)
}

const beginMiniModePreview = () => {
  if (originalOsdLyricRaw === undefined) {
    originalOsdLyricRaw = localStorage.getItem('osdLyric')
  }

  let state: Record<string, unknown> = {}
  try {
    state = JSON.parse(localStorage.getItem('osdLyric') || '{}')
  } catch {
    state = {}
  }

  state.type = 'small'
  localStorage.setItem('osdLyric', JSON.stringify(state))
}

const restoreOsdMode = () => {
  if (originalOsdLyricRaw === undefined) return

  if (originalOsdLyricRaw === null) {
    localStorage.removeItem('osdLyric')
  } else {
    localStorage.setItem('osdLyric', originalOsdLyricRaw)
  }
  originalOsdLyricRaw = undefined
}

const previewValue = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    renderValue()
    return
  }

  beginMiniModePreview()
  const baseline = readWindowScaleBaseline(TARGET)
  baseline.miniControlBaseSize = Math.round(value * 100) / 100
  previewWindowScaleBaseline(TARGET, baseline)
  miniCalibrationActive = true

  const section = getSection()
  if (section) section.dataset.windowScaleCalibrating = 'true'
  renderValue()
}

const finishMiniCalibration = (confirm: boolean) => {
  if (!miniCalibrationActive) return

  if (confirm) {
    commitWindowScaleBaseline(TARGET, readWindowScaleBaseline(TARGET))
  } else {
    cancelWindowScaleCalibration(TARGET)
  }
}

const handleClick = (event: MouseEvent) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    `#${ROW_ID} [data-mini-control-action]`
  )
  if (!button) return

  event.preventDefault()
  event.stopImmediatePropagation()
  event.stopPropagation()

  const direction =
    button.dataset.miniControlAction === 'decrease' ? -1 : 1
  const current = readWindowScaleBaseline(TARGET).miniControlBaseSize
  previewValue(current + 0.5 * direction)
}

const handlePointerDown = (event: PointerEvent) => {
  const slider = (event.target as HTMLElement).closest<HTMLInputElement>(
    `#${ROW_ID} [data-mini-control-slider="true"]`
  )
  if (!slider) return

  sliderStartValue =
    readWindowScaleBaseline(TARGET).miniControlBaseSize
}

const handleInput = (event: Event) => {
  const slider = (event.target as HTMLElement).closest<HTMLInputElement>(
    `#${ROW_ID} [data-mini-control-slider="true"]`
  )
  if (!slider) return

  event.stopImmediatePropagation()
  event.stopPropagation()

  const start =
    sliderStartValue ??
    readWindowScaleBaseline(TARGET).miniControlBaseSize
  const delta = Number(slider.value)
  const step = Math.max(0.05, start / 200)
  previewValue(start + delta * step)
}

const handleChange = (event: Event) => {
  const target = event.target as HTMLElement
  const slider = target.closest<HTMLInputElement>(
    `#${ROW_ID} [data-mini-control-slider="true"]`
  )

  if (slider) {
    event.stopImmediatePropagation()
    event.stopPropagation()
    slider.value = '0'
    sliderStartValue = null
    return
  }

  const input = target.closest<HTMLInputElement>(
    `#${ROW_ID} [data-mini-control-input="true"]`
  )
  if (!input) return

  event.stopImmediatePropagation()
  event.stopPropagation()
  previewValue(Number(input.value))
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (miniCalibrationActive && event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    event.stopPropagation()
    finishMiniCalibration(false)
    return
  }

  if (
    miniCalibrationActive &&
    event.key === 'Enter' &&
    (event.ctrlKey || event.metaKey)
  ) {
    event.preventDefault()
    event.stopImmediatePropagation()
    event.stopPropagation()
    finishMiniCalibration(true)
    return
  }

  if (event.key !== 'Enter') return

  const input = (event.target as HTMLElement).closest<HTMLInputElement>(
    `#${ROW_ID} [data-mini-control-input="true"]`
  )
  if (!input) return

  event.preventDefault()
  event.stopImmediatePropagation()
  event.stopPropagation()
  previewValue(Number(input.value))
  input.blur()
}

const handleBaselineChange = (event: Event) => {
  const detail = (event as CustomEvent).detail
  if (detail?.target !== TARGET) return

  renderValue()
  if (detail.preview !== false || !miniCalibrationActive) return

  miniCalibrationActive = false
  sliderStartValue = null
  restoreOsdMode()
  const section = getSection()
  if (section) section.dataset.windowScaleCalibrating = 'false'
  scheduleEnsureRow()
}

export const initializeMiniOsdScaleSettings = (router: Router) => {
  injectStyle()
  observer = new MutationObserver(scheduleEnsureRow)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  })

  document.addEventListener('click', handleClick, true)
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('input', handleInput, true)
  document.addEventListener('change', handleChange, true)
  document.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener(
    WINDOW_SCALE_BASELINE_CHANGE_EVENT,
    handleBaselineChange
  )

  const removeBeforeEach = router.beforeEach(() => {
    finishMiniCalibration(false)
    return true
  })
  const removeAfterEach = router.afterEach(scheduleEnsureRow)
  const stopLocaleWatch = watch(
    () => i18n.global.locale.value,
    () => {
      document.getElementById(ROW_ID)?.remove()
      scheduleEnsureRow()
    }
  )

  window.addEventListener('beforeunload', () => {
    finishMiniCalibration(false)
  })
  scheduleEnsureRow()

  return () => {
    finishMiniCalibration(false)
    observer?.disconnect()
    observer = null
    removeBeforeEach()
    removeAfterEach()
    stopLocaleWatch()
    document.removeEventListener('click', handleClick, true)
    document.removeEventListener('pointerdown', handlePointerDown, true)
    document.removeEventListener('input', handleInput, true)
    document.removeEventListener('change', handleChange, true)
    document.removeEventListener('keydown', handleKeyDown, true)
    window.removeEventListener(
      WINDOW_SCALE_BASELINE_CHANGE_EVENT,
      handleBaselineChange
    )

    if (scheduleFrame !== null) {
      window.cancelAnimationFrame(scheduleFrame)
      scheduleFrame = null
    }
  }
}
/* =========== newADD end ======== */
