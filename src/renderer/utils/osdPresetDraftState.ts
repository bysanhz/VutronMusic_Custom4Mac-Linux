import {
  observeV327SettingsControl,
  readJsonRecord,
  resolveFeatureLanguage,
  writeJsonRecord,
  writeStorageValue
} from './v327FeatureShared'

const PRESET_CONTROL_ID = 'vutronmusic-osd-preset-setting'
const OSD_STORAGE_KEY = 'osdLyric'
const COVER_CONTROLS_STORAGE_KEY = 'vutronmusic-osd-cover-controls-visible'
const DRAFT_ROW_CLASS = 'vutronmusic-osd-preset-draft-row'

const TEXTS = {
  zh: {
    saved: '当前设置已保存',
    dirty: '当前设置有未保存修改',
    undo: '撤销本次修改',
    reverted: '已恢复到最近一次应用或保存的状态'
  },
  zht: {
    saved: '目前設定已儲存',
    dirty: '目前設定有未儲存修改',
    undo: '復原本次修改',
    reverted: '已恢復到最近一次套用或儲存的狀態'
  },
  en: {
    saved: 'Current settings are saved',
    dirty: 'Current settings have unsaved changes',
    undo: 'Undo changes',
    reverted: 'Restored the most recently applied or saved settings'
  }
} as const

type DraftSnapshot = {
  osd: Record<string, any>
  coverControlsVisible: boolean
}

const captureSnapshot = (): DraftSnapshot => ({
  osd: readJsonRecord(OSD_STORAGE_KEY),
  coverControlsVisible: localStorage.getItem(COVER_CONTROLS_STORAGE_KEY) !== 'false'
})

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

export const areOsdPresetSnapshotsEqual = (
  left: DraftSnapshot,
  right: DraftSnapshot
): boolean => stableSerialize(left) === stableSerialize(right)

const applySnapshot = (snapshot: DraftSnapshot): void => {
  writeJsonRecord(OSD_STORAGE_KEY, snapshot.osd)
  writeStorageValue(COVER_CONTROLS_STORAGE_KEY, String(snapshot.coverControlsVisible))
}

const installDraftState = (): boolean => {
  const control = document.getElementById(PRESET_CONTROL_ID)
  const controls = control?.querySelector<HTMLElement>('.vutronmusic-v327-controls')
  if (!control || !controls) return false
  if (control.querySelector(`.${DRAFT_ROW_CLASS}`)) return true

  const text = TEXTS[resolveFeatureLanguage()]
  const row = document.createElement('div')
  const indicator = document.createElement('span')
  const undoButton = document.createElement('button')
  const existingStatus = controls.querySelector<HTMLElement>('.vutronmusic-v327-status')

  row.className = DRAFT_ROW_CLASS
  indicator.className = 'vutronmusic-osd-preset-draft-indicator'
  indicator.setAttribute('aria-live', 'polite')
  undoButton.type = 'button'
  undoButton.textContent = text.undo
  undoButton.hidden = true
  row.append(indicator, undoButton)
  controls.append(row)

  let baseline = captureSnapshot()
  let lastSerialized = stableSerialize(baseline)
  let disposed = false

  const render = () => {
    const current = captureSnapshot()
    const serialized = stableSerialize(current)
    if (serialized === lastSerialized) return
    lastSerialized = serialized

    const dirty = !areOsdPresetSnapshotsEqual(current, baseline)
    control.classList.toggle('vutronmusic-preset-dirty', dirty)
    indicator.textContent = dirty ? `● ${text.dirty}` : `✓ ${text.saved}`
    undoButton.hidden = !dirty
  }

  const commitBaseline = (message?: string) => {
    window.setTimeout(() => {
      baseline = captureSnapshot()
      lastSerialized = ''
      render()
      if (message && existingStatus) existingStatus.textContent = message
    }, 80)
  }

  const select = controls.querySelector('select')
  const buttons = [...controls.querySelectorAll<HTMLButtonElement>('button')].filter(
    (button) => button !== undoButton
  )

  select?.addEventListener('change', () => {
    // 仅切换下拉项不会覆盖当前设置；等待“应用”后再提交基线。
    render()
  })

  buttons.forEach((button) => {
    button.addEventListener('click', () => commitBaseline())
  })

  undoButton.addEventListener('click', () => {
    applySnapshot(baseline)
    lastSerialized = ''
    render()
    if (existingStatus) existingStatus.textContent = text.reverted
  })

  const pollTimer = window.setInterval(() => {
    if (disposed || !control.isConnected) {
      window.clearInterval(pollTimer)
      disposed = true
      return
    }
    render()
  }, 250)

  lastSerialized = ''
  render()
  return true
}

observeV327SettingsControl(installDraftState)
