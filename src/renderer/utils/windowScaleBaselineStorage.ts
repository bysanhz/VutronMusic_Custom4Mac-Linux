/* ======== newADD start====== */
import {
  WINDOW_SCALE_BASELINE_CHANGE_EVENT,
  WINDOW_SCALE_BASELINE_KEYS,
  WindowScaleBaseline,
  WindowScaleTarget,
  sanitizeWindowScaleBaseline
} from '@/shared/windowScaleBaseline'

const LEGACY_MAIN_MIN_FONT_KEY = 'appWindowScaleMinFontSize'
const LEGACY_OSD_MIN_FONT_KEY = 'osdWindowScaleMinFontSize'

const readStoredNumber = (key: string) => {
  const raw = localStorage.getItem(key)
  if (raw === null || raw.trim() === '') return undefined

  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

const readLegacyBaseFont = (target: WindowScaleTarget) => {
  if (target === 'main') return readStoredNumber(LEGACY_MAIN_MIN_FONT_KEY)
  return readStoredNumber(LEGACY_OSD_MIN_FONT_KEY)
}

export const readWindowScaleBaseline = (
  target: WindowScaleTarget
): WindowScaleBaseline => {
  const keys = WINDOW_SCALE_BASELINE_KEYS[target]
  const baseline = sanitizeWindowScaleBaseline(target, {
    minWidth: readStoredNumber(keys.minWidth),
    minHeight: readStoredNumber(keys.minHeight),
    baseFontSize:
      readStoredNumber(keys.baseFontSize) ?? readLegacyBaseFont(target)
  })

  if (localStorage.getItem(keys.minWidth) === null) {
    localStorage.setItem(keys.minWidth, String(baseline.minWidth))
  }
  if (localStorage.getItem(keys.minHeight) === null) {
    localStorage.setItem(keys.minHeight, String(baseline.minHeight))
  }
  if (localStorage.getItem(keys.baseFontSize) === null) {
    localStorage.setItem(
      keys.baseFontSize,
      String(baseline.baseFontSize)
    )
  }

  return baseline
}

export const syncWindowMinimumSize = (
  target: WindowScaleTarget,
  baseline: WindowScaleBaseline
) => {
  if (target === 'main') {
    window.mainApi?.send('setStoreSettings', {
      windowScaleBaseline: baseline
    })
    return
  }

  window.mainApi?.send('updateOsdState', {
    [target === 'osd-small'
      ? 'scaleBaselineSmall'
      : 'scaleBaselineNormal']: baseline
  })
}

export const saveWindowScaleBaseline = (
  target: WindowScaleTarget,
  value: Partial<WindowScaleBaseline>
) => {
  const keys = WINDOW_SCALE_BASELINE_KEYS[target]
  const baseline = sanitizeWindowScaleBaseline(target, value)

  localStorage.setItem(keys.minWidth, String(baseline.minWidth))
  localStorage.setItem(keys.minHeight, String(baseline.minHeight))
  localStorage.setItem(
    keys.baseFontSize,
    String(baseline.baseFontSize)
  )

  window.dispatchEvent(
    new CustomEvent(WINDOW_SCALE_BASELINE_CHANGE_EVENT, {
      detail: {
        target,
        baseline
      }
    })
  )
  syncWindowMinimumSize(target, baseline)
  return baseline
}

export const getWindowScaleBaselineStorageKeys = (
  target: WindowScaleTarget
) => {
  return Object.values(WINDOW_SCALE_BASELINE_KEYS[target])
}
/* =========== newADD end ======== */
