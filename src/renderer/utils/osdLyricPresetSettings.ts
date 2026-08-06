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
    description: '选择预设后可继续修改当前设置；自定义预设可直接更新，内置预设会另存为可编辑副本',
    apply: '应用',
    saveCopy: '另存为',
    updateSelected: '更新所选',
    delete: '删除',
    namePlaceholder: '输入预设名称',
    nameRequired: '请先输入预设名称',
    saved: '已保存为新的可编辑预设',
    updated: '所选预设已更新',
    duplicateName: '该名称已被其他预设使用',
    saveFailed: '保存失败，请检查本地存储空间',
    limitReached: `最多保存 ${MAX_USER_PRESETS} 个自定义预设`,
    applied: '预设已应用，可继续修改设置',
    deleted: '预设已删除',
    builtinHint: '内置预设不会被覆盖；修改后点击“另存为”创建可编辑副本',
    customHint: '修改其他桌面歌词设置后，点击“更新所选”即可覆盖当前预设',
    copySuffix: '（自定义）',
    minimal: '极简透明双行',
    centered: '大字居中',
    left: '左对齐单行',
    cover: '封面控制模式'
  },
  zht: {
    title: '桌面歌詞樣式預設',
    description: '選擇預設後可繼續修改目前設定；自訂預設可直接更新，內建預設會另存為可編輯副本',
    apply: '套用',
    saveCopy: '另存為',
    updateSelected: '更新所選',
    delete: '刪除',
    namePlaceholder: '輸入預設名稱',
    nameRequired: '請先輸入預設名稱',
    saved: '已儲存為新的可編輯預設',
    updated: '所選預設已更新',
    duplicateName: '此名稱已被其他預設使用',
    saveFailed: '儲存失敗，請檢查本機儲存空間',
    limitReached: `最多儲存 ${MAX_USER_PRESETS} 個自訂預設`,
    applied: '預設已套用，可繼續修改設定',
    deleted: '預設已刪除',
    builtinHint: '內建預設不會被覆蓋；修改後點擊「另存為」建立可編輯副本',
    customHint: '修改其他桌面歌詞設定後，點擊「更新所選」即可覆蓋目前預設',
    copySuffix: '（自訂）',
    minimal: '極簡透明雙行',
    centered: '大字置中',
    left: '靠左單行',
    cover: '封面控制模式'
  },
  en: {
    title: 'Desktop Lyric Presets',
    description: 'Apply a preset, keep editing the current settings, then update a custom preset or save an editable copy of a built-in preset.',
    apply: 'Apply',
    saveCopy: 'Save Copy',
    updateSelected: 'Update Selected',
    delete: 'Delete',
    namePlaceholder: 'Preset name',
    nameRequired: 'Enter a preset name first.',
    saved: 'Saved as a new editable preset',
    updated: 'Selected preset updated',
    duplicateName: 'Another preset already uses this name.',
    saveFailed: 'Could not save the preset. Check local storage space.',
    limitReached: `Up to ${MAX_USER_PRESETS} custom presets are supported.`,
    applied: 'Preset applied. You can continue editing the settings.',
    deleted: 'Preset deleted',
    builtinHint: 'Built-in presets stay unchanged. Edit the settings and choose “Save Copy”.',
    customHint: 'Edit the desktop lyric settings, then choose “Update Selected” to overwrite this preset.',
    copySuffix: ' (Custom)',
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
    const serialized = JSON.stringify(normalized)
    writeStorageValue(PRESETS_STORAGE_KEY, serialized)
    return localStorage.getItem(PRESETS_STORAGE_KEY) === serialized
  } catch (error) {
    console.warn('[OSD Presets] 保存预设失败：', error)
    return false
  }
}

const getAllPresets = (): OsdPreset[] => [...getBuiltInPresets(), ...loadUserPresets()]

const isUserPreset = (preset: OsdPreset | undefined): preset is OsdPreset =>
  Boolean(preset?.id.startsWith('user-'))

const createUserPresetId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? `user-${crypto.randomUUID()}`
    : `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

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
  const presets = getAllPresets()
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
  } else if (presets.length > 0) {
    select.value = presets[0].id
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
  deleteButton.textContent = text.delete
  status.className = 'vutronmusic-v327-status'
  status.setAttribute('aria-live', 'polite')
  refreshSelect(select)

  const getSelectedPreset = (): OsdPreset | undefined =>
    getAllPresets().find((preset) => preset.id === select.value)

  const syncEditorWithSelection = (showHint = true) => {
    const selected = getSelectedPreset()
    const editable = isUserPreset(selected)

    if (editable && selected) {
      nameInput.value = selected.name
      saveButton.textContent = text.updateSelected
      deleteButton.disabled = false
      if (showHint) status.textContent = text.customHint
      return
    }

    nameInput.value = selected ? `${selected.name}${text.copySuffix}` : ''
    saveButton.textContent = text.saveCopy
    deleteButton.disabled = true
    if (showHint) status.textContent = text.builtinHint
  }

  select.addEventListener('change', () => {
    syncEditorWithSelection()
  })

  applyButton.addEventListener('click', (event) => {
    event.preventDefault()
    const preset = getSelectedPreset()
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
    const selected = getSelectedPreset()
    const existing = loadUserPresets()
    const selectedIndex = selected ? existing.findIndex((preset) => preset.id === selected.id) : -1
    const name = nameInput.value.trim().slice(0, 80)

    if (!name) {
      status.textContent = text.nameRequired
      nameInput.focus()
      return
    }

    const conflictingIndex = existing.findIndex(
      (preset, index) =>
        index !== selectedIndex &&
        preset.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0
    )
    if (conflictingIndex >= 0) {
      status.textContent = text.duplicateName
      nameInput.focus()
      nameInput.select()
      return
    }

    if (selectedIndex < 0 && existing.length >= MAX_USER_PRESETS) {
      status.textContent = text.limitReached
      return
    }

    const preset: OsdPreset = {
      id: selectedIndex >= 0 ? existing[selectedIndex].id : createUserPresetId(),
      name,
      settings: readCurrentSettings()
    }
    const nextPresets =
      selectedIndex >= 0
        ? existing.map((item, index) => (index === selectedIndex ? preset : item))
        : [...existing, preset]

    if (!saveUserPresets(nextPresets)) {
      status.textContent = text.saveFailed
      return
    }

    refreshSelect(select, preset.id)
    syncEditorWithSelection(false)
    status.textContent = selectedIndex >= 0 ? text.updated : text.saved
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
    const selected = getSelectedPreset()
    if (!isUserPreset(selected)) return

    const nextPresets = loadUserPresets().filter((preset) => preset.id !== selected.id)
    if (!saveUserPresets(nextPresets)) {
      status.textContent = text.saveFailed
      return
    }

    refreshSelect(select)
    syncEditorWithSelection(false)
    status.textContent = text.deleted
  })

  controls.append(select, nameInput, applyButton, saveButton, deleteButton, status)
  syncEditorWithSelection()
  const coverControl = document.getElementById('osd-cover-controls-visibility-setting')
  ;(coverControl || lockItem).insertAdjacentElement('afterend', item)
  return true
}

observeV327SettingsControl(ensureControl)
