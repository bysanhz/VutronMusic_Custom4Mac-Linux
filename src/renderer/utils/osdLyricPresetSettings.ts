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

const TEXTS = {
  zh: {
    title: '桌面歌词样式预设',
    description: '保存并快速切换字体、排版、颜色、翻译和封面控制区设置',
    apply: '应用',
    save: '保存当前',
    delete: '删除',
    namePrompt: '请输入预设名称',
    saved: '预设已保存',
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
    namePrompt: '請輸入預設名稱',
    saved: '預設已儲存',
    applied: '預設已套用',
    deleted: '預設已刪除',
    minimal: '極簡透明雙行',
    centered: '大字置中',
    left: '靠左單行',
    cover: '封面控制模式'
  },
  en: {
    title: 'Desktop Lyric Presets',
    description:
      'Save and switch font, layout, colors, translation and cover-control settings.',
    apply: 'Apply',
    save: 'Save Current',
    delete: 'Delete',
    namePrompt: 'Preset name',
    saved: 'Preset saved',
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

  return {
    id: String(preset.id),
    name: String(preset.name),
    settings: preset.settings as OsdPresetSettings
  }
}

const loadUserPresets = (): OsdPreset[] => {
  try {
    const value = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.map(normalizePreset).filter((item): item is OsdPreset => item !== null)
      : []
  } catch {
    return []
  }
}

const saveUserPresets = (presets: OsdPreset[]): void => {
  writeStorageValue(PRESETS_STORAGE_KEY, JSON.stringify(presets))
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
  const applyButton = document.createElement('button')
  const saveButton = document.createElement('button')
  const deleteButton = document.createElement('button')
  const status = document.createElement('div')

  applyButton.textContent = text.apply
  saveButton.textContent = text.save
  deleteButton.textContent = text.delete
  status.className = 'vutronmusic-v327-status'
  refreshSelect(select)

  applyButton.addEventListener('click', () => {
    const preset = [...getBuiltInPresets(), ...loadUserPresets()].find(
      (item) => item.id === select.value
    )
    if (!preset) return
    applyPreset(preset)
    status.textContent = text.applied
  })

  saveButton.addEventListener('click', () => {
    const name = window.prompt(text.namePrompt)?.trim()
    if (!name) return

    const preset: OsdPreset = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      settings: readCurrentSettings()
    }
    saveUserPresets([...loadUserPresets(), preset])
    refreshSelect(select, preset.id)
    status.textContent = text.saved
  })

  deleteButton.addEventListener('click', () => {
    if (!select.value.startsWith('user-')) return
    saveUserPresets(loadUserPresets().filter((preset) => preset.id !== select.value))
    refreshSelect(select)
    status.textContent = text.deleted
  })

  controls.append(select, applyButton, saveButton, deleteButton, status)
  const coverControl = document.getElementById('osd-cover-controls-visibility-setting')
  ;(coverControl || lockItem).insertAdjacentElement('afterend', item)
  return true
}

observeV327SettingsControl(ensureControl)
