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
const BUILTIN_OVERRIDES_STORAGE_KEY = 'vutronmusic-osd-builtin-preset-overrides'
const COVER_CONTROLS_STORAGE_KEY = 'vutronmusic-osd-cover-controls-visible'
const MAX_USER_PRESETS = 50

const TEXTS = {
  zh: {
    title: '桌面歌词样式预设',
    description: '内置与自定义预设都可直接覆盖保存；内置预设可随时恢复初始样式',
    apply: '应用',
    saveCopy: '另存为',
    updateSelected: '更新所选',
    delete: '删除',
    restoreDefault: '恢复默认',
    namePlaceholder: '输入预设名称',
    nameRequired: '请先输入预设名称',
    saved: '已另存为新的自定义预设',
    updated: '所选预设已覆盖更新',
    restored: '内置预设已恢复默认并应用',
    duplicateName: '该名称已被其他预设使用',
    saveFailed: '保存失败，请检查本地存储空间',
    limitReached: `最多保存 ${MAX_USER_PRESETS} 个自定义预设`,
    applied: '预设已应用，可继续修改后覆盖保存',
    deleted: '预设已删除',
    builtinHint: '修改字体、颜色、排版等设置后，点击“更新所选”即可覆盖这个内置预设',
    customHint: '修改其他桌面歌词设置后，点击“更新所选”即可覆盖当前预设',
    copySuffix: '副本',
    minimal: '极简透明双行',
    centered: '大字居中',
    left: '左对齐单行',
    cover: '封面控制模式'
  },
  zht: {
    title: '桌面歌詞樣式預設',
    description: '內建與自訂預設都可直接覆蓋儲存；內建預設可隨時恢復初始樣式',
    apply: '套用',
    saveCopy: '另存為',
    updateSelected: '更新所選',
    delete: '刪除',
    restoreDefault: '恢復預設',
    namePlaceholder: '輸入預設名稱',
    nameRequired: '請先輸入預設名稱',
    saved: '已另存為新的自訂預設',
    updated: '所選預設已覆蓋更新',
    restored: '內建預設已恢復並套用',
    duplicateName: '此名稱已被其他預設使用',
    saveFailed: '儲存失敗，請檢查本機儲存空間',
    limitReached: `最多儲存 ${MAX_USER_PRESETS} 個自訂預設`,
    applied: '預設已套用，可繼續修改後覆蓋儲存',
    deleted: '預設已刪除',
    builtinHint: '修改字體、顏色、排版等設定後，點擊「更新所選」即可覆蓋這個內建預設',
    customHint: '修改其他桌面歌詞設定後，點擊「更新所選」即可覆蓋目前預設',
    copySuffix: '副本',
    minimal: '極簡透明雙行',
    centered: '大字置中',
    left: '靠左單行',
    cover: '封面控制模式'
  },
  en: {
    title: 'Desktop Lyric Presets',
    description:
      'Built-in and custom presets can both be overwritten; built-in presets can be restored at any time.',
    apply: 'Apply',
    saveCopy: 'Save Copy',
    updateSelected: 'Update Selected',
    delete: 'Delete',
    restoreDefault: 'Restore Default',
    namePlaceholder: 'Preset name',
    nameRequired: 'Enter a preset name first.',
    saved: 'Saved as a new custom preset',
    updated: 'Selected preset overwritten',
    restored: 'Built-in preset restored and applied',
    duplicateName: 'Another preset already uses this name.',
    saveFailed: 'Could not save the preset. Check local storage space.',
    limitReached: `Up to ${MAX_USER_PRESETS} custom presets are supported.`,
    applied: 'Preset applied. Continue editing, then overwrite it when ready.',
    deleted: 'Preset deleted',
    builtinHint:
      'Edit font, colors, layout or other settings, then choose “Update Selected” to overwrite this built-in preset.',
    customHint:
      'Edit the desktop lyric settings, then choose “Update Selected” to overwrite this preset.',
    copySuffix: 'Copy',
    minimal: 'Minimal Transparent Two-line',
    centered: 'Large Centered',
    left: 'Left-aligned Single-line',
    cover: 'Cover Controls'
  }
} as const

