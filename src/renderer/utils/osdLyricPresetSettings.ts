import {
  createV327SettingsItem,
  observeV327SettingsControl,
  readJsonRecord,
  resolveFeatureLanguage,
  writeJsonRecord,
  writeStorageValue
} from './v327FeatureShared'

type OsdPresetSettings = {
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

type OsdPreset = {
  id: string
  name: string
  settings: OsdPresetSettings
}

type CommonPresetSettings = Pick<
  OsdPresetSettings,
  | 'isWordByWord'
  | 'backgroundColor'
  | 'playedLrcColor'
  | 'unplayLrcColor'
  | 'textShadow'
  | 'font'
  | 'showButtonWhenLock'
>

const CONTROL_ID = 'vutronmusic-osd-preset-setting'
const OSD_STORAGE_KEY = 'osdLyric'
const PRESETS_STORAGE_KEY = 'vutronmusic-osd-presets'
const COVER_CONTROLS_STORAGE_KEY = 'vutronmusic-osd-cover-controls-visible'
const MAX_USER_PRESETS = 50

const TEXTS = {
  zh: {
    title: '桌面歌词样式预设',
    description: '保存并快速切换字体、排版、颜色、翻译和封面控制区设置',
    apply: '应用',
    save: '保存当前',
    delete: '删除',
    namePlaceholder: '输入预设名称',
    nameRequired: '请先输入预设名称',
    saved: '预设已保存',
    updated: '同名预设已更新',
    saveFailed: '保存失败，请检查本地存储空间',
    limitReached: `最多保存 ${MAX_USER_PRESETS} 个自定义预设`,
    applied: '预设已应用',
    deleted: '预设已删除',
    minimal: '极简透明双行',
    centered: '大字居中',
    left: '左对齐单行',
    cover: '封面控制模式'
  },
  zht: {
    title: '桌面歌詞樣式預設',
    description: '儲存並快速切換字體、排版、顏色、翻譯和封面控制區設定',
    apply: '套用',
    save: '儲存目前設定',
    delete: '刪除',
    namePlaceholder: '輸入預設名稱',
    nameRequired: '請先輸入預設名稱',
    saved: '預設已儲存',
    updated: '同名預設已更新',
    saveFailed: '儲存失敗，請檢查本機儲存空間',
    limitReached: `最多儲存 ${MAX_USER_PRESETS} 個自訂預設`,
    applied: '預設已套用',
    deleted: '預設已刪除',
    minimal: '極簡透明雙行',
    centered: '大字置中',
    left: '靠左單行',
    cover: '封面控制模式'
  },
  en: {
    title: 'Desktop Lyric Presets',
    description: 'Save and switch font, layout, colors, translation and cover-control settings.',
    apply: 'Apply',
    save: 'Save Current',
    delete: 'Delete',
    namePlaceholder: 'Preset name',
    nameRequired: 'Enter a preset name first.',
    saved: 'Preset saved',
    updated: 'Existing preset updated',
    saveFailed: 'Could not save the preset. Check local storage space.',
    limitReached: `Up to ${MAX_USER_PRESETS} custom presets are supported.`,
    applied: 'Preset applied',
    deleted: 'Preset deleted',
    minimal: 'Minimal Transparent Two-line',
    centered: 'Large Centered',
    left: 'Left-aligned Single-line',
    cover: 'Cover Controls'
  }
} as const

const getBuiltInPresets = (): OsdPreset[] => {
  const text = TEXTS[resolveFeatureLanguage()]
  const common: CommonPresetSettings = {
    isWordByWord: true,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    playedLrcColor: '#37cf88',
    unplayLrcColor: 'rgba(210, 210, 210, 1)',
    textShadow: 'rgba(0, 0, 0, 0.2)',
    font: 'system-ui',
    showButtonWhenLock: true
  }

  return [
    {
      id: 'builtin-minimal',
      name: text.minimal,
      settings: {
        ...common,
        type: 'small',
        mode: 'twoLines',
        translationMode: 'tlyric',
        align: 'center',
        coverControlsVisible: false
      }
    },
    {
      id: 'builtin-centered',
      name: text.centered,
      settings: {
        ...common,
        type: 'normal',
        mode: 'twoLines',
        translationMode: 'tlyric',
        align: 'center',
        coverControlsVisible: false,
        playedLrcColor: 'rgba(255, 255, 255, 1)',
        unplayLrcColor: 'rgba(185, 185, 185, 1)',
        textShadow: 'rgba(0, 0, 0, 0.5)'
      }
    },
    {
      id: 'builtin-left',
      name: text.left,
      settings: {
        ...common,
        type: 'small',
        mode: 'oneLine',
        translationMode: 'none',
        align: 'left',
        coverControlsVisible: false
      }
    },
    {
      id: 'builtin-cover',
      name: text.cover,
      settings: {
        ...common,
        type: 'small',
        mode: 'twoLines',
        translationMode: 'tlyric',
        align: 'center',
        coverControlsVisible: true
      }
    }
  ]
}

const normalizePreset = (value: unknown): OsdPreset | null => {
  if (!value || typeof value !== 'object') return null
  const preset = value as Partial<OsdPreset>
  if (!preset.id || !preset.name || !preset.settings) return null

  const settings = preset.settings as Partial<OsdPresetSettings>
  return {
    id: String(preset.id).slice(0, 120),
    name: String(preset.name).trim().slice(0, 80),
    settings: {
      type: settings.type === 'normal' ? 'normal' : 'small',
      mode: settings.mode === 'oneLine' ? 'oneLine' : 'twoLines',
      isWordByWord: settings.isWordByWord !== false,
      translationMode: ['none', 'tlyric', 'rlyric'].includes(String(settings.translationMode))
        ? (settings.translationMode as OsdPresetSettings['translationMode'])
        : 'tlyric',
      backgroundColor: String(settings.backgroundColor || 'rgba(0, 0, 0, 0)'),
      playedLrcColor: String(settings.playedLrcColor || '#37cf88'),
      unplayLrcColor: String(settings.unplayLrcColor || 'rgba(210, 210, 210, 1)'),
      textShadow: String(settings.textShadow || 'rgba(0, 0, 0, 0.2)'),
      font: String(settings.font || 'system-ui').slice(0, 200),
      align: ['left', 'center', 'right'].includes(String(settings.align))
        ? (settings.align as OsdPresetSettings['align'])
        : 'center',
      showButtonWhenLock: settings.showButtonWhenLock !== false,
      coverControlsVisible: settings.coverControlsVisible !== false
    }
  }
}

const loadUserPresets = (): OsdPreset[] => {
  try {
    const value = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value
          .map(normalizePreset)
          .filter((item): item is OsdPreset => item !== null && Boolean(item.name))
          .slice(-MAX_USER_PRESETS)
      : []
  } catch {
    return []
  }
}

const saveUserPresets = (presets: OsdPreset[]): boolean => {
  try {
    const normalized = presets
      .map(normalizePreset)
      .filter((item): item is OsdPreset => item !== null && Boolean(item.name))
      .slice(-MAX_USER_PRESETS)
    writeStorageValue(PRESETS_STORAGE_KEY, JSON.stringify(normalized))
    return localStorage.getItem(PRESETS_STORAGE_KEY) === JSON.stringify(normalized)
  } catch (error) {
    console.warn('[OSD Presets] 保存预设失败：', error)
    return false
  }
}

const readCurrentSettings = (): OsdPresetSettings => {
  const state = readJsonRecord(OSD_STORAGE_KEY)

  return {
    type: state.type === 'normal' ? 'normal' : 'small',
    mode: state.mode === 'oneLine' ? 'oneLine' : 'twoLines',
    isWordByWord: state.isWordByWord !== false,
    translationMode: ['none', 'tlyric', 'rlyric'].includes(state.translationMode)
      ? state.translationMode
      : 'tlyric',
    backgroundColor: String(state.backgroundColor || 'rgba(0, 0, 0, 0)'),
    playedLrcColor: String(state.playedLrcColor || '#37cf88'),
    unplayLrcColor: String(state.unplayLrcColor || 'rgba(210, 210, 210, 1)'),
    textShadow: String(state.textShadow || 'rgba(0, 0, 0, 0.2)'),
    font: String(state.font || 'system-ui'),
    align: ['left', 'center', 'right'].includes(state.align) ? state.align : 'center',
    showButtonWhenLock: state.showButtonWhenLock !== false,
    coverControlsVisible: localStorage.getItem(COVER_CONTROLS_STORAGE_KEY) !== 'false'
  }
}

const applyPreset = (preset: OsdPreset): void => {
  const currentState = readJsonRecord(OSD_STORAGE_KEY)
  const { coverControlsVisible, ...settings } = preset.settings
  writeJsonRecord(OSD_STORAGE_KEY, { ...currentState, ...settings })
  writeStorageValue(COVER_CONTROLS_STORAGE_KEY, String(coverControlsVisible))
}

const refreshSelect = (select: HTMLSelectElement, preferredId?: string): void => {
  const presets = [...getBuiltInPresets(), ...loadUserPresets()]
  const previousValue = preferredId || select.value
  select.replaceChildren()

  presets.forEach((preset) => {
    const option = document.createElement('option')
    option.value = preset.id
    option.textContent = preset.name
    select.appendChild(option)
  })

  if (presets.some((preset) => preset.id === previousValue)) {
    select.value = previousValue
  }
}

const ensureControl = (): boolean => {
  const lockItem = document.getElementById('isLock')?.closest<HTMLElement>('.item')
  if (!lockItem?.parentElement) return false
  if (document.getElementById(CONTROL_ID)) return true

  const text = TEXTS[resolveFeatureLanguage()]
  const item = createV327SettingsItem(CONTROL_ID, text.title, text.description)
  const controls = item.querySelector<HTMLElement>('.vutronmusic-v327-controls')!
  const select = document.createElement('select')
  const nameInput = document.createElement('input')
  const applyButton = document.createElement('button')
  const saveButton = document.createElement('button')
  const deleteButton = document.createElement('button')
  const status = document.createElement('div')

  nameInput.type = 'text'
  nameInput.maxLength = 80
  nameInput.autocomplete = 'off'
  nameInput.placeholder = text.namePlaceholder
  nameInput.setAttribute('aria-label', text.namePlaceholder)

  applyButton.type = 'button'
  saveButton.type = 'button'
  deleteButton.type = 'button'
  applyButton.textContent = text.apply
  saveButton.textContent = text.save
  deleteButton.textContent = text.delete
  status.className = 'vutronmusic-v327-status'
  status.setAttribute('aria-live', 'polite')
  refreshSelect(select)

  applyButton.addEventListener('click', (event) => {
    event.preventDefault()
    const preset = [...getBuiltInPresets(), ...loadUserPresets()].find(
      (candidate) => candidate.id === select.value
    )
    if (!preset) return

    try {
      applyPreset(preset)
      status.textContent = text.applied
    } catch (error) {
      console.warn('[OSD Presets] 应用预设失败：', error)
      status.textContent = text.saveFailed
    }
  })

  const saveCurrentPreset = () => {
    const name = nameInput.value.trim().slice(0, 80)
    if (!name) {
      status.textContent = text.nameRequired
      nameInput.focus()
      return
    }

    const existing = loadUserPresets()
    const duplicateIndex = existing.findIndex(
      (preset) => preset.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0
    )

    if (duplicateIndex === -1 && existing.length >= MAX_USER_PRESETS) {
      status.textContent = text.limitReached
      return
    }

    let preset: OsdPreset
    let nextPresets: OsdPreset[]
    if (duplicateIndex >= 0) {
      preset = {
        ...existing[duplicateIndex],
        name,
        settings: readCurrentSettings()
      }
      nextPresets = existing.map((item, index) => (index === duplicateIndex ? preset : item))
    } else {
      preset = {
        id:
          typeof crypto.randomUUID === 'function'
            ? `user-${crypto.randomUUID()}`
            : `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        settings: readCurrentSettings()
      }
      nextPresets = [...existing, preset]
    }

    if (!saveUserPresets(nextPresets)) {
      status.textContent = text.saveFailed
      return
    }

    refreshSelect(select, preset.id)
    nameInput.value = ''
    status.textContent = duplicateIndex >= 0 ? text.updated : text.saved
  }

  saveButton.addEventListener('click', (event) => {
    event.preventDefault()
    saveCurrentPreset()
  })

  nameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    saveCurrentPreset()
  })

  deleteButton.addEventListener('click', (event) => {
    event.preventDefault()
    if (!select.value.startsWith('user-')) return
    const nextPresets = loadUserPresets().filter((preset) => preset.id !== select.value)
    if (!saveUserPresets(nextPresets)) {
      status.textContent = text.saveFailed
      return
    }
    refreshSelect(select)
    status.textContent = text.deleted
  })

  controls.append(select, nameInput, applyButton, saveButton, deleteButton, status)
  const coverControl = document.getElementById('osd-cover-controls-visibility-setting')
  ;(coverControl || lockItem).insertAdjacentElement('afterend', item)
  return true
}

observeV327SettingsControl(ensureControl)