/* ======== newADD start====== */
import { watch } from 'vue'
import type { Router } from 'vue-router'
import i18n from '../plugins/i18n'
import { readWindowScaleBaseline } from './windowScaleBaselineStorage'

const TARGET = 'osd-small' as const
const FIELD = 'miniControlBaseSize' as const
const CONTROL_SELECTOR = '#osd-window-scale-baseline-setting'
const SECTION_SELECTOR = `${CONTROL_SELECTOR} [data-section-target="${TARGET}"]`
const ROW_ID = 'mini-osd-control-base-setting'

let observer: MutationObserver | null = null
let scheduleFrame: number | null = null

const translate = (key: string, params?: Record<string, string>) => {
  return params ? String(i18n.global.t(key, params)) : String(i18n.global.t(key))
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
  const baseline = readWindowScaleBaseline(TARGET)

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
      data-action="decrease"
      aria-label="${decreaseLabel}"
      title="${decreaseLabel}"
    >−</button>
    <input
      type="number"
      class="osd-window-scale-input"
      data-value="${FIELD}"
      step="0.1"
      inputmode="decimal"
      value="${baseline.miniControlBaseSize}"
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
      data-slider="${FIELD}"
      value="0"
      title="${sliderHint}"
    />
  `
  return row
}

const ensureRow = () => {
  scheduleFrame = null
  observer?.disconnect()

  const section = document.querySelector<HTMLElement>(SECTION_SELECTOR)
  if (section && !document.getElementById(ROW_ID)) {
    const row = createRow()

    /*
     * “封面与控件基准”属于迷你桌面歌词同一组基准参数，恢复默认必须放在它后面。
     * V2 的恢复默认控件是运行时追加的，因此优先把本行插到该控件之前；若尚未创建
     * 恢复按钮，再退回到确认/取消操作区之前。这样最终顺序稳定为：
     * 最小宽度 -> 最小高度 -> 歌词基准字号 -> 封面与控件基准 -> 恢复默认。
     */
    const resetControl = section.querySelector('.window-scale-baseline-reset-v2')
    const calibrationActions = section.querySelector('.window-scale-calibration-actions-v2')
    const legacyActions = section.querySelector('.window-scale-calibration-actions')
    const anchor = resetControl || calibrationActions || legacyActions

    if (anchor) {
      anchor.insertAdjacentElement('beforebegin', row)
    } else {
      section.appendChild(row)
    }
  }

  observer?.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
}

const scheduleEnsureRow = () => {
  if (scheduleFrame !== null) return
  scheduleFrame = window.requestAnimationFrame(ensureRow)
}

export const initializeMiniOsdScaleSettings = (router: Router) => {
  observer = new MutationObserver(scheduleEnsureRow)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  })

  const removeAfterEach = router.afterEach(scheduleEnsureRow)
  const stopLocaleWatch = watch(
    () => i18n.global.locale.value,
    () => {
      document.getElementById(ROW_ID)?.remove()
      scheduleEnsureRow()
    }
  )

  scheduleEnsureRow()

  return () => {
    observer?.disconnect()
    observer = null
    removeAfterEach()
    stopLocaleWatch()
    document.getElementById(ROW_ID)?.remove()

    if (scheduleFrame !== null) {
      window.cancelAnimationFrame(scheduleFrame)
      scheduleFrame = null
    }
  }
}
/* =========== newADD end ======== */