const getDefaultBuiltInPresets = (): OsdPreset[] => {
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

const loadPresetArray = (storageKey: string): OsdPreset[] => {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return Array.isArray(value)
      ? value
          .map(normalizePreset)
          .filter((item): item is OsdPreset => item !== null && Boolean(item.name))
      : []
  } catch {
    return []
  }
}

const savePresetArray = (storageKey: string, presets: OsdPreset[]): boolean => {
  try {
    const normalized = presets
      .map(normalizePreset)
      .filter((item): item is OsdPreset => item !== null && Boolean(item.name))
    const serialized = JSON.stringify(normalized)
    writeStorageValue(storageKey, serialized)
    return localStorage.getItem(storageKey) === serialized
  } catch (error) {
    console.warn('[OSD Presets] 保存预设失败：', error)
    return false
  }
}

const loadUserPresets = (): OsdPreset[] =>
  loadPresetArray(PRESETS_STORAGE_KEY)
    .filter((preset) => preset.id.startsWith('user-'))
    .slice(-MAX_USER_PRESETS)

const saveUserPresets = (presets: OsdPreset[]): boolean =>
  savePresetArray(PRESETS_STORAGE_KEY, presets.slice(-MAX_USER_PRESETS))

const loadBuiltInOverrides = (): OsdPreset[] => {
  const allowedIds = new Set(getDefaultBuiltInPresets().map((preset) => preset.id))
  return loadPresetArray(BUILTIN_OVERRIDES_STORAGE_KEY).filter((preset) =>
    allowedIds.has(preset.id)
  )
}

const saveBuiltInOverrides = (presets: OsdPreset[]): boolean =>
  savePresetArray(BUILTIN_OVERRIDES_STORAGE_KEY, presets)

const getBuiltInPresets = (): OsdPreset[] => {
  const overrides = new Map(loadBuiltInOverrides().map((preset) => [preset.id, preset]))
  return getDefaultBuiltInPresets().map((preset) => overrides.get(preset.id) || preset)
}

const getAllPresets = (): OsdPreset[] => [...getBuiltInPresets(), ...loadUserPresets()]

const isBuiltInPreset = (preset: OsdPreset | undefined): boolean =>
  Boolean(preset?.id.startsWith('builtin-'))

const isUserPreset = (preset: OsdPreset | undefined): boolean =>
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

