import {
  observeV327SettingsControl,
  readJsonRecord,
  resolveFeatureLanguage,
  writeJsonRecord,
  writeStorageValue
} from './v327FeatureShared'

const PRESET_CONTROL_ID = 'vutronmusic-osd-preset-setting'
const PRESETS_STORAGE_KEY = 'vutronmusic-osd-presets'
const OSD_STORAGE_KEY = 'osdLyric'
const COVER_CONTROLS_STORAGE_KEY = 'vutronmusic-osd-cover-controls-visible'
const FEATURE_CLASS = 'vutronmusic-osd-preset-transfer-preview'
const PRESET_COMMITTED_EVENT = 'vutronmusic-osd-preset-committed'
const MAX_USER_PRESETS = 50
const MAX_IMPORT_BYTES = 256 * 1024

type PresetSettings = {
  type: 'small' | 'normal'
  mode: 'oneLine' | 'twoLines'
  isWordByWord: boolean
  translationMode: 'none' | 'tlyric' | 'rlyric'
  backgroundColor: string
  playedLrcColor: string
  unplayLrcColor: string
  textShadow: string
  font: string
  align: 'left' | 'center' | 'right'
  showButtonWhenLock: boolean
  coverControlsVisible: boolean
}

type UserPreset = {
  id: string
  name: string
  settings: PresetSettings
}

const TEXTS = {
  zh: {
    previewPlayed: '正在播放的歌词',
    previewWaiting: '下一行歌词预览',
    export: '导出当前',
    import: '导入预设',
    exported: '当前样式预设已导出',
    imported: '预设已导入、应用并可继续修改',
    importFailed: '预设文件无效或超过 256 KB',
    limitReached: `最多保存 ${MAX_USER_PRESETS} 个自定义预设`,
    importedSuffix: '导入'
  },
  zht: {
    previewPlayed: '正在播放的歌詞',
    previewWaiting: '下一行歌詞預覽',
    export: '匯出目前',
    import: '匯入預設',
    exported: '目前樣式預設已匯出',
    imported: '預設已匯入、套用並可繼續修改',
    importFailed: '預設檔案無效或超過 256 KB',
    limitReached: `最多儲存 ${MAX_USER_PRESETS} 個自訂預設`,
    importedSuffix: '匯入'
  },
  en: {
    previewPlayed: 'Current lyric preview',
    previewWaiting: 'Next lyric preview',
    export: 'Export current',
    import: 'Import preset',
    exported: 'Current lyric preset exported',
    imported: 'Preset imported, applied and ready to edit',
    importFailed: 'The preset file is invalid or larger than 256 KB.',
    limitReached: `Up to ${MAX_USER_PRESETS} custom presets are supported.`,
    importedSuffix: 'Imported'
  }
} as const

const sanitizeFileName = (value: string): string =>
  value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 80) || 'desktop-lyric-preset'

const readCurrentSettings = (): PresetSettings => {
  const state = readJsonRecord(OSD_STORAGE_KEY)
  return {
    type: state.type === 'normal' ? 'normal' : 'small',
    mode: state.mode === 'oneLine' ? 'oneLine' : 'twoLines',
    isWordByWord: state.isWordByWord !== false,
    translationMode: ['none', 'tlyric', 'rlyric'].includes(String(state.translationMode))
      ? state.translationMode
      : 'tlyric',
    backgroundColor: String(state.backgroundColor || 'rgba(0, 0, 0, 0)'),
    playedLrcColor: String(state.playedLrcColor || '#37cf88'),
    unplayLrcColor: String(state.unplayLrcColor || 'rgba(210, 210, 210, 1)'),
    textShadow: String(state.textShadow || 'rgba(0, 0, 0, 0.2)'),
    font: String(state.font || 'system-ui').slice(0, 200),
    align: ['left', 'center', 'right'].includes(String(state.align))
      ? state.align
      : 'center',
    showButtonWhenLock: state.showButtonWhenLock !== false,
    coverControlsVisible: localStorage.getItem(COVER_CONTROLS_STORAGE_KEY) !== 'false'
  }
}

