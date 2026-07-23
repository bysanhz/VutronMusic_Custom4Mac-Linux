/* ======== newADD start====== */
import { watch } from 'vue'
import type { Router } from 'vue-router'
import i18n from '../plugins/i18n'
import {
  WINDOW_SCALE_BASELINE_CHANGE_EVENT,
  type WindowScaleTarget
} from './windowScaleBaseline'

const MODAL_ID = 'window-scale-calibration-modal'
const STYLE_ID = 'window-scale-calibration-modal-style'
const MAIN_SETTING_SELECTOR =
  '#app .system-settings .app-font-size-setting.window-scale-font-range'
const OSD_CONTROL_SELECTOR = '#osd-window-scale-baseline-setting'
const SHOW_DELAY_MS = 800

let observer: MutationObserver | null = null
let renderFrame: number | null = null
let showTimer: number | null = null
let renderedKey = ''

const translate = (key: string) => String(i18n.global.t(key))

const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .window-scale-calibration-actions {
      display: none !important;
    }

    #${MODAL_ID} {
      position: fixed;
      right: 20px;
      bottom: 78px;
      z-index: 2147483646;
      width: min(360px, calc(100vw - 40px));
      box-sizing: border-box;
      padding: 14px;
      border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
      border-radius: 12px;
      color: var(--color-text);
      background: color-mix(
        in srgb,
        var(--color-body-bg, var(--color-bg, #fff)),
        transparent 4%
      );
      box-shadow: 0 14px 38px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(12px);
      -webkit-app-region: no-drag;
      pointer-events: auto;
    }

    #${MODAL_ID} .window-scale-calibration-modal-title {
      margin-bottom: 5px;
      font-size: 1em;
      font-weight: 800;
    }

    #${MODAL_ID} .window-scale-calibration-modal-description {
      margin-bottom: 12px;
      line-height: 1.4;
      opacity: 0.68;
      font-size: 0.88em;
    }

    #${MODAL_ID} .window-scale-calibration-modal-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    #${MODAL_ID} .window-scale-calibration-modal-button {
      min-width: 68px;
      height: 31px;
      padding: 0 13px;
      border: none;
      border-radius: 7px;
      color: var(--color-text);
      background: color-mix(in srgb, var(--color-text), transparent 90%);
      cursor: pointer;
      font-weight: 700;
    }

    #${MODAL_ID}
      .window-scale-calibration-modal-button[data-calibration-action='confirm'] {
      color: #fff;
      background: var(--color-primary, #335eea);
    }

    #${MODAL_ID} .window-scale-calibration-modal-button:hover {
      filter: brightness(0.96);
    }
  `
  document.head.appendChild(style)
}

const isVisible = (element: HTMLElement) => {
  return element.offsetParent !== null
}

const findActiveTarget = (): WindowScaleTarget | null => {
  const mainSetting = document.querySelector<HTMLElement>(
    `${MAIN_SETTING_SELECTOR}[data-window-scale-calibrating='true']`
  )
  if (mainSetting && isVisible(mainSetting)) return 'main'

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>(
      `${OSD_CONTROL_SELECTOR} [data-section-target][data-window-scale-calibrating='true']`
    )
  ).filter(isVisible)

  const section = sections.at(-1)
  const target = section?.dataset.sectionTarget
  if (target === 'osd-small' || target === 'osd-normal') {
    return target
  }

  return null
}

const getTitleKey = (target: WindowScaleTarget) => {
  if (target === 'main') return 'settings.windowScale.mainTitle'
  if (target === 'osd-small') {
    return 'settings.windowScale.compactDesktop'
  }
  return 'settings.windowScale.normalDesktop'
}

const clearShowTimer = () => {
  if (showTimer === null) return
  window.clearTimeout(showTimer)
  showTimer = null
}

const removeModal = () => {
  document.getElementById(MODAL_ID)?.remove()
  renderedKey = ''
}

const renderModal = () => {
  renderFrame = null
  const target = findActiveTarget()
  if (!target) {
    removeModal()
    return
  }

  const key = `${target}:${String(i18n.global.locale.value)}`
  if (renderedKey === key && document.getElementById(MODAL_ID)) {
    return
  }

  removeModal()
  renderedKey = key

  const modal = document.createElement('div')
  modal.id = MODAL_ID
  modal.dataset.calibrationTarget = target
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'false')
  modal.innerHTML = `
    <div class="window-scale-calibration-modal-title">
      ${translate(getTitleKey(target))}
    </div>
    <div class="window-scale-calibration-modal-description">
      ${translate('settings.windowScale.calibrationHint')}
    </div>
    <div class="window-scale-calibration-modal-buttons">
      <button
        type="button"
        class="window-scale-calibration-modal-button"
        data-calibration-action="cancel"
      >${translate('settings.windowScale.cancel')}</button>
      <button
        type="button"
        class="window-scale-calibration-modal-button"
        data-calibration-action="confirm"
      >${translate('settings.windowScale.confirm')}</button>
    </div>
  `
  document.body.appendChild(modal)
}

const scheduleRenderFrame = () => {
  if (renderFrame !== null) return
  renderFrame = window.requestAnimationFrame(renderModal)
}

const scheduleDelayedRender = () => {
  clearShowTimer()
  removeModal()

  showTimer = window.setTimeout(() => {
    showTimer = null
    scheduleRenderFrame()
  }, SHOW_DELAY_MS)
}

const handleCalibrationStateMutation = () => {
  if (findActiveTarget()) return
  clearShowTimer()
  removeModal()
}

const handleBaselineChange = (event: Event) => {
  const detail = (event as CustomEvent).detail

  if (detail?.preview === true) {
    scheduleDelayedRender()
    return
  }

  clearShowTimer()
  removeModal()
}

export const initializeWindowScaleCalibrationModal = (router: Router) => {
  injectStyle()

  observer = new MutationObserver(handleCalibrationStateMutation)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-window-scale-calibrating'],
    childList: true,
    subtree: true
  })

  window.addEventListener(
    WINDOW_SCALE_BASELINE_CHANGE_EVENT,
    handleBaselineChange
  )

  const removeAfterEach = router.afterEach(() => {
    clearShowTimer()
    removeModal()
  })
  const stopLocaleWatch = watch(
    () => i18n.global.locale.value,
    () => {
      if (!findActiveTarget()) return
      scheduleDelayedRender()
    }
  )

  return () => {
    observer?.disconnect()
    observer = null
    removeAfterEach()
    stopLocaleWatch()
    window.removeEventListener(
      WINDOW_SCALE_BASELINE_CHANGE_EVENT,
      handleBaselineChange
    )
    clearShowTimer()
    removeModal()
    document.getElementById(STYLE_ID)?.remove()

    if (renderFrame !== null) {
      window.cancelAnimationFrame(renderFrame)
      renderFrame = null
    }
  }
}
/* =========== newADD end ======== */
