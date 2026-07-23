/* ======== newADD start====== */
import { watch } from 'vue'
import type { Router } from 'vue-router'
import i18n from '../plugins/i18n'
import type {
  WindowScaleBaselineField,
  WindowScaleTarget
} from './windowScaleBaseline'
import {
  cancelWindowScaleCalibration,
  clearWindowScaleCalibrationPreviews,
  commitWindowScaleBaseline,
  previewWindowScaleBaseline,
  readWindowScaleBaseline
} from './windowScaleBaselineStorage'

const STYLE_ID = 'window-scale-calibration-style'
const ACTION_CLASS = 'window-scale-calibration-actions'
const MAIN_SETTING_SELECTOR =
  '#app .system-settings .app-font-size-setting.window-scale-font-range'
const OSD_CONTROL_SELECTOR = '#osd-window-scale-baseline-setting'
const RELATIVE_SLIDER_RANGE = 100

const activeTargets = new Set<WindowScaleTarget>()
const sliderStartValues = new WeakMap<HTMLInputElement, number>()
let originalOsdLyricRaw: string | null | undefined
let decorateFrame: number | null = null
let observer: MutationObserver | null = null

type CalibrationAction = 'confirm' | 'cancel'

const translate = (key: string) => String(i18n.global.t(key))

const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .${ACTION_CLASS} {
      grid-column: 1 / -1;
    }

    input[data-relative-window-scale-slider='true'] {
      accent-color: var(--color-primary, #335eea);
    }
  `
  document.head.appendChild(style)
}

const getTargetFromElement = (
  element: Element | null
): WindowScaleTarget | null => {
  if (!element) return null
  if (element.closest(MAIN_SETTING_SELECTOR)) return 'main'

  const row = element.closest<HTMLElement>('[data-target]')
  const rowTarget = row?.dataset.target
  if (rowTarget === 'osd-small' || rowTarget === 'osd-normal') {
    return rowTarget
  }

  const action = element.closest<HTMLElement>('[data-calibration-target]')
  const actionTarget = action?.dataset.calibrationTarget
  if (
    actionTarget === 'main' ||
    actionTarget === 'osd-small' ||
    actionTarget === 'osd-normal'
  ) {
    return actionTarget
  }

  return null
}

const getFieldFromElement = (
  element: Element | null
): WindowScaleBaselineField | null => {
  const row = element?.closest<HTMLElement>(
    '[data-baseline-field], [data-field]'
  )
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

const getNumberInputs = (
  target: WindowScaleTarget,
  field?: WindowScaleBaselineField
) => {
  if (target === 'main') {
    const suffix = field
      ? `[data-baseline-input="${field}"]`
      : '[data-baseline-input]'
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        `${MAIN_SETTING_SELECTOR} ${suffix}`
      )
    )
  }

  const suffix = field ? `[data-value="${field}"]` : '[data-value]'
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `${OSD_CONTROL_SELECTOR} [data-target="${target}"] ${suffix}`
    )
  )
}

const getSliders = (
  target: WindowScaleTarget,
  field?: WindowScaleBaselineField
) => {
  if (target === 'main') {
    const suffix = field
      ? `[data-baseline-slider="${field}"]`
      : '[data-baseline-slider]'
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        `${MAIN_SETTING_SELECTOR} ${suffix}`
      )
    )
  }

  const suffix = field ? `[data-slider="${field}"]` : '[data-slider]'
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `${OSD_CONTROL_SELECTOR} [data-target="${target}"] ${suffix}`
    )
  )
}

const getTargetFields = (
  target: WindowScaleTarget
): WindowScaleBaselineField[] => {
  const fields: WindowScaleBaselineField[] = [
    'minWidth',
    'minHeight',
    'baseFontSize'
  ]

  if (target === 'osd-small') fields.push('miniControlBaseSize')
  return fields
}

const renderTargetValues = (
  target: WindowScaleTarget,
  baseline = readWindowScaleBaseline(target)
) => {
  for (const field of getTargetFields(target)) {
    for (const input of getNumberInputs(target, field)) {
      input.value = String(baseline[field])
    }
  }
}

const resetRelativeSlider = (slider: HTMLInputElement) => {
  slider.value = '0'
  sliderStartValues.delete(slider)
}

const isScaleField = (field: WindowScaleBaselineField | null) => {
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

  if (!sliderStartValues.has(slider)) {
    slider.value = '0'
  }
}

const createActions = (target: WindowScaleTarget) => {
  const actions = document.createElement('div')
  actions.className = ACTION_CLASS
  actions.dataset.calibrationTarget = target
  actions.innerHTML = `
    <div class="window-scale-calibration-hint">
      ${translate('settings.windowScale.calibrationHint')}
    </div>
    <div class="window-scale-calibration-buttons">
      <button
        type="button"
        class="window-scale-calibration-button"
        data-calibration-action="cancel"
      >${translate('settings.windowScale.cancel')}</button>
      <button
        type="button"
        class="window-scale-calibration-button"
        data-calibration-action="confirm"
      >${translate('settings.windowScale.confirm')}</button>
    </div>
  `
  return actions
}

const setTargetCalibrating = (
  target: WindowScaleTarget,
  calibrating: boolean
) => {
  if (target === 'main') {
    const setting = document.querySelector<HTMLElement>(MAIN_SETTING_SELECTOR)
    if (setting) {
      setting.dataset.windowScaleCalibrating = String(calibrating)
    }
    return
  }

  const section = document.querySelector<HTMLElement>(
    `${OSD_CONTROL_SELECTOR} [data-section-target="${target}"]`
  )
  if (section) {
    section.dataset.windowScaleCalibrating = String(calibrating)
  }
}

const decorateMainControls = () => {
  const setting = document.querySelector<HTMLElement>(MAIN_SETTING_SELECTOR)
  if (!setting) return

  getNumberInputs('main').forEach(decorateInput)
  getSliders('main').forEach(decorateSlider)

  setting.querySelector(`.${ACTION_CLASS}`)?.remove()
  setting.appendChild(createActions('main'))
  setting.dataset.windowScaleCalibrating = String(activeTargets.has('main'))
  renderTargetValues('main')
}

const decorateOsdControls = () => {
  const control = document.querySelector<HTMLElement>(OSD_CONTROL_SELECTOR)
  if (!control) return

  const targets: Array<'osd-small' | 'osd-normal'> = [
    'osd-small',
    'osd-normal'
  ]

  for (const target of targets) {
    const section = control.querySelector<HTMLElement>(
      `[data-section-target="${target}"]`
    )
    if (!section) continue

    getNumberInputs(target).forEach(decorateInput)
    getSliders(target).forEach(decorateSlider)

    section.querySelector(`.${ACTION_CLASS}`)?.remove()
    section.appendChild(createActions(target))
    section.dataset.windowScaleCalibrating = String(
      activeTargets.has(target)
    )
    renderTargetValues(target)
  }
}

const startObserving = () => {
  observer?.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
}

const decorateControls = () => {
  decorateFrame = null
  observer?.disconnect()
  injectStyle()
  decorateMainControls()
  decorateOsdControls()
  startObserving()
}

const scheduleDecorate = () => {
  if (decorateFrame !== null) return
  decorateFrame = window.requestAnimationFrame(decorateControls)
}

const beginOsdModePreview = (
  target: 'osd-small' | 'osd-normal'
) => {
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

const cancelConflictingOsdCalibration = (
  target: 'osd-small' | 'osd-normal'
) => {
  const otherTarget =
    target === 'osd-small' ? 'osd-normal' : 'osd-small'
  if (!activeTargets.has(otherTarget)) return

  cancelWindowScaleCalibration(otherTarget)
  activeTargets.delete(otherTarget)
  setTargetCalibrating(otherTarget, false)
  renderTargetValues(otherTarget)
}

const previewFieldValue = (
  target: WindowScaleTarget,
  field: WindowScaleBaselineField,
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
  setTargetCalibrating(target, true)
  renderTargetValues(target, preview)
}

const getButtonStep = (field: WindowScaleBaselineField) => {
  return isScaleField(field) ? 0.5 : 10
}

const getRelativeSliderStep = (
  field: WindowScaleBaselineField,
  startValue: number
) => {
  if (isScaleField(field)) {
    return Math.max(0.05, startValue / 200)
  }
  return Math.max(1, Math.round(startValue / 200))
}

const finishTargetCalibration = (
  target: WindowScaleTarget,
  action: CalibrationAction
) => {
  if (action === 'confirm') {
    const baseline = readWindowScaleBaseline(target)
    commitWindowScaleBaseline(target, baseline)
  } else {
    cancelWindowScaleCalibration(target)
  }

  activeTargets.delete(target)
  setTargetCalibrating(target, false)
  if (target === 'osd-small' || target === 'osd-normal') {
    restoreOsdModePreview()
  }
  renderTargetValues(target)
  scheduleDecorate()
}

const cancelAllCalibrations = () => {
  for (const target of Array.from(activeTargets)) {
    cancelWindowScaleCalibration(target)
    setTargetCalibrating(target, false)
    renderTargetValues(target)
  }
  activeTargets.clear()
  restoreOsdModePreview()
  scheduleDecorate()
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

  const startValue =
    sliderStartValues.get(slider) || readWindowScaleBaseline(target)[field]
  const delta = Number(slider.value)
  const step = getRelativeSliderStep(field, startValue)
  previewFieldValue(target, field, startValue + delta * step)
}

const handleChange = (event: Event) => {
  const targetElement = event.target as HTMLElement
  const slider = targetElement.closest<HTMLInputElement>(
    '[data-relative-window-scale-slider="true"]'
  )
  if (slider) {
    event.stopImmediatePropagation()
    event.stopPropagation()
    resetRelativeSlider(slider)
    return
  }

  const input = targetElement.closest<HTMLInputElement>(
    '[data-baseline-input], [data-value]'
  )
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
    event.stopPropagation()
    cancelAllCalibrations()
    return
  }

  if (
    event.key === 'Enter' &&
    (event.ctrlKey || event.metaKey) &&
    activeTargets.size > 0
  ) {
    event.preventDefault()
    event.stopImmediatePropagation()
    event.stopPropagation()
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
  event.stopPropagation()
  previewFieldValue(target, field, Number(input.value))
  input.blur()
}

const handleClick = (event: MouseEvent) => {
  const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-calibration-action]'
  )
  if (actionButton) {
    const target = getTargetFromElement(actionButton)
    const action = actionButton.dataset.calibrationAction as
      | CalibrationAction
      | undefined
    if (!target || !action) return

    event.preventDefault()
    event.stopImmediatePropagation()
    event.stopPropagation()
    finishTargetCalibration(target, action)
    return
  }

  const stepButton = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-baseline-action], [data-action]'
  )
  const target = getTargetFromElement(stepButton)
  const field = getFieldFromElement(stepButton)
  if (!stepButton || !target || !field) return

  event.preventDefault()
  event.stopImmediatePropagation()
  event.stopPropagation()

  const action =
    stepButton.dataset.baselineAction || stepButton.dataset.action
  const direction = action === 'decrease' ? -1 : 1
  const current = readWindowScaleBaseline(target)[field]
  previewFieldValue(
    target,
    field,
    current + getButtonStep(field) * direction
  )
}

export const initializeWindowScaleCalibration = (router: Router) => {
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
  const stopLocaleWatch = watch(
    () => i18n.global.locale.value,
    scheduleDecorate
  )

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

    if (decorateFrame !== null) {
      window.cancelAnimationFrame(decorateFrame)
      decorateFrame = null
    }
  }
}
/* =========== newADD end ======== */
