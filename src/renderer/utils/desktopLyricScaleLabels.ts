/* ======== newADD start====== */
import { watch } from 'vue'
import type { Router } from 'vue-router'
import i18n from '../plugins/i18n'

const CONTROL_SELECTOR = '#osd-window-scale-baseline-setting'
let observer: MutationObserver | null = null
let updateFrame: number | null = null

const updateLabels = () => {
  updateFrame = null
  observer?.disconnect()

  const label = String(
    i18n.global.t('settings.windowScale.lyricBaseFontSize')
  )
  const fields = document.querySelectorAll<HTMLElement>(
    `${CONTROL_SELECTOR} [data-field="baseFontSize"] .osd-window-scale-label`
  )
  fields.forEach((element) => {
    element.textContent = label
  })

  observer?.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
}

const scheduleUpdate = () => {
  if (updateFrame !== null) return
  updateFrame = window.requestAnimationFrame(updateLabels)
}

export const initializeDesktopLyricScaleLabels = (router: Router) => {
  observer = new MutationObserver(scheduleUpdate)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  })

  const removeAfterEach = router.afterEach(scheduleUpdate)
  const stopLocaleWatch = watch(
    () => i18n.global.locale.value,
    scheduleUpdate
  )
  scheduleUpdate()

  return () => {
    observer?.disconnect()
    observer = null
    removeAfterEach()
    stopLocaleWatch()

    if (updateFrame !== null) {
      window.cancelAnimationFrame(updateFrame)
      updateFrame = null
    }
  }
}
/* =========== newADD end ======== */
