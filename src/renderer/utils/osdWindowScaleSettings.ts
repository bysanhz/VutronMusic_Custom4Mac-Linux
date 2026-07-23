/* ======== newADD start====== */
import { watch } from 'vue'
import type { Router } from 'vue-router'
import i18n from '../plugins/i18n'
import type {
  WindowScaleBaseline,
  WindowScaleBaselineField,
  WindowScaleTarget
} from './windowScaleBaseline'
import { getWindowScaleFieldRange } from './windowScaleBaseline'
import {
  readWindowScaleBaseline,
  saveWindowScaleBaseline
} from './windowScaleBaselineStorage'

const CONTROL_ID = 'osd-window-scale-baseline-setting'
const STYLE_ID = 'osd-window-scale-baseline-style'
const ANCHOR_ID = 'osd-window-scale-baseline-anchor'
const LEGACY_FONT_SIZE_ATTRIBUTE =
  'data-legacy-osd-font-size-setting'

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

const TARGET_CONFIG: Array<{
  target: 'osd-small' | 'osd-normal'
  titleKey: string
}> = [
  {
    target: 'osd-small',
    titleKey: 'settings.windowScale.compactDesktop'
  },
  {
    target: 'osd-normal',
    titleKey: 'settings.windowScale.normalDesktop'
  }
]

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
    [${LEGACY_FONT_SIZE_ATTRIBUTE}="true"] {
      display: none !important;
    }

    #${CONTROL_ID} {
      align-items: start;
    }

    #${CONTROL_ID} .osd-window-scale-card {
      width: min(100%, 440px);
      display: grid;
      gap: 12px;
      padding: 12px;
      box-sizing: border-box;
      border-radius: 10px;
      background: var(--color-secondary-bg);
    }

    #${CONTROL_ID} .osd-window-scale-section {
      display: grid;
      gap: 8px;
    }

    #${CONTROL_ID} .osd-window-scale-section + .osd-window-scale-section {
      padding-top: 12px;
      border-top: 1px solid color-mix(in srgb, var(--color-text), transparent 90%);
    }

    #${CONTROL_ID} .osd-window-scale-section-title {
      font-weight: 700;
      opacity: 0.88;
    }

    #${CONTROL_ID} .osd-window-scale-row {
      display: grid;
      grid-template-columns: minmax(92px, 1fr) 30px minmax(72px, 94px) 30px;
      grid-template-rows: auto auto;
      align-items: center;
      gap: 7px;
    }

    #${CONTROL_ID} .osd-window-scale-label {
      opacity: 0.7;
      white-space: nowrap;
      font-weight: 600;
    }

    #${CONTROL_ID} .osd-window-scale-input {
      width: 100%;
      min-width: 0;
      height: 30px;
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

    #${CONTROL_ID} .osd-window-scale-input::-webkit-inner-spin-button,
    #${CONTROL_ID} .osd-window-scale-input::-webkit-outer-spin-button {
      appearance: none;
      margin: 0;
    }

    #${CONTROL_ID} .osd-window-scale-slider {
      grid-column: 1 / -1;
      width: 100%;
      min-width: 0;
      margin: 1px 0 3px;
      cursor: pointer;
    }

    #${CONTROL_ID} .osd-window-scale-button {
      width: 30px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 6px;
      color: var(--color-text);
      background: color-mix(in srgb, var(--color-text), transparent 92%);
      cursor: pointer;
      font-weight: 700;
    }

    #${CONTROL_ID} .osd-window-scale-button:hover {
      background: color-mix(in srgb, var(--color-text), transparent 84%);
    }
  `
  document.head.appendChild(style)
}

const getFieldLabel = (field: WindowScaleBaselineField) => {
  return translate(FIELD_CONFIG[field].labelKey)
}

const createFieldRow = (
  target: 'osd-small' | 'osd-normal',
  field: WindowScaleBaselineField
) => {
  const label = getFieldLabel(field)
  const range = getWindowScaleFieldRange(target, field)
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
    <div class="osd-window-scale-row" data-target="${target}" data-field="${field}">
      <span class="osd-window-scale-label">${label}</span>
      <button
        type="button"
        class="osd-window-scale-button"
        data-action="decrease"
        aria-label="${decreaseLabel}"
        title="${decreaseLabel}"
      >−</button>
      <input
        type="number"
        class="osd-window-scale-input"
        data-value="${field}"
        min="${range.min}"
        max="${range.max}"
        step="${range.step}"
        inputmode="numeric"
        title="${inputHint}"
      />
      <button
        type="button"
        class="osd-window-scale-button"
        data-action="increase"
        aria-label="${increaseLabel}"
        title="${increaseLabel}"
      >+</button>
      <input
        type="range"
        class="osd-window-scale-slider"
        data-slider="${field}"
        min="${range.min}"
        max="${range.max}"
        step="${range.step}"
        title="${sliderHint}"
      />
    </div>
  `
}

const createTargetSection = (
  target: 'osd-small' | 'osd-normal',
  titleKey: string
) => {
  const fields = BASELINE_FIELDS.map((field) =>
    createFieldRow(target, field)
  ).join('')

  return `
    <section class="osd-window-scale-section" data-section-target="${target}">
      <div class="osd-window-scale-section-title">${translate(titleKey)}</div>
      ${fields}
    </section>
  `
}

