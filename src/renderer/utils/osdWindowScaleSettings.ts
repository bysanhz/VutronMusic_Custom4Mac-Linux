/* ======== newADD start====== */
import type { Router } from 'vue-router'
import type { WindowScaleBaseline, WindowScaleTarget } from './windowScaleBaseline'
import {
  readWindowScaleBaseline,
  saveWindowScaleBaseline
} from './windowScaleBaselineStorage'

const CONTROL_ID = 'osd-window-scale-baseline-setting'
const STYLE_ID = 'osd-window-scale-baseline-style'

type BaselineField = 'minWidth' | 'minHeight' | 'baseFontSize'

const FIELD_CONFIG: Record<
  BaselineField,
  {
    label: string
    step: number
  }
> = {
  minWidth: {
    label: '最小宽度',
    step: 20
  },
  minHeight: {
    label: '最小高度',
    step: 10
  },
  baseFontSize: {
    label: '基准字号',
    step: 1
  }
}

const BASELINE_FIELDS = Object.keys(FIELD_CONFIG) as BaselineField[]

const TARGET_CONFIG: Array<{
  target: WindowScaleTarget
  title: string
}> = [
  {
    target: 'osd-small',
    title: '紧凑桌面歌词'
  },
  {
    target: 'osd-normal',
    title: '普通桌面歌词'
  }
]

const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${CONTROL_ID} {
      align-items: start;
    }

    #${CONTROL_ID} .osd-window-scale-card {
      width: min(100%, 420px);
      display: grid;
      gap: 12px;
      padding: 12px;
      box-sizing: border-box;
      border-radius: 10px;
      background: var(--color-secondary-bg);
    }

    #${CONTROL_ID} .osd-window-scale-section {
      display: grid;
      gap: 7px;
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
      grid-template-columns: minmax(76px, auto) 30px minmax(70px, 1fr) 30px;
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

const createFieldRow = (
  target: WindowScaleTarget,
  field: BaselineField
) => {
  const label = FIELD_CONFIG[field].label

  return `
    <div class="osd-window-scale-row" data-target="${target}" data-field="${field}">
      <span class="osd-window-scale-label">${label}</span>
      <button type="button" class="osd-window-scale-button" data-action="decrease">−</button>
      <input type="number" step="1" class="osd-window-scale-input" data-value="${field}" />
      <button type="button" class="osd-window-scale-button" data-action="increase">+</button>
    </div>
  `
}

const createTargetSection = (
  target: WindowScaleTarget,
  title: string
) => {
  const fields = BASELINE_FIELDS.map((field) => createFieldRow(target, field)).join('')

  return `
    <section class="osd-window-scale-section" data-section-target="${target}">
      <div class="osd-window-scale-section-title">${title}</div>
      ${fields}
    </section>
  `
}

const renderTarget = (
  item: HTMLElement,
  target: WindowScaleTarget
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
    if (input) input.value = String(baseline[field])
  }
}

const readSectionBaseline = (
  item: HTMLElement,
  target: WindowScaleTarget
) => {
  const current = readWindowScaleBaseline(target)
  const section = item.querySelector<HTMLElement>(
    `[data-section-target="${target}"]`
  )
  if (!section) return current

  const result = { ...current }
  for (const field of BASELINE_FIELDS) {
    const input = section.querySelector<HTMLInputElement>(
      `[data-field="${field}"] [data-value="${field}"]`
    )
    const value = Number(input?.value)
    if (Number.isFinite(value)) result[field] = value
  }
  return result
}

const createControl = () => {
  const item = document.createElement('div')
  item.id = CONTROL_ID
  item.className = 'item'
  item.innerHTML = `
    <div class="left">
      <div class="title">桌面歌词缩放基准</div>
      <div class="description">窗口达到设定的最小尺寸时使用基准字号；继续放大时，歌词、封面、图标、按钮、间距和圆角按同一比例缩放</div>
    </div>
    <div class="right">
      <div class="osd-window-scale-card">
        ${TARGET_CONFIG.map(({ target, title }) => createTargetSection(target, title)).join('')}
      </div>
    </div>
  `

  const renderAll = () => {
    for (const { target } of TARGET_CONFIG) {
      renderTarget(item, target)
    }
  }

  item.addEventListener('change', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>(
      '.osd-window-scale-input'
    )
    const row = input?.closest<HTMLElement>('[data-target][data-field]')
    const target = row?.dataset.target as WindowScaleTarget | undefined
    if (!input || !target) return

    saveWindowScaleBaseline(target, readSectionBaseline(item, target))
    renderTarget(item, target)
  })

  item.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-action]'
    )
    const row = button?.closest<HTMLElement>('[data-target][data-field]')
    const target = row?.dataset.target as WindowScaleTarget | undefined
    const field = row?.dataset.field as BaselineField | undefined
    if (!button || !target || !field) return

    const baseline = readSectionBaseline(item, target)
    const direction = button.dataset.action === 'decrease' ? -1 : 1
    baseline[field] += FIELD_CONFIG[field].step * direction

    saveWindowScaleBaseline(target, baseline)
    renderTarget(item, target)
  })

  renderAll()
  return item
}

const injectControl = () => {
  if (document.getElementById(CONTROL_ID)) return true

  const lockInput = document.getElementById('isLock')
  const osdPanel = lockInput?.closest('.item')?.parentElement
  if (!osdPanel) return false

  injectStyle()
  const numberInputs = osdPanel.querySelectorAll<HTMLInputElement>(
    'input[type="number"].text-input'
  )
  const fontSizeItem = numberInputs.item(1)?.closest('.item')
  const control = createControl()

  if (fontSizeItem?.parentElement === osdPanel) {
    fontSizeItem.insertAdjacentElement('afterend', control)
  } else {
    osdPanel.appendChild(control)
  }

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

  const removeAfterEach = router.afterEach(() => {
    stopAttempts()
    stopAttempts = scheduleInjectionAttempts()
  })

  return () => {
    stopAttempts()
    removeAfterEach()
  }
}
/* =========== newADD end ======== */