const normalizeImportedSettings = (value: unknown): PresetSettings | null => {
  if (!value || typeof value !== 'object') return null
  const settings = value as Partial<PresetSettings>
  return {
    type: settings.type === 'normal' ? 'normal' : 'small',
    mode: settings.mode === 'oneLine' ? 'oneLine' : 'twoLines',
    isWordByWord: settings.isWordByWord !== false,
    translationMode: ['none', 'tlyric', 'rlyric'].includes(String(settings.translationMode))
      ? (settings.translationMode as PresetSettings['translationMode'])
      : 'tlyric',
    backgroundColor: String(settings.backgroundColor || 'rgba(0, 0, 0, 0)').slice(0, 100),
    playedLrcColor: String(settings.playedLrcColor || '#37cf88').slice(0, 100),
    unplayLrcColor: String(settings.unplayLrcColor || 'rgba(210, 210, 210, 1)').slice(0, 100),
    textShadow: String(settings.textShadow || 'rgba(0, 0, 0, 0.2)').slice(0, 100),
    font: String(settings.font || 'system-ui').slice(0, 200),
    align: ['left', 'center', 'right'].includes(String(settings.align))
      ? (settings.align as PresetSettings['align'])
      : 'center',
    showButtonWhenLock: settings.showButtonWhenLock !== false,
    coverControlsVisible: settings.coverControlsVisible !== false
  }
}

const loadUserPresets = (): UserPreset[] => {
  try {
    const value = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.filter(
          (preset): preset is UserPreset =>
            Boolean(
              preset &&
                typeof preset.id === 'string' &&
                preset.id.startsWith('user-') &&
                typeof preset.name === 'string' &&
                preset.settings
            )
        )
      : []
  } catch {
    return []
  }
}

const saveUserPresets = (presets: UserPreset[]): boolean => {
  try {
    const serialized = JSON.stringify(presets.slice(-MAX_USER_PRESETS))
    writeStorageValue(PRESETS_STORAGE_KEY, serialized)
    return localStorage.getItem(PRESETS_STORAGE_KEY) === serialized
  } catch {
    return false
  }
}

const applySettings = (settings: PresetSettings): void => {
  const current = readJsonRecord(OSD_STORAGE_KEY)
  const { coverControlsVisible, ...osdSettings } = settings
  writeJsonRecord(OSD_STORAGE_KEY, { ...current, ...osdSettings })
  writeStorageValue(COVER_CONTROLS_STORAGE_KEY, String(coverControlsVisible))
}

const createUniqueName = (requested: string, existing: UserPreset[]): string => {
  const text = TEXTS[resolveFeatureLanguage()]
  const used = new Set(existing.map((preset) => preset.name.toLocaleLowerCase()))
  const base = requested.trim().slice(0, 80) || text.importedSuffix
  if (!used.has(base.toLocaleLowerCase())) return base

  for (let index = 2; index <= 999; index += 1) {
    const candidate = `${base} ${index}`.slice(0, 80)
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
  }
  return `${base} ${Date.now()}`.slice(0, 80)
}

