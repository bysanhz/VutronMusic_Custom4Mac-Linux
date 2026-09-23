import {
  observeV327SettingsControl,
  readJsonRecord,
  resolveFeatureLanguage,
  writeStorageValue
} from './v327FeatureShared'
import {
  WindowScaleBaseline,
  WindowScaleTarget,
  getDefaultWindowScaleBaseline,
  sanitizeWindowScaleBaseline
} from './windowScaleBaseline'
import { readWindowScaleBaseline } from './windowScaleBaselineStorage'

const PRESET_CONTROL_ID = 'vutronmusic-osd-preset-setting'
const PRESETS_STORAGE_KEY = 'vutronmusic-osd-presets'
const BUILTIN_OVERRIDES_STORAGE_KEY = 'vutronmusic-osd-builtin-preset-overrides'
const OSD_STORAGE_KEY = 'osdLyric'
const COVER_CONTROLS_STORAGE_KEY = 'vutronmusic-osd-cover-controls-visible'
const FEATURE_CLASS = 'vutronmusic-osd-preset-transfer-preview'
const PRESET_COMMITTED_EVENT = 'vutronmusic-osd-preset-committed'
const CURRENT_SETTINGS_OPTION_ID = '__current-osd-settings__'
const TEMPLATE_BUNDLE_SCHEMA = 'vutronmusic-osd-template-bundle'
const LEGACY_PRESET_SCHEMA = 'vutronmusic-osd-preset'
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
  windowBaseline?: WindowScaleBaseline
}

type StoredPreset = {
  id: string
  name: string
  settings: PresetSettings
}

type ImportedTemplate = {
  id?: string
  name: string
  settings: PresetSettings
}

const TEXTS = {
  zh: {
    previewPlayed: '正在播放的歌词',
    previewWaiting: '下一行歌词预览',
    export: '导出模版',
    import: '导入模版',
    exported: '全部已有模版已导出',
    imported: '模版导入完成',
    importFailed: '模版文件无效或超过 256 KB',
    limitReached: `最多保存 ${MAX_USER_PRESETS} 个自定义预设`,
    importedSuffix: '导入',
    conflictTitle: '发现同名模版',
    conflictDescription: '已存在同名模版“{name}”，请选择如何处理。',
    replaceOne: '替换',
    skipOne: '跳过',
    importSummary: '新增 {added} 个，替换 {replaced} 个，跳过 {skipped} 个'
  },
  zht: {
    previewPlayed: '正在播放的歌詞',
    previewWaiting: '下一行歌詞預覽',
    export: '匯出模版',
    import: '匯入模版',
    exported: '全部現有模版已匯出',
    imported: '模版匯入完成',
    importFailed: '模版檔案無效或超過 256 KB',
    limitReached: `最多儲存 ${MAX_USER_PRESETS} 個自訂預設`,
    importedSuffix: '匯入',
    conflictTitle: '發現同名模版',
    conflictDescription: '已存在同名模版「{name}」，請選擇如何處理。',
    replaceOne: '取代',
    skipOne: '略過',
    importSummary: '新增 {added} 個，取代 {replaced} 個，略過 {skipped} 個'
  },
  en: {
    previewPlayed: 'Current lyric preview',
    previewWaiting: 'Next lyric preview',
    export: 'Export Templates',
    import: 'Import Templates',
    exported: 'All existing templates exported',
    imported: 'Template import complete',
    importFailed: 'The template file is invalid or larger than 256 KB.',
    limitReached: `Up to ${MAX_USER_PRESETS} custom presets are supported.`,
    importedSuffix: 'Imported',
    conflictTitle: 'Template name conflict',
    conflictDescription: 'A template named “{name}” already exists. Choose how to handle it.',
    replaceOne: 'Replace',
    skipOne: 'Skip',
    importSummary: 'Added {added}, replaced {replaced}, skipped {skipped}'
  }
} as const

const COMMON_BUILTIN_SETTINGS = {
  isWordByWord: true,
  backgroundColor: 'rgba(0, 0, 0, 0)',
  playedLrcColor: 'rgba(7, 185, 187, 1)',
  unplayLrcColor: 'rgba(239, 152, 207, 1)',
  textShadow: 'rgba(0, 0, 0, 0)',
  font: 'system-ui',
  showButtonWhenLock: true
} as const

const SMALL_DEFAULT_BASELINE = getDefaultWindowScaleBaseline('osd-small')
const NORMAL_DEFAULT_BASELINE = getDefaultWindowScaleBaseline('osd-normal')

