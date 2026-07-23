/* ======== newADD start====== */
import { watch } from 'vue'
import type { Router } from 'vue-router'
import i18n from '../plugins/i18n'
import type { WindowScaleCalibrationField, WindowScaleTarget } from './windowScaleBaseline'
import {
  cancelWindowScaleCalibration,
  clearWindowScaleCalibrationPreviews,
  commitWindowScaleBaseline,
  previewWindowScaleBaseline,
  readWindowScaleBaseline
} from './windowScaleBaselineStorage'

const STYLE_ID = 'window-scale-calibration-v2-style'
const ACTION_CLASS = 'window-scale-calibration-actions-v2'
const SETTINGS_SELECTOR = '#app .system-settings'
const MAIN_SETTING_SELECTOR = '#app .system-settings .app-font-size-setting.window-scale-font-range'
const OSD_CONTROL_SELECTOR = '#osd-window-scale-baseline-setting'
const RELATIVE_SLIDER_RANGE = 100

const activeTargets = new Set<WindowScaleTarget>()
const sliderStartValues = new WeakMap<HTMLInputElement, number>()
let originalOsdLyricRaw: string | null | undefined
let observer: MutationObserver | null = null
let decorateFrame: number | null = null

type CalibrationAction = 'confirm' | 'cancel'

const translate = (key: string) => String(i18n.global.t(key))