const installTransferAndPreview = (): boolean => {
  const control = document.getElementById(PRESET_CONTROL_ID)
  const controls = control?.querySelector<HTMLElement>('.vutronmusic-v327-controls')
  if (!control || !controls) return false
  if (control.querySelector(`.${FEATURE_CLASS}`)) return true

  const text = TEXTS[resolveFeatureLanguage()]
  const select = controls.querySelector<HTMLSelectElement>('select')
  const nameInput = controls.querySelector<HTMLInputElement>('input[type="text"]')
  const status = controls.querySelector<HTMLElement>('.vutronmusic-v327-status')
  if (!select || !nameInput) return false

  const wrapper = document.createElement('div')
  const preview = document.createElement('div')
  const previewCover = document.createElement('span')
  const previewLyrics = document.createElement('span')
  const playedLine = document.createElement('strong')
  const waitingLine = document.createElement('small')
  const actionRow = document.createElement('div')
  const exportButton = document.createElement('button')
  const importButton = document.createElement('button')
  const fileInput = document.createElement('input')

  wrapper.className = FEATURE_CLASS
  preview.className = 'vutronmusic-osd-preset-preview'
  previewCover.className = 'vutronmusic-osd-preset-preview-cover'
  previewLyrics.className = 'vutronmusic-osd-preset-preview-lyrics'
  playedLine.textContent = text.previewPlayed
  waitingLine.textContent = text.previewWaiting
  previewLyrics.append(playedLine, waitingLine)
  preview.append(previewCover, previewLyrics)

  actionRow.className = 'vutronmusic-osd-preset-transfer-actions'
  exportButton.type = 'button'
  importButton.type = 'button'
  exportButton.textContent = text.export
  importButton.textContent = text.import
  fileInput.type = 'file'
  fileInput.accept = 'application/json,.json'
  fileInput.hidden = true
  actionRow.append(exportButton, importButton, fileInput)
  wrapper.append(preview, actionRow)
  controls.prepend(wrapper)

  let lastPreviewState = ''
  const renderPreview = () => {
    const settings = readCurrentSettings()
    const serialized = JSON.stringify(settings)
    if (serialized === lastPreviewState) return
    lastPreviewState = serialized

    preview.style.backgroundColor = settings.backgroundColor
    preview.style.fontFamily = settings.font
    preview.style.textAlign = settings.align
    preview.style.textShadow = `0 1px 2px ${settings.textShadow}`
    preview.classList.toggle('has-cover', settings.coverControlsVisible)
    preview.classList.toggle('single-line', settings.mode === 'oneLine')
    previewCover.hidden = !settings.coverControlsVisible
    playedLine.style.color = settings.playedLrcColor
    waitingLine.style.color = settings.unplayLrcColor
    waitingLine.hidden = settings.mode === 'oneLine'
  }

  exportButton.addEventListener('click', () => {
    const name = nameInput.value.trim() || select.selectedOptions[0]?.textContent || 'preset'
    const payload = {
      schema: 'vutronmusic-osd-preset',
      version: 1,
      preset: {
        name,
        settings: readCurrentSettings()
      }
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${sanitizeFileName(name)}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    if (status) status.textContent = text.exported
  })

  importButton.addEventListener('click', () => {
    fileInput.value = ''
    fileInput.click()
  })

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file || file.size <= 0 || file.size > MAX_IMPORT_BYTES) {
      if (status) status.textContent = text.importFailed
      return
    }

    try {
      const value = JSON.parse(await file.text())
      if (value?.schema !== 'vutronmusic-osd-preset' || Number(value?.version) !== 1) {
        throw new Error('Unsupported preset schema')
      }
      const settings = normalizeImportedSettings(value?.preset?.settings)
      if (!settings) throw new Error('Invalid preset settings')

      const existing = loadUserPresets()
      if (existing.length >= MAX_USER_PRESETS) {
        if (status) status.textContent = text.limitReached
        return
      }

      const preset: UserPreset = {
        id:
          typeof crypto.randomUUID === 'function'
            ? `user-${crypto.randomUUID()}`
            : `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: createUniqueName(String(value?.preset?.name || text.importedSuffix), existing),
        settings
      }
      if (!saveUserPresets([...existing, preset])) throw new Error('Could not save preset')

      const option = document.createElement('option')
      option.value = preset.id
      option.textContent = preset.name
      select.appendChild(option)
      select.value = preset.id
      nameInput.value = preset.name
      applySettings(settings)
      lastPreviewState = ''
      renderPreview()
      window.dispatchEvent(new CustomEvent(PRESET_COMMITTED_EVENT))
      if (status) status.textContent = text.imported
    } catch (error) {
      console.warn('[OSD Presets] 导入预设失败：', error)
      if (status) status.textContent = text.importFailed
    }
  })

  const previewTimer = window.setInterval(() => {
    if (!control.isConnected) {
      window.clearInterval(previewTimer)
      return
    }
    renderPreview()
  }, 200)

  renderPreview()
  return true
}

observeV327SettingsControl(installTransferAndPreview)
