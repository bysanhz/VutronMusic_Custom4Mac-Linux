/* ======== newADD start====== */
import {
  WINDOW_SCALE_BASELINE_CHANGE_EVENT,
  WINDOW_SCALE_BASELINE_KEYS,
  WindowScaleBaseline,
  WindowScaleTarget,
  sanitizeWindowScaleBaseline
} from './windowScaleBaseline'

const LEGACY_MAIN_MIN_FONT_KEY = 'appWindowScaleMinFontSize'
const LEGACY_OSD_MIN_FONT_KEY = 'osdWindowScaleMinFontSize'
const PREVIEW_KEY_PREFIX = 'windowScaleBaselinePreview:'

const getPreviewKey = (target: WindowScaleTarget) => {
  return `${PREVIEW_KEY_PREFIX}${target}`
}

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

const readPreviewBaseline = (target: WindowScaleTarget) => {
  const raw = localStorage.getItem(getPreviewKey(target))
  if (!raw) return null

  try {
    return sanitizeWindowScaleBaseline(target, JSON.parse(raw))
  } catch {
    localStorage.removeItem(getPreviewKey(target))
    return null
  }
}

export const readPersistedWindowScaleBaseline = (
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
    localStorage.setItem(keys.baseFontSize, String(baseline.baseFontSize))
  }

  return baseline
}

export const readWindowScaleBaseline = (
  target: WindowScaleTarget
): WindowScaleBaseline => {
  return (
    readPreviewBaseline(target) ||
    readPersistedWindowScaleBaseline(target)
  )
}

const dispatchBaselineChange = (
  target: WindowScaleTarget,
  baseline: WindowScaleBaseline,
  preview: boolean
) => {
  window.dispatchEvent(
    new CustomEvent(WINDOW_SCALE_BASELINE_CHANGE_EVENT, {
      detail: {
        target,
        baseline,
        preview
      }
    })
  )
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

export const previewWindowScaleBaseline = (
  target: WindowScaleTarget,
  value: Partial<WindowScaleBaseline>
) => {
  const baseline = sanitizeWindowScaleBaseline(target, value)
  localStorage.setItem(getPreviewKey(target), JSON.stringify(baseline))
  dispatchBaselineChange(target, baseline, true)
  window.mainApi?.send('preview-window-scale-baseline', {
    target,
    baseline
  })
  return baseline
}

export const saveWindowScaleBaseline = previewWindowScaleBaseline

export const commitWindowScaleBaseline = (
  target: WindowScaleTarget,
  value?: Partial<WindowScaleBaseline>
) => {
  const baseline = sanitizeWindowScaleBaseline(
    target,
    value || readWindowScaleBaseline(target)
  )
  const keys = WINDOW_SCALE_BASELINE_KEYS[target]

  localStorage.setItem(keys.minWidth, String(baseline.minWidth))
  localStorage.setItem(keys.minHeight, String(baseline.minHeight))
  localStorage.setItem(keys.baseFontSize, String(baseline.baseFontSize))
  localStorage.removeItem(getPreviewKey(target))

  syncWindowMinimumSize(target, baseline)
  window.mainApi?.send('finish-window-scale-calibration', {
    target,
    action: 'commit',
    baseline
  })
  dispatchBaselineChange(target, baseline, false)
  return baseline
}

export const cancelWindowScaleCalibration = (
  target: WindowScaleTarget
) => {
  localStorage.removeItem(getPreviewKey(target))
  const baseline = readPersistedWindowScaleBaseline(target)

  window.mainApi?.send('finish-window-scale-calibration', {
    target,
    action: 'cancel'
  })
  dispatchBaselineChange(target, baseline, false)
  return baseline
}

export const clearWindowScaleCalibrationPreviews = () => {
  const targets: WindowScaleTarget[] = [
    'main',
    'osd-small',
    'osd-normal'
  ]

  for (const target of targets) {
    localStorage.removeItem(getPreviewKey(target))
    window.mainApi?.send('finish-window-scale-calibration', {
      target,
      action: 'cancel'
    })
  }
}

export const getWindowScaleBaselineStorageKeys = (
  target: WindowScaleTarget
) => {
  return [
    ...Object.values(WINDOW_SCALE_BASELINE_KEYS[target]),
    getPreviewKey(target)
  ]
}
/* =========== newADD end ======== */
