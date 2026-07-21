/* ======== newADD start====== */
import type { Router } from 'vue-router'
import {
  OSD_SCALE_MAX_FONT_SIZE_KEY,
  OSD_SCALE_MIN_FONT_SIZE_KEY,
  OSD_SCALE_SETTINGS_CHANGE_EVENT,
  readOsdScaleRange
} from './smoothOsdWindowScale'

const CONTROL_ID = 'osd-window-scale-font-range-setting'
const STYLE_ID = 'osd-window-scale-font-range-style'
const MIN_POSITIVE_FONT_SIZE = 1

const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${CONTROL_ID} {
      align-items: start;
    }

    #${CONTROL_ID} .osd-window-scale-card {
      width: min(100%, 330px);
      display: grid;
      gap: 8px;
      padding: 10px 12px;
      box-sizing: border-box;
      border-radius: 10px;
      background: var(--color-secondary-bg);
    }

    #${CONTROL_ID} .osd-window-scale-row {
      display: grid;
      grid-template-columns: minmax(64px, auto) 32px minmax(58px, 1fr) 32px;
      align-items: center;
      gap: 7px;
    }

    #${CONTROL_ID} .osd-window-scale-label {
      opacity: 0.72;
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
      width: 32px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 6px;
      color: var(--color-text);
      background: color-mix(in srgb, var(--color-text), transparent 92%);
      cursor: pointer;
      font-weight: 700;
    }

    #${CONTROL_ID} .osd-window-scale-button:hover:not(:disabled) {
      background: color-mix(in srgb, var(--color-text), transparent 84%);
    }

    #${CONTROL_ID} .osd-window-scale-button:disabled {
      opacity: 0.3;
      cursor: default;
    }
  `
  document.head.appendChild(style)
}

const saveRange = (minValue: number, maxValue: number) => {
  let min = Number.isFinite(minValue) && minValue > 0 ? minValue : MIN_POSITIVE_FONT_SIZE
  let max = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : MIN_POSITIVE_FONT_SIZE

  if (min > max) max = min

  localStorage.setItem(OSD_SCALE_MIN_FONT_SIZE_KEY, String(min))
  localStorage.setItem(OSD_SCALE_MAX_FONT_SIZE_KEY, String(max))
  window.dispatchEvent(new Event(OSD_SCALE_SETTINGS_CHANGE_EVENT))

  return { min, max }
}

const createControl = () => {
  const item = document.createElement('div')
  item.id = CONTROL_ID
  item.className = 'item'
  item.innerHTML = `
    <div class="left">
      <div class="title">桌面歌词窗口缩放字体范围</div>
      <div class="description">窗口缩放时，歌词、封面、图标、按钮和间距统一使用该范围；与主界面设置相互独立</div>
    </div>
    <div class="right">
      <div class="osd-window-scale-card">
        <div class="osd-window-scale-row">
          <span class="osd-window-scale-label">最小字号</span>
          <button type="button" class="osd-window-scale-button" data-action="min-minus">−</button>
          <input type="number" step="1" class="osd-window-scale-input" data-value="min" />
          <button type="button" class="osd-window-scale-button" data-action="min-plus">+</button>
        </div>
        <div class="osd-window-scale-row">
          <span class="osd-window-scale-label">最大字号</span>
          <button type="button" class="osd-window-scale-button" data-action="max-minus">−</button>
          <input type="number" step="1" class="osd-window-scale-input" data-value="max" />
          <button type="button" class="osd-window-scale-button" data-action="max-plus">+</button>
        </div>
      </div>
    </div>
  `

  const minInput = item.querySelector<HTMLInputElement>('[data-value="min"]')!
  const maxInput = item.querySelector<HTMLInputElement>('[data-value="max"]')!
  const minMinus = item.querySelector<HTMLButtonElement>('[data-action="min-minus"]')!

  const render = () => {
    const range = readOsdScaleRange()
    minInput.value = String(range.min)
    maxInput.value = String(range.max)
    minMinus.disabled = range.min <= MIN_POSITIVE_FONT_SIZE
  }

  const commitInputs = (changed: 'min' | 'max') => {
    let min = Number(minInput.value)
    let max = Number(maxInput.value)

    if (!Number.isFinite(min) || min <= 0) min = readOsdScaleRange().min
    if (!Number.isFinite(max) || max <= 0) max = readOsdScaleRange().max

    if (changed === 'min' && min > max) max = min
    if (changed === 'max' && max < min) min = max

    const saved = saveRange(min, max)
    minInput.value = String(saved.min)
    maxInput.value = String(saved.max)
    render()
  }

  minInput.addEventListener('change', () => commitInputs('min'))
  maxInput.addEventListener('change', () => commitInputs('max'))

  item.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
    if (!button || button.disabled) return

    const range = readOsdScaleRange()
    switch (button.dataset.action) {
      case 'min-minus':
        range.min = Math.max(MIN_POSITIVE_FONT_SIZE, range.min - 1)
        break
      case 'min-plus':
        range.min += 1
        if (range.min > range.max) range.max = range.min
        break
      case 'max-minus':
        range.max = Math.max(MIN_POSITIVE_FONT_SIZE, range.max - 1)
        if (range.max < range.min) range.min = range.max
        break
      case 'max-plus':
        range.max += 1
        break
    }

    saveRange(range.min, range.max)
    render()
  })

  render()
  return item
}

const injectControl = () => {
  if (document.getElementById(CONTROL_ID)) return true

  const lockInput = document.getElementById('isLock')
  const osdPanel = lockInput?.closest('.item')?.parentElement
  if (!osdPanel) return false

  injectStyle()
  const numberInputs = osdPanel.querySelectorAll<HTMLInputElement>('input[type="number"].text-input')
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
  return () => timers.forEach((timer) => window.clearTimeout(timer))
}

/**
 * 在桌面歌词设置面板中安装独立缩放范围控件。
 */
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