const DEFAULT_BUILTIN_SETTINGS: Record<string, PresetSettings> = {
  'builtin-minimal': {
    ...COMMON_BUILTIN_SETTINGS,
    type: 'small',
    mode: 'twoLines',
    translationMode: 'tlyric',
    align: 'center',
    coverControlsVisible: false,
    windowBaseline: { ...SMALL_DEFAULT_BASELINE }
  },
  'builtin-centered': {
    ...COMMON_BUILTIN_SETTINGS,
    type: 'normal',
    mode: 'twoLines',
    translationMode: 'tlyric',
    align: 'center',
    coverControlsVisible: false,
    playedLrcColor: 'rgba(7, 185, 187, 1)',
    unplayLrcColor: 'rgba(239, 152, 207, 1)',
    textShadow: 'rgba(0, 0, 0, 0)',
    windowBaseline: { ...NORMAL_DEFAULT_BASELINE }
  },
  'builtin-left': {
    ...COMMON_BUILTIN_SETTINGS,
    type: 'small',
    mode: 'oneLine',
    translationMode: 'none',
    align: 'left',
    coverControlsVisible: false,
    windowBaseline: { ...SMALL_DEFAULT_BASELINE }
  },
  'builtin-cover': {
    ...COMMON_BUILTIN_SETTINGS,
    type: 'small',
    mode: 'twoLines',
    translationMode: 'tlyric',
    align: 'left',
    coverControlsVisible: true,
    windowBaseline: { ...SMALL_DEFAULT_BASELINE }
  }
}

const getBaselineTarget = (type: 'small' | 'normal'): WindowScaleTarget =>
  type === 'normal' ? 'osd-normal' : 'osd-small'

const normalizeWindowBaseline = (
  type: 'small' | 'normal',
  value: unknown
): WindowScaleBaseline | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return sanitizeWindowScaleBaseline(
    getBaselineTarget(type),
    value as Partial<WindowScaleBaseline>
  )
}

const sanitizeFileName = (value: string): string =>
  value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim()
    .slice(0, 80) || 'desktop-lyric-preset'

const normalizeSettings = (value: unknown): PresetSettings | null => {
  if (!value || typeof value !== 'object') return null
  const settings = value as Partial<PresetSettings>
  const type: 'small' | 'normal' = settings.type === 'normal' ? 'normal' : 'small'
  const windowBaseline = normalizeWindowBaseline(type, settings.windowBaseline)

  return {
    type,
    mode: settings.mode === 'oneLine' ? 'oneLine' : 'twoLines',
    isWordByWord: settings.isWordByWord !== false,
    translationMode: ['none', 'tlyric', 'rlyric'].includes(String(settings.translationMode))
      ? (settings.translationMode as PresetSettings['translationMode'])
      : 'tlyric',
    backgroundColor: String(settings.backgroundColor || 'rgba(0, 0, 0, 0)').slice(0, 100),
    playedLrcColor: String(settings.playedLrcColor || 'rgba(7, 185, 187, 1)').slice(0, 100),
    unplayLrcColor: String(settings.unplayLrcColor || 'rgba(239, 152, 207, 1)').slice(0, 100),
    textShadow: String(settings.textShadow || 'rgba(0, 0, 0, 0)').slice(0, 100),
    font: String(settings.font || 'system-ui').slice(0, 200),
    align: ['left', 'center', 'right'].includes(String(settings.align))
      ? (settings.align as PresetSettings['align'])
      : 'center',
    showButtonWhenLock: settings.showButtonWhenLock !== false,
    coverControlsVisible: settings.coverControlsVisible !== false,
    ...(windowBaseline ? { windowBaseline } : {})
  }
}

