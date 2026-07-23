/* ======== newADD start====== */
import { watch } from 'vue'
import type { Router } from 'vue-router'
import i18n from '../plugins/i18n'
import type { WindowScaleTarget } from './windowScaleBaseline'

const MODAL_ID = 'window-scale-calibration-modal'
const STYLE_ID = 'window-scale-calibration-modal-style'
const MAIN_SETTING_SELECTOR =
  '#app .system-settings .app-font-size-setting.window-scale-font-range'
const OSD_CONTROL_SELECTOR = '#osd-window-scale-baseline-setting'

let observer: MutationObserver | null = null
let renderFrame: number | null = null
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
      inset: 0;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(3px);
      -webkit-app-region: no-drag;
    }

    #${MODAL_ID} .window-scale-calibration-dialog {
      width: min(420px, calc(100vw - 48px));
      padding: 20px;
      box-sizing: border-box;
      border-radius: 14px;
      color: var(--color-text);
      background: var(--color-body-bg, var(--color-bg, #fff));
      box-shadow: 0 18px 54px rgba(0, 0, 0, 0.28);
    }

    #${MODAL_ID} .window-scale-calibration-modal-title {
      margin-bottom: 9px;
      font-size: 1.08em;
      font-weight: 800;
    }

    #${MODAL_ID} .window-scale-calibration-modal-description {
      margin-bottom: 18px;
      line-height: 1.55;
      opacity: 0.72;
    }

    #${MODAL_ID} .window-scale-calibration-modal-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    #${MODAL_ID} .window-scale-calibration-modal-button {
      min-width: 76px;
      height: 34px;
      padding: 0 16px;
      border: none;
      border-radius: 8px;
      color: var(--color-text);
      background: color-mix(in srgb, var(--color-text), transparent 90%);
      cursor: pointer;
      font-weight: 750;
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
  modal.setAttribute('aria-modal', 'true')
  modal.innerHTML = `
    <div class="window-scale-calibration-dialog">
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
    </div>
  `
  document.body.appendChild(modal)
}

const scheduleRender = () => {
  if (renderFrame !== null) return
  renderFrame = window.requestAnimationFrame(renderModal)
}

export const initializeWindowScaleCalibrationModal = (router: Router) => {
  injectStyle()

  observer = new MutationObserver(scheduleRender)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-window-scale-calibrating'],
    childList: true,
    subtree: true
  })

  const removeAfterEach = router.afterEach(scheduleRender)
  const stopLocaleWatch = watch(
    () => i18n.global.locale.value,
    scheduleRender
  )
  scheduleRender()

  return () => {
    observer?.disconnect()
    observer = null
    removeAfterEach()
    stopLocaleWatch()
    removeModal()
    document.getElementById(STYLE_ID)?.remove()

    if (renderFrame !== null) {
      window.cancelAnimationFrame(renderFrame)
      renderFrame = null
    }
  }
}
/* =========== newADD end ======== */
