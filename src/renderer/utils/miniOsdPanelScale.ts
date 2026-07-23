/* ======== newADD start====== */
import { WINDOW_SCALE_BASELINE_CHANGE_EVENT } from './windowScaleBaseline'
import {
  getWindowScaleBaselineStorageKeys,
  readWindowScaleBaseline
} from './windowScaleBaselineStorage'

const STYLE_ID = 'mini-osd-panel-scale-style'
const TARGET = 'osd-small' as const

type RuntimeWindow = Window & {
  __vutronMiniOsdPanelScaleCleanup__?: () => void
}

const readOsdMode = () => {
  try {
    const state = JSON.parse(localStorage.getItem('osdLyric') || '{}')
    return state.type === 'normal' ? 'normal' : 'small'
  } catch {
    return 'small'
  }
}

const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    :root {
      --mini-osd-control-relative-scale: 1;
    }

    html[data-osd-scale-mode='osd-small'] #main.compact-mode .compact-osd-layout {
      grid-template-columns:
        calc(50px * var(--mini-osd-control-relative-scale))
        minmax(0, 1fr) !important;
    }

    html[data-osd-scale-mode='osd-small']
      #main.compact-mode
      .compact-left-panel
      .compact-cover-controls {
      zoom: var(--mini-osd-control-relative-scale);
    }
  `
  document.head.appendChild(style)
}

const updateMiniPanelScale = () => {
  const root = document.documentElement

  if (readOsdMode() !== 'small') {
    root.style.setProperty('--mini-osd-control-relative-scale', '1')
    return
  }

  const baseline = readWindowScaleBaseline(TARGET)
  const lyricBase = Math.max(0.01, baseline.baseFontSize)
  const relativeScale = baseline.miniControlBaseSize / lyricBase

  root.style.setProperty('--mini-osd-control-relative-scale', relativeScale.toFixed(4))
  root.dataset.miniOsdControlBaseSize = String(baseline.miniControlBaseSize)
}

export const initializeMiniOsdPanelScale = () => {
  const runtimeWindow = window as RuntimeWindow
  runtimeWindow.__vutronMiniOsdPanelScaleCleanup__?.()

  injectStyle()
  updateMiniPanelScale()

  const handleStorage = (event: StorageEvent) => {
    const keys = getWindowScaleBaselineStorageKeys(TARGET)
    if (event.key === 'osdLyric' || keys.includes(event.key || '')) {
      updateMiniPanelScale()
    }
  }

  const handleBaselineChange = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (detail?.target && detail.target !== TARGET) return
    updateMiniPanelScale()
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener(WINDOW_SCALE_BASELINE_CHANGE_EVENT, handleBaselineChange)

  const cleanup = () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(WINDOW_SCALE_BASELINE_CHANGE_EVENT, handleBaselineChange)
    delete runtimeWindow.__vutronMiniOsdPanelScaleCleanup__
  }

  runtimeWindow.__vutronMiniOsdPanelScaleCleanup__ = cleanup
  return cleanup
}
/* =========== newADD end ======== */