const readCurrentSettings = (): PresetSettings => {
  const state = readJsonRecord(OSD_STORAGE_KEY)
  const type: 'small' | 'normal' = state.type === 'normal' ? 'normal' : 'small'
  return normalizeSettings({
    ...state,
    type,
    coverControlsVisible: localStorage.getItem(COVER_CONTROLS_STORAGE_KEY) !== 'false',
    windowBaseline: readWindowScaleBaseline(getBaselineTarget(type))
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
        const name = String(preset.name || '')
          .trim()
          .slice(0, 80)
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

const saveBuiltInOverrides = (presets: StoredPreset[]): boolean => {
  try {
    const normalized = presets.filter((preset) =>
      Object.prototype.hasOwnProperty.call(DEFAULT_BUILTIN_SETTINGS, preset.id)
    )
    const serialized = JSON.stringify(normalized)
    writeStorageValue(BUILTIN_OVERRIDES_STORAGE_KEY, serialized)
    return localStorage.getItem(BUILTIN_OVERRIDES_STORAGE_KEY) === serialized
  } catch {
    return false
  }
}

const createImportedPresetId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? `user-${crypto.randomUUID()}`
    : `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const normalizeImportedTemplate = (value: unknown): ImportedTemplate | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as {
    id?: unknown
    name?: unknown
    settings?: unknown
  }
  const settings = normalizeSettings(record.settings)
  const name = String(record.name || '')
    .trim()
    .slice(0, 80)
  if (!name || !settings) return null

  const id = String(record.id || '')
    .trim()
    .slice(0, 120)
  return {
    ...(id ? { id } : {}),
    name,
    settings
  }
}

const parseImportedTemplates = (value: unknown): ImportedTemplate[] => {
  if (!value || typeof value !== 'object') return []
  const record = value as {
    schema?: unknown
    version?: unknown
    templates?: unknown
    preset?: unknown
  }

  if (
    record.schema === TEMPLATE_BUNDLE_SCHEMA &&
    Number(record.version) === 1 &&
    Array.isArray(record.templates)
  ) {
    return record.templates
      .map(normalizeImportedTemplate)
      .filter((item): item is ImportedTemplate => item !== null)
  }

  const legacyVersion = Number(record.version)
  if (
    record.schema === LEGACY_PRESET_SCHEMA &&
    (legacyVersion === 1 || legacyVersion === 2)
  ) {
    const preset = normalizeImportedTemplate(record.preset)
    return preset ? [preset] : []
  }

  return []
}

const formatImportSummary = (
  template: string,
  added: number,
  replaced: number,
  skipped: number
): string =>
  template
    .replace('{added}', String(added))
    .replace('{replaced}', String(replaced))
    .replace('{skipped}', String(skipped))

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

  const layout = document.createElement('div')
  const wrapper = document.createElement('section')
  const controlPane = document.createElement('section')
  const preview = document.createElement('div')
  const previewCover = document.createElement('span')
  const previewLyrics = document.createElement('span')
  const playedLine = document.createElement('strong')
  const waitingLine = document.createElement('small')
  const actionRow = document.createElement('div')
  const exportButton = document.createElement('button')
  const importButton = document.createElement('button')
  const fileInput = document.createElement('input')
  const editor = controls.querySelector<HTMLElement>('.vutronmusic-osd-preset-editor')
  const draftRow = controls.querySelector<HTMLElement>('.vutronmusic-osd-preset-draft-row')

  layout.className = 'vutronmusic-osd-preset-layout'
  wrapper.className = `${FEATURE_CLASS} vutronmusic-osd-preset-preview-pane`
  controlPane.className = 'vutronmusic-osd-preset-control-pane'
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

  const presetActionButtons = [
    ...controls.querySelectorAll<HTMLButtonElement>('.vutronmusic-osd-preset-action')
  ]

  wrapper.append(preview)
  if (status) wrapper.append(status)
  if (draftRow) wrapper.append(draftRow)

  controlPane.append(actionRow)
  if (editor) controlPane.append(editor)

  layout.append(wrapper, controlPane)
  controls.replaceChildren(layout)

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

  type ConflictResolution = 'replace' | 'skip'

  const askConflictResolution = (name: string): Promise<ConflictResolution> =>
    new Promise((resolve) => {
      const overlay = document.createElement('div')
      const dialog = document.createElement('div')
      const title = document.createElement('strong')
      const description = document.createElement('p')
      const buttons = document.createElement('div')

      overlay.className = 'vutronmusic-template-conflict-overlay'
      dialog.className = 'vutronmusic-template-conflict-dialog'
      title.className = 'vutronmusic-template-conflict-title'
      description.className = 'vutronmusic-template-conflict-description'
      buttons.className = 'vutronmusic-template-conflict-actions'

      title.textContent = text.conflictTitle
      description.textContent = text.conflictDescription.replace('{name}', name)

      const createChoiceButton = (
        label: string,
        resolution: ConflictResolution,
        primary = false
      ): HTMLButtonElement => {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = label
        if (primary) button.classList.add('is-primary')
        button.addEventListener('click', () => finish(resolution))
        return button
      }

      const finish = (resolution: ConflictResolution) => {
        document.removeEventListener('keydown', handleKeydown)
        overlay.remove()
        resolve(resolution)
      }

      const handleKeydown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        finish('skip')
      }

      buttons.append(
        createChoiceButton(text.skipOne, 'skip'),
        createChoiceButton(text.replaceOne, 'replace', true)
      )
      dialog.append(title, description, buttons)
      overlay.append(dialog)
      document.body.append(overlay)
      document.addEventListener('keydown', handleKeydown)
    })

  const refreshUserPresetOptions = (
    presets: StoredPreset[],
    preferredValue: string
  ): void => {
    Array.from(select.options)
      .filter((option) => option.value.startsWith('user-'))
      .forEach((option) => option.remove())

    presets.forEach((preset) => {
      const option = document.createElement('option')
      option.value = preset.id
      option.textContent = preset.name
      select.appendChild(option)
    })

    if (Array.from(select.options).some((option) => option.value === preferredValue)) {
      select.value = preferredValue
    }
  }

  exportButton.addEventListener('click', () => {
    const templates = Array.from(select.options)
      .filter((option) => option.value !== CURRENT_SETTINGS_OPTION_ID)
      .map((option): ImportedTemplate | null => {
        const settings = resolveSelectedSettings(option.value)
        const name = String(option.textContent || '')
          .trim()
          .slice(0, 80)
        if (!settings || !name) return null
        return {
          id: option.value,
          name,
          settings
        }
      })
      .filter((template): template is ImportedTemplate => template !== null)

    const payload = {
      schema: TEMPLATE_BUNDLE_SCHEMA,
      version: 1,
      exportedAt: new Date().toISOString(),
      templates
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${sanitizeFileName('vutronmusic-desktop-lyric-templates')}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    if (status) status.textContent = `${text.exported}（${templates.length}）`
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
      const imported = parseImportedTemplates(JSON.parse(await file.text()))
      if (imported.length === 0) throw new Error('Unsupported or empty template bundle')

      const previousValue = select.value
      const originalUsers = loadUserPresets()
      const originalOverrides = loadBuiltInOverrides()
      const nextUsers = originalUsers.map((preset) => ({ ...preset }))
      const nextOverrides = originalOverrides.map((preset) => ({ ...preset }))
      const builtInCatalog = Array.from(select.options)
        .filter((option) => option.value.startsWith('builtin-'))
        .map((option) => ({
          id: option.value,
          name: String(option.textContent || '').trim()
        }))

      let added = 0
      let replaced = 0
      let skipped = 0

      const shouldReplaceConflict = async (name: string): Promise<boolean> =>
        (await askConflictResolution(name)) === 'replace'

      for (const template of imported) {
        const normalizedName = template.name.toLocaleLowerCase()
        const builtInById = template.id?.startsWith('builtin-')
          ? builtInCatalog.find((preset) => preset.id === template.id)
          : undefined
        const builtInByName = builtInCatalog.find(
          (preset) => preset.name.toLocaleLowerCase() === normalizedName
        )
        const builtInConflict = builtInById || builtInByName
        const userConflict = nextUsers.find(
          (preset) => preset.name.toLocaleLowerCase() === normalizedName
        )

        if (builtInConflict) {
          if (!(await shouldReplaceConflict(builtInConflict.name))) {
            skipped += 1
            continue
          }

          const replacement: StoredPreset = {
            id: builtInConflict.id,
            name: builtInConflict.name,
            settings: template.settings
          }
          const overrideIndex = nextOverrides.findIndex(
            (preset) => preset.id === builtInConflict.id
          )
          if (overrideIndex >= 0) nextOverrides[overrideIndex] = replacement
          else nextOverrides.push(replacement)
          replaced += 1
          continue
        }

        if (userConflict) {
          if (!(await shouldReplaceConflict(userConflict.name))) {
            skipped += 1
            continue
          }

          userConflict.settings = template.settings
          replaced += 1
          continue
        }

        if (nextUsers.length >= MAX_USER_PRESETS) {
          skipped += 1
          continue
        }

        nextUsers.push({
          id: createImportedPresetId(),
          name: template.name,
          settings: template.settings
        })
        added += 1
      }

      if (added > 0 || replaced > 0) {
        const savedOverrides = saveBuiltInOverrides(nextOverrides)
        const savedUsers = saveUserPresets(nextUsers)
        if (!savedOverrides || !savedUsers) {
          saveBuiltInOverrides(originalOverrides)
          saveUserPresets(originalUsers)
          throw new Error('Could not save imported templates')
        }
      }

      refreshUserPresetOptions(nextUsers, previousValue)
      showSelectedPresetPreview()

      if (status) {
        const summary = formatImportSummary(text.importSummary, added, replaced, skipped)
        status.textContent = `${text.imported}：${summary}`
      }
    } catch (error) {
      console.warn('[OSD Presets] 导入模版失败：', error)
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