const renderTarget = (
  item: HTMLElement,
  target: 'osd-small' | 'osd-normal'
) => {
  const baseline = readWindowScaleBaseline(target)
  const section = item.querySelector<HTMLElement>(
    `[data-section-target="${target}"]`
  )
  if (!section) return

  for (const field of BASELINE_FIELDS) {
    const input = section.querySelector<HTMLInputElement>(
      `[data-field="${field}"] [data-value="${field}"]`
    )
    const slider = section.querySelector<HTMLInputElement>(
      `[data-field="${field}"] [data-slider="${field}"]`
    )
    const value = String(baseline[field])

    if (input) input.value = value
    if (slider) slider.value = value
  }
}

const resolveTargetAndField = (element: Element | null) => {
  const row = element?.closest<HTMLElement>('[data-target][data-field]')
  const target = row?.dataset.target as
    | 'osd-small'
    | 'osd-normal'
    | undefined
  const field = row?.dataset.field as
    | WindowScaleBaselineField
    | undefined

  return { target, field }
}

const applyFieldValue = (
  item: HTMLElement,
  target: 'osd-small' | 'osd-normal',
  field: WindowScaleBaselineField,
  value: number
) => {
  if (!Number.isFinite(value)) {
    renderTarget(item, target)
    return
  }

  const baseline = readWindowScaleBaseline(target)
  baseline[field] = value
  saveWindowScaleBaseline(target, baseline)
  renderTarget(item, target)
}

const installControlListeners = (item: HTMLElement) => {
  item.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-action]'
    )
    const { target, field } = resolveTargetAndField(button)
    if (!button || !target || !field) return

    const baseline = readWindowScaleBaseline(target)
    const range = getWindowScaleFieldRange(target, field)
    const direction = button.dataset.action === 'decrease' ? -1 : 1

    applyFieldValue(
      item,
      target,
      field,
      baseline[field] + range.step * direction
    )
  })

  item.addEventListener('input', (event) => {
    const slider = (event.target as HTMLElement).closest<HTMLInputElement>(
      '[data-slider]'
    )
    const { target, field } = resolveTargetAndField(slider)
    if (!slider || !target || !field) return

    applyFieldValue(item, target, field, Number(slider.value))
  })

  item.addEventListener('change', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>(
      '[data-value]'
    )
    const { target, field } = resolveTargetAndField(input)
    if (!input || !target || !field) return

    applyFieldValue(item, target, field, Number(input.value))
  })

  item.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key !== 'Enter') return

    const input = (event.target as HTMLElement).closest<HTMLInputElement>(
      '[data-value]'
    )
    const { target, field } = resolveTargetAndField(input)
    if (!input || !target || !field) return

    keyboardEvent.preventDefault()
    applyFieldValue(item, target, field, Number(input.value))
    input.blur()
  })
}

const createControl = () => {
  const item = document.createElement('div')
  item.id = CONTROL_ID
  item.className = 'item'
  item.innerHTML = `
    <div class="left">
      <div class="title">${translate('settings.windowScale.desktopTitle')}</div>
      <div class="description">${translate('settings.windowScale.desktopDescription')}</div>
    </div>
    <div class="right">
      <div class="osd-window-scale-card">
        ${TARGET_CONFIG.map(({ target, titleKey }) => createTargetSection(target, titleKey)).join('')}
      </div>
    </div>
  `

  installControlListeners(item)
  for (const { target } of TARGET_CONFIG) {
    renderTarget(item, target)
  }
  return item
}

const findOsdPanel = () => {
  const lockInput = document.getElementById('isLock')
  return lockInput?.closest('.item')?.parentElement || null
}

const hideLegacyFontSizeSetting = (osdPanel: Element) => {
  const numberInputs = osdPanel.querySelectorAll<HTMLInputElement>(
    'input[type="number"].text-input'
  )
  const legacyItem = numberInputs.item(1)?.closest<HTMLElement>('.item')
  if (!legacyItem) return null

  legacyItem.setAttribute(LEGACY_FONT_SIZE_ATTRIBUTE, 'true')
  return legacyItem
}

const ensureAnchor = (osdPanel: Element) => {
  const existing = document.getElementById(ANCHOR_ID)
  if (existing) return existing

  const legacyItem = hideLegacyFontSizeSetting(osdPanel)
  const anchor = document.createElement('div')
  anchor.id = ANCHOR_ID
  anchor.hidden = true

  if (legacyItem?.parentElement === osdPanel) {
    legacyItem.insertAdjacentElement('beforebegin', anchor)
  } else {
    osdPanel.appendChild(anchor)
  }

  return anchor
}

const injectControl = () => {
  const osdPanel = findOsdPanel()
  if (!osdPanel) return false

  injectStyle()
  hideLegacyFontSizeSetting(osdPanel)
  if (document.getElementById(CONTROL_ID)) return true

  const anchor = ensureAnchor(osdPanel)
  anchor.insertAdjacentElement('afterend', createControl())
  return true
}

const scheduleInjectionAttempts = () => {
  const delays = [0, 60, 180, 420, 900]
  const timers = delays.map((delay) =>
    window.setTimeout(() => {
      injectControl()
    }, delay)
  )

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer))
  }
}

export const initializeOsdWindowScaleSettings = (router: Router) => {
  let stopAttempts = scheduleInjectionAttempts()

  const restartInjection = () => {
    stopAttempts()
    document.getElementById(CONTROL_ID)?.remove()
    stopAttempts = scheduleInjectionAttempts()
  }

  const removeAfterEach = router.afterEach(restartInjection)
  const stopLocaleWatch = watch(
    () => i18n.global.locale.value,
    restartInjection
  )

  return () => {
    stopAttempts()
    removeAfterEach()
    stopLocaleWatch()
  }
}
/* =========== newADD end ======== */
