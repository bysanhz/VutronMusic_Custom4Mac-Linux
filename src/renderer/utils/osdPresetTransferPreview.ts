import {
  observeV327SettingsControl,
  readJsonRecord,
  resolveFeatureLanguage,
  writeJsonRecord,
  writeStorageValue
} from './v327FeatureShared'

const PRESET_CONTROL_ID = 'vutronmusic-osd-preset-setting'
const PRESETS_STORAGE_KEY = 'vutronmusic-osd-presets'
const BUILTIN_OVERRIDES_STORAGE_KEY = 'vutronmusic-osd-builtin-preset-overrides'
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

type StoredPreset = {
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

const COMMON_BUILTIN_SETTINGS = {
  isWordByWord: true,
  backgroundColor: 'rgba(0, 0, 0, 0)',
  playedLrcColor: '#37cf88',
  unplayLrcColor: 'rgba(210, 210, 210, 1)',
  textShadow: 'rgba(0, 0, 0, 0.2)',
  font: 'system-ui',
  showButtonWhenLock: true
} as const

const DEFAULT_BUILTIN_SETTINGS: Record<string, PresetSettings> = {
  'builtin-minimal': {
    ...COMMON_BUILTIN_SETTINGS,
    type: 'small',
    mode: 'twoLines',
    translationMode: 'tlyric',
    align: 'center',
    coverControlsVisible: false
  },
  'builtin-centered': {
    ...COMMON_BUILTIN_SETTINGS,
    type: 'normal',
    mode: 'twoLines',
    translationMode: 'tlyric',
    align: 'center',
    coverControlsVisible: false,
    playedLrcColor: 'rgba(255, 255, 255, 1)',
    unplayLrcColor: 'rgba(185, 185, 185, 1)',
    textShadow: 'rgba(0, 0, 0, 0.5)'
  },
  'builtin-left': {
    ...COMMON_BUILTIN_SETTINGS,
    type: 'small',
    mode: 'oneLine',
    translationMode: 'none',
    align: 'left',
    coverControlsVisible: false
  },
  'builtin-cover': {
    ...COMMON_BUILTIN_SETTINGS,
    type: 'small',
    mode: 'twoLines',
    translationMode: 'tlyric',
    align: 'center',
    coverControlsVisible: true
  }
}

const sanitizeFileName = (value: string): string =>
  value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 80) || 'desktop-lyric-preset'

const normalizeSettings = (value: unknown): PresetSettings | null => {
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

const readCurrentSettings = (): PresetSettings => {
  const state = readJsonRecord(OSD_STORAGE_KEY)
  return normalizeSettings({
    ...state,
    coverControlsVisible: localStorage.getItem(COVER_CONTROLS_STORAGE_KEY) !== 'false'
  })!
}

const loadPresetArray = (storageKey: string): StoredPreset[] => {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(value)) return []

    return value
      .map((preset): StoredPreset | null => {
        if (!preset || typeof preset !== 'object') return null
        const settings = normalizeSettings(preset.settings)
        const id = String(preset.id || '').slice(0, 120)
        const name = String(preset.name || '').trim().slice(0, 80)
        if (!id || !name || !settings) return null
        return { id, name, settings }
      })
      .filter((preset): preset is StoredPreset => preset !== null)
  } catch {
    return []
  }
}

const loadUserPresets = (): StoredPreset[] =>
  loadPresetArray(PRESETS_STORAGE_KEY)
    .filter((preset) => preset.id.startsWith('user-'))
    .slice(-MAX_USER_PRESETS)

const loadBuiltInOverrides = (): StoredPreset[] =>
  loadPresetArray(BUILTIN_OVERRIDES_STORAGE_KEY).filter((preset) =>
    Object.prototype.hasOwnProperty.call(DEFAULT_BUILTIN_SETTINGS, preset.id)
  )

const resolveSelectedSettings = (presetId: string): PresetSettings | null => {
  if (presetId.startsWith('user-')) {
    return loadUserPresets().find((preset) => preset.id === presetId)?.settings || null
  }

  const override = loadBuiltInOverrides().find((preset) => preset.id === presetId)
  if (override) return override.settings

  const defaults = DEFAULT_BUILTIN_SETTINGS[presetId]
  return defaults ? { ...defaults } : null
}

const saveUserPresets = (presets: StoredPreset[]): boolean => {
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

const createUniqueName = (requested: string, existing: StoredPreset[]): string => {
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

  const presetActionButtons = [...controls.children].filter(
    (element): element is HTMLButtonElement => element instanceof HTMLButtonElement
  )
  controls.prepend(wrapper)

  let selectedPreviewSettings: PresetSettings | null = null
  let lastPreviewState = ''
  let disposed = false

  const renderPreview = () => {
    const settings = selectedPreviewSettings || readCurrentSettings()
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

  const showSelectedPresetPreview = () => {
    selectedPreviewSettings = resolveSelectedSettings(select.value)
    lastPreviewState = ''
    renderPreview()
  }

  const showCurrentSettingsPreview = () => {
    selectedPreviewSettings = null
    lastPreviewState = ''
    renderPreview()
  }

  const refreshPreviewAfterPresetAction = () => {
    window.setTimeout(showSelectedPresetPreview, 0)
  }

  select.addEventListener('change', showSelectedPresetPreview)
  presetActionButtons.forEach((button) => {
    button.addEventListener('click', refreshPreviewAfterPresetAction)
  })

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === PRESETS_STORAGE_KEY || event.key === BUILTIN_OVERRIDES_STORAGE_KEY) {
      showSelectedPresetPreview()
      return
    }

    if (event.key === OSD_STORAGE_KEY || event.key === COVER_CONTROLS_STORAGE_KEY) {
      showCurrentSettingsPreview()
    }
  }
  window.addEventListener('storage', handleStorageChange)

  const handlePresetCommitted = () => {
    showSelectedPresetPreview()
  }
  window.addEventListener(PRESET_COMMITTED_EVENT, handlePresetCommitted)

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
      const settings = normalizeSettings(value?.preset?.settings)
      if (!settings) throw new Error('Invalid preset settings')

      const existing = loadUserPresets()
      if (existing.length >= MAX_USER_PRESETS) {
        if (status) status.textContent = text.limitReached
        return
      }

      const preset: StoredPreset = {
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
      showCurrentSettingsPreview()
      window.dispatchEvent(new CustomEvent(PRESET_COMMITTED_EVENT))
      if (status) status.textContent = text.imported
    } catch (error) {
      console.warn('[OSD Presets] 导入预设失败：', error)
      if (status) status.textContent = text.importFailed
    }
  })

  const previewTimer = window.setInterval(() => {
    if (disposed || !control.isConnected) {
      disposed = true
      window.clearInterval(previewTimer)
      select.removeEventListener('change', showSelectedPresetPreview)
      presetActionButtons.forEach((button) => {
        button.removeEventListener('click', refreshPreviewAfterPresetAction)
      })
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(PRESET_COMMITTED_EVENT, handlePresetCommitted)
      return
    }
    renderPreview()
  }, 200)

  renderPreview()
  return true
}

observeV327SettingsControl(installTransferAndPreview)