const createUniqueCopyName = (baseName: string, excludeId?: string): string => {
  const text = TEXTS[resolveFeatureLanguage()]
  const usedNames = new Set(
    getAllPresets()
      .filter((preset) => preset.id !== excludeId)
      .map((preset) => preset.name.toLocaleLowerCase())
  )

  const initial = `${baseName} ${text.copySuffix}`.trim()
  if (!usedNames.has(initial.toLocaleLowerCase())) return initial

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseName} ${text.copySuffix} ${index}`.trim()
    if (!usedNames.has(candidate.toLocaleLowerCase())) return candidate
  }

  return `${baseName} ${Date.now()}`
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
  const updateButton = document.createElement('button')
  const copyButton = document.createElement('button')
  const removeButton = document.createElement('button')
  const status = document.createElement('div')

  nameInput.type = 'text'
  nameInput.maxLength = 80
  nameInput.autocomplete = 'off'
  nameInput.placeholder = text.namePlaceholder
  nameInput.setAttribute('aria-label', text.namePlaceholder)

  applyButton.type = 'button'
  updateButton.type = 'button'
  copyButton.type = 'button'
  removeButton.type = 'button'
  applyButton.textContent = text.apply
  updateButton.textContent = text.updateSelected
  copyButton.textContent = text.saveCopy
  status.className = 'vutronmusic-v327-status'
  status.setAttribute('aria-live', 'polite')
  refreshSelect(select)

  const getSelectedPreset = (): OsdPreset | undefined =>
    getAllPresets().find((preset) => preset.id === select.value)

  const syncEditorWithSelection = (showHint = true) => {
    const selected = getSelectedPreset()
    if (!selected) return

    nameInput.value = selected.name
    removeButton.textContent = isBuiltInPreset(selected) ? text.restoreDefault : text.delete
    removeButton.disabled = false
    if (showHint) {
      status.textContent = isBuiltInPreset(selected) ? text.builtinHint : text.customHint
    }
  }

  const hasNameConflict = (name: string, selectedId: string): boolean =>
    getAllPresets().some(
      (preset) =>
        preset.id !== selectedId &&
        preset.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0
    )

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

  const updateSelectedPreset = () => {
    const selected = getSelectedPreset()
    if (!selected) return

    const name = nameInput.value.trim().slice(0, 80)
    if (!name) {
      status.textContent = text.nameRequired
      nameInput.focus()
      return
    }
    if (hasNameConflict(name, selected.id)) {
      status.textContent = text.duplicateName
      nameInput.focus()
      nameInput.select()
      return
    }

    const updatedPreset: OsdPreset = {
      id: selected.id,
      name,
      settings: readCurrentSettings()
    }

    let saved = false
    if (isBuiltInPreset(selected)) {
      const overrides = loadBuiltInOverrides()
      const existingIndex = overrides.findIndex((preset) => preset.id === selected.id)
      const nextOverrides =
        existingIndex >= 0
          ? overrides.map((preset, index) => (index === existingIndex ? updatedPreset : preset))
          : [...overrides, updatedPreset]
      saved = saveBuiltInOverrides(nextOverrides)
    } else if (isUserPreset(selected)) {
      saved = saveUserPresets(
        loadUserPresets().map((preset) => (preset.id === selected.id ? updatedPreset : preset))
      )
    }

    if (!saved) {
      status.textContent = text.saveFailed
      return
    }

    refreshSelect(select, updatedPreset.id)
    syncEditorWithSelection(false)
    status.textContent = text.updated
  }

  const saveCurrentAsCopy = () => {
    const selected = getSelectedPreset()
    const existing = loadUserPresets()
    if (existing.length >= MAX_USER_PRESETS) {
      status.textContent = text.limitReached
      return
    }

    const enteredName = nameInput.value.trim().slice(0, 80)
    const baseName = enteredName || selected?.name || text.title
    const requestedNameConflicts = getAllPresets().some(
      (preset) => preset.name.localeCompare(baseName, undefined, { sensitivity: 'accent' }) === 0
    )
    const name = requestedNameConflicts ? createUniqueCopyName(baseName) : baseName

    const preset: OsdPreset = {
      id: createUserPresetId(),
      name,
      settings: readCurrentSettings()
    }
    if (!saveUserPresets([...existing, preset])) {
      status.textContent = text.saveFailed
      return
    }

    refreshSelect(select, preset.id)
    syncEditorWithSelection(false)
    status.textContent = text.saved
  }

  updateButton.addEventListener('click', (event) => {
    event.preventDefault()
    updateSelectedPreset()
  })

  copyButton.addEventListener('click', (event) => {
    event.preventDefault()
    saveCurrentAsCopy()
  })

  nameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    updateSelectedPreset()
  })

  removeButton.addEventListener('click', (event) => {
    event.preventDefault()
    const selected = getSelectedPreset()
    if (!selected) return

    if (isBuiltInPreset(selected)) {
      const nextOverrides = loadBuiltInOverrides().filter((preset) => preset.id !== selected.id)
      if (!saveBuiltInOverrides(nextOverrides)) {
        status.textContent = text.saveFailed
        return
      }

      const restored = getDefaultBuiltInPresets().find((preset) => preset.id === selected.id)
      refreshSelect(select, selected.id)
      syncEditorWithSelection(false)
      if (restored) applyPreset(restored)
      status.textContent = text.restored
      return
    }

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

  controls.append(select, nameInput, applyButton, updateButton, copyButton, removeButton, status)
  syncEditorWithSelection()
  const coverControl = document.getElementById('osd-cover-controls-visibility-setting')
  ;(coverControl || lockItem).insertAdjacentElement('afterend', item)
  return true
}

observeV327SettingsControl(ensureControl)