const injectStyle = () => {
  document.getElementById(STYLE_ID)?.remove()

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .window-scale-calibration-actions,
    .window-scale-calibration-actions-v2 {
      display: none !important;
    }

    .window-scale-calibration-actions-v2[data-visible='true'] {
      display: flex !important;
      grid-column: 1 / -1;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      width: 100%;
      box-sizing: border-box;
      margin-top: 7px;
      padding-top: 9px;
      border-top: 1px solid
        color-mix(in srgb, var(--color-text), transparent 88%);
      pointer-events: auto;
      -webkit-app-region: no-drag;
    }

    .window-scale-calibration-actions-v2 button {
      min-width: 70px;
      height: 32px;
      padding: 0 14px;
      border: 1px solid
        color-mix(in srgb, var(--color-text), transparent 88%);
      border-radius: 8px;
      color: var(--color-text);
      background: color-mix(in srgb, var(--color-text), transparent 94%);
      cursor: pointer;
      font-weight: 700;
      line-height: 1;
      pointer-events: auto;
      user-select: none;
      -webkit-app-region: no-drag;
    }

    .window-scale-calibration-actions-v2 button:hover {
      background: color-mix(in srgb, var(--color-text), transparent 88%);
    }

    .window-scale-calibration-actions-v2 button:active {
      transform: scale(0.96);
    }

    .window-scale-calibration-actions-v2
      button[data-calibration-action='confirm'] {
      border-color: transparent;
      color: #fff;
      background: var(--color-primary, #335eea);
    }

    input[data-relative-window-scale-slider='true'] {
      accent-color: var(--color-primary, #335eea);
    }
  `
  document.head.appendChild(style)
}

const getTargetContainer = (target: WindowScaleTarget) => {
  if (target === 'main') {
    return document.querySelector<HTMLElement>(MAIN_SETTING_SELECTOR)
  }

  return document.querySelector<HTMLElement>(
    `${OSD_CONTROL_SELECTOR} [data-section-target="${target}"]`
  )
}

const getTargetFromElement = (element: Element | null): WindowScaleTarget | null => {
  if (!element) return null
  if (element.closest(MAIN_SETTING_SELECTOR)) return 'main'

  const rowTarget = element.closest<HTMLElement>('[data-target]')?.dataset.target
  if (rowTarget === 'osd-small' || rowTarget === 'osd-normal') {
    return rowTarget
  }

  const actionTarget = element.closest<HTMLElement>('[data-calibration-target]')?.dataset
    .calibrationTarget
  if (actionTarget === 'main' || actionTarget === 'osd-small' || actionTarget === 'osd-normal') {
    return actionTarget
  }

  return null
}

const getFieldFromElement = (element: Element | null): WindowScaleCalibrationField | null => {
  const row = element?.closest<HTMLElement>('[data-baseline-field], [data-field]')
  const field = row?.dataset.baselineField || row?.dataset.field

  if (
    field === 'minWidth' ||
    field === 'minHeight' ||
    field === 'baseFontSize' ||
    field === 'miniControlBaseSize'
  ) {
    return field
  }

  return null
}

const getTargetFields = (target: WindowScaleTarget): WindowScaleCalibrationField[] => {
  const fields: WindowScaleCalibrationField[] = ['minWidth', 'minHeight', 'baseFontSize']
  if (target === 'osd-small') fields.push('miniControlBaseSize')
  return fields
}

const getNumberInputs = (target: WindowScaleTarget, field?: WindowScaleCalibrationField) => {
  const container = getTargetContainer(target)
  if (!container) return []

  const selector =
    target === 'main'
      ? field
        ? `[data-baseline-input="${field}"]`
        : '[data-baseline-input]'
      : field
        ? `[data-value="${field}"]`
        : '[data-value]'

  return Array.from(container.querySelectorAll<HTMLInputElement>(selector))
}

const getSliders = (target: WindowScaleTarget, field?: WindowScaleCalibrationField) => {
  const container = getTargetContainer(target)
  if (!container) return []

  const selector =
    target === 'main'
      ? field
        ? `[data-baseline-slider="${field}"]`
        : '[data-baseline-slider]'
      : field
        ? `[data-slider="${field}"]`
        : '[data-slider]'

  return Array.from(container.querySelectorAll<HTMLInputElement>(selector))
}

const renderTargetValues = (
  target: WindowScaleTarget,
  baseline = readWindowScaleBaseline(target),
  preserveFocusedInput = false
) => {
  for (const field of getTargetFields(target)) {
    for (const input of getNumberInputs(target, field)) {
      if (preserveFocusedInput && document.activeElement === input) continue
      input.value = String(baseline[field])
    }
  }
}

const isScaleField = (field: WindowScaleCalibrationField | null) => {
  return field === 'baseFontSize' || field === 'miniControlBaseSize'
}

const decorateInput = (input: HTMLInputElement) => {
  input.removeAttribute('min')
  input.removeAttribute('max')
  input.step = isScaleField(getFieldFromElement(input)) ? '0.1' : '1'
}

const decorateSlider = (slider: HTMLInputElement) => {
  slider.dataset.relativeWindowScaleSlider = 'true'
  slider.min = String(-RELATIVE_SLIDER_RANGE)
  slider.max = String(RELATIVE_SLIDER_RANGE)
  slider.step = '1'

  if (!sliderStartValues.has(slider)) slider.value = '0'
}

const resetRelativeSlider = (slider: HTMLInputElement) => {
  slider.value = '0'
  sliderStartValues.delete(slider)
}

const beginOsdModePreview = (target: 'osd-small' | 'osd-normal') => {
  if (originalOsdLyricRaw === undefined) {
    originalOsdLyricRaw = localStorage.getItem('osdLyric')
  }

  let state: Record<string, unknown> = {}
  try {
    state = JSON.parse(localStorage.getItem('osdLyric') || '{}')
  } catch {
    state = {}
  }

  state.type = target === 'osd-small' ? 'small' : 'normal'
  localStorage.setItem('osdLyric', JSON.stringify(state))
}

const restoreOsdModePreview = () => {
  if (originalOsdLyricRaw === undefined) return

  if (originalOsdLyricRaw === null) {
    localStorage.removeItem('osdLyric')
  } else {
    localStorage.setItem('osdLyric', originalOsdLyricRaw)
  }
  originalOsdLyricRaw = undefined
}

const removeActions = (target: WindowScaleTarget) => {
  const container = getTargetContainer(target)
  container?.querySelector<HTMLElement>(`.${ACTION_CLASS}`)?.remove()
  if (container) container.dataset.windowScaleCalibrating = 'false'
}

function finishTargetCalibration(target: WindowScaleTarget, action: CalibrationAction) {
  if (action === 'confirm') {
    commitWindowScaleBaseline(target, readWindowScaleBaseline(target))
  } else {
    cancelWindowScaleCalibration(target)
  }

  activeTargets.delete(target)
  removeActions(target)

  if (target === 'osd-small' || target === 'osd-normal') {
    restoreOsdModePreview()
  }

  renderTargetValues(target)
}

const createActions = (target: WindowScaleTarget) => {
  const actions = document.createElement('div')
  actions.className = ACTION_CLASS
  actions.dataset.calibrationTarget = target
  actions.dataset.visible = 'true'
  actions.innerHTML = `
    <button
      type="button"
      data-calibration-action="cancel"
    >${translate('settings.windowScale.cancel')}</button>
    <button
      type="button"
      data-calibration-action="confirm"
    >${translate('settings.windowScale.confirm')}</button>
  `

  actions
    .querySelector<HTMLButtonElement>('[data-calibration-action="cancel"]')
    ?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      finishTargetCalibration(target, 'cancel')
    })

  actions
    .querySelector<HTMLButtonElement>('[data-calibration-action="confirm"]')
    ?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      finishTargetCalibration(target, 'confirm')
    })

  return actions
}

const ensureActions = (target: WindowScaleTarget) => {
  const container = getTargetContainer(target)
  if (!container) return

  container
    .querySelectorAll<HTMLElement>('.window-scale-calibration-actions')
    .forEach((element) => element.remove())

  const existing = container.querySelector<HTMLElement>(`.${ACTION_CLASS}`)
  if (!activeTargets.has(target)) {
    existing?.remove()
    container.dataset.windowScaleCalibrating = 'false'
    return
  }

  container.dataset.windowScaleCalibrating = 'true'
  if (!existing) container.appendChild(createActions(target))
}

const cancelConflictingOsdCalibration = (target: 'osd-small' | 'osd-normal') => {
  const otherTarget = target === 'osd-small' ? 'osd-normal' : 'osd-small'
  if (activeTargets.has(otherTarget)) {
    finishTargetCalibration(otherTarget, 'cancel')
  }
}

const previewFieldValue = (
  target: WindowScaleTarget,
  field: WindowScaleCalibrationField,
  value: number
) => {
  if (!Number.isFinite(value) || value <= 0) {
    renderTargetValues(target)
    return
  }

  if (target === 'osd-small' || target === 'osd-normal') {
    cancelConflictingOsdCalibration(target)
    beginOsdModePreview(target)
  }

  const baseline = readWindowScaleBaseline(target)
  baseline[field] = value
  const preview = previewWindowScaleBaseline(target, baseline)

  activeTargets.add(target)
  renderTargetValues(target, preview)
  ensureActions(target)
}

const getButtonStep = (field: WindowScaleCalibrationField) => {
  return isScaleField(field) ? 0.5 : 10
}

const getRelativeSliderStep = (field: WindowScaleCalibrationField, startValue: number) => {
  if (isScaleField(field)) {
    return Math.max(0.05, startValue / 200)
  }
  return Math.max(1, Math.round(startValue / 200))
}

const decorateTarget = (target: WindowScaleTarget) => {
  getNumberInputs(target).forEach(decorateInput)
  getSliders(target).forEach(decorateSlider)
  ensureActions(target)
  renderTargetValues(target, readWindowScaleBaseline(target), true)
}

const startObserving = () => {
  const settings = document.querySelector<HTMLElement>(SETTINGS_SELECTOR)
  observer?.observe(settings ?? document.documentElement, {
    childList: true,
    subtree: true
  })
}

const decorateControls = () => {
  decorateFrame = null
  observer?.disconnect()
  injectStyle()
  decorateTarget('main')
  decorateTarget('osd-small')
  decorateTarget('osd-normal')
  startObserving()
}

const scheduleDecorate = () => {
  if (decorateFrame !== null) return
  decorateFrame = window.requestAnimationFrame(decorateControls)
}

const cancelAllCalibrations = () => {
  for (const target of Array.from(activeTargets)) {
    finishTargetCalibration(target, 'cancel')
  }
  activeTargets.clear()
  restoreOsdModePreview()
}

const confirmAllCalibrations = () => {
  for (const target of Array.from(activeTargets)) {
    finishTargetCalibration(target, 'confirm')
  }
}

const handlePointerDown = (event: Event) => {
  const slider = (event.target as HTMLElement).closest<HTMLInputElement>(
    '[data-relative-window-scale-slider="true"]'
  )
  const target = getTargetFromElement(slider)
  const field = getFieldFromElement(slider)
  if (!slider || !target || !field) return

  sliderStartValues.set(slider, readWindowScaleBaseline(target)[field])
}

const handleInput = (event: Event) => {
  const slider = (event.target as HTMLElement).closest<HTMLInputElement>(
    '[data-relative-window-scale-slider="true"]'
  )
  const target = getTargetFromElement(slider)
  const field = getFieldFromElement(slider)
  if (!slider || !target || !field) return

  event.stopImmediatePropagation()
  event.stopPropagation()

  const startValue = sliderStartValues.get(slider) ?? readWindowScaleBaseline(target)[field]
  const delta = Number(slider.value)
  const step = getRelativeSliderStep(field, startValue)
  previewFieldValue(target, field, startValue + delta * step)
}

const handleChange = (event: Event) => {
  const element = event.target as HTMLElement
  const slider = element.closest<HTMLInputElement>('[data-relative-window-scale-slider="true"]')

  if (slider) {
    event.stopImmediatePropagation()
    event.stopPropagation()
    resetRelativeSlider(slider)
    return
  }

  const input = element.closest<HTMLInputElement>('[data-baseline-input], [data-value]')
  const target = getTargetFromElement(input)
  const field = getFieldFromElement(input)
  if (!input || !target || !field) return

  event.stopImmediatePropagation()
  event.stopPropagation()
  previewFieldValue(target, field, Number(input.value))
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && activeTargets.size > 0) {
    event.preventDefault()
    event.stopImmediatePropagation()
    cancelAllCalibrations()
    return
  }

  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && activeTargets.size > 0) {
    event.preventDefault()
    event.stopImmediatePropagation()
    confirmAllCalibrations()
    return
  }

  if (event.key !== 'Enter') return

  const input = (event.target as HTMLElement).closest<HTMLInputElement>(
    '[data-baseline-input], [data-value]'
  )
  const target = getTargetFromElement(input)
  const field = getFieldFromElement(input)
  if (!input || !target || !field) return

  event.preventDefault()
  event.stopImmediatePropagation()
  previewFieldValue(target, field, Number(input.value))
  input.blur()
}

const handleClick = (event: MouseEvent) => {
  const stepButton = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-baseline-action], [data-action]'
  )
  const target = getTargetFromElement(stepButton)
  const field = getFieldFromElement(stepButton)
  if (!stepButton || !target || !field) return

  event.preventDefault()
  event.stopImmediatePropagation()
  event.stopPropagation()

  const action = stepButton.dataset.baselineAction || stepButton.dataset.action
  const direction = action === 'decrease' ? -1 : 1
  const current = readWindowScaleBaseline(target)[field]
  previewFieldValue(target, field, current + getButtonStep(field) * direction)
}

export const initializeWindowScaleCalibrationV2 = (router: Router) => {
  clearWindowScaleCalibrationPreviews()
  injectStyle()

  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('input', handleInput, true)
  document.addEventListener('change', handleChange, true)
  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('click', handleClick, true)

  observer = new MutationObserver(scheduleDecorate)
  startObserving()

  const removeBeforeEach = router.beforeEach(() => {
    cancelAllCalibrations()
    return true
  })
  const removeAfterEach = router.afterEach(scheduleDecorate)
  const stopLocaleWatch = watch(() => i18n.global.locale.value, scheduleDecorate)

  window.addEventListener('beforeunload', cancelAllCalibrations)
  scheduleDecorate()

  return () => {
    cancelAllCalibrations()
    observer?.disconnect()
    observer = null
    removeBeforeEach()
    removeAfterEach()
    stopLocaleWatch()
    window.removeEventListener('beforeunload', cancelAllCalibrations)
    document.removeEventListener('pointerdown', handlePointerDown, true)
    document.removeEventListener('input', handleInput, true)
    document.removeEventListener('change', handleChange, true)
    document.removeEventListener('keydown', handleKeyDown, true)
    document.removeEventListener('click', handleClick, true)
    document.getElementById(STYLE_ID)?.remove()

    if (decorateFrame !== null) {
      window.cancelAnimationFrame(decorateFrame)
      decorateFrame = null
    }
  }
}
/* =========== newADD end ======== */
