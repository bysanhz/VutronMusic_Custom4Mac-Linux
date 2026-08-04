type SupportedLanguage = 'zh' | 'zht' | 'en'

type JsonRecord = Record<string, any>

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

type UserOsdPreset = {
  id: string
  name: string
  settings: OsdPresetSettings
}

type SleepTimerMode = 'off' | 'minutes' | 'trackEnd'

type SleepTimerState = {
  mode: SleepTimerMode
  endAt: number
  trackId: number | string | null
  lastProgress: number
  lastDuration: number
  completed: boolean
}

const STYLE_ID = 'vutronmusic-v327-feature-style'
const OSD_PRESET_CONTROL_ID = 'vutronmusic-osd-preset-setting'
const SETTINGS_BACKUP_CONTROL_ID = 'vutronmusic-settings-backup-setting'
const SLEEP_TIMER_CONTROL_ID = 'vutronmusic-sleep-timer-setting'
const OSD_STORAGE_KEY = 'osdLyric'
const SETTINGS_STORAGE_KEY = 'settings'
const PLAYER_STORAGE_KEY = 'player'
const OSD_PRESETS_STORAGE_KEY = 'vutronmusic-osd-presets'
const OSD_COVER_CONTROLS_VISIBILITY_KEY = 'vutronmusic-osd-cover-controls-visible'

const TEXTS = {
  zh: {
    osdPresetTitle: '桌面歌词样式预设',
    osdPresetDescription: '保存并快速切换字体、排版、颜色、翻译和封面控制区设置',
    apply: '应用',
    saveCurrent: '保存当前',
    delete: '删除',
    presetNamePrompt: '请输入预设名称',
    presetSaved: '预设已保存',
    presetApplied: '预设已应用',
    presetDeleted: '预设已删除',
    builtinMinimal: '极简透明双行',
    builtinCentered: '大字居中',
    builtinLeft: '左对齐单行',
    builtinCover: '封面控制模式',
    settingsBackupTitle: '设置备份与恢复',
    settingsBackupDescription:
      '导出界面、桌面歌词、快捷键和播放偏好；不会导出登录凭据、Cookie、代理信息和本地目录',
    exportSettings: '导出配置',
    importSettings: '导入配置',
    exporting: '正在导出…',
    exported: '配置已导出到下载目录',
    importConfirm: '导入会覆盖当前可迁移设置，并在完成后重新加载应用。确定继续吗？',
    imported: '配置导入完成，应用将重新加载',
    invalidBackup: '配置文件无效或版本不受支持',
    importFailed: '配置导入失败',
    sleepTimerTitle: '睡眠定时器',
    sleepTimerDescription: '到时平滑暂停播放；关闭应用后不会继续计时',
    sleepOff: '关闭',
    sleep15: '15 分钟后',
    sleep30: '30 分钟后',
    sleep60: '60 分钟后',
    sleep90: '90 分钟后',
    sleepTrackEnd: '当前歌曲结束后',
    start: '启用',
    cancel: '取消',
    sleepInactive: '未启用',
    sleepCountdown: '剩余 {time}',
    sleepTrackWaiting: '将在当前歌曲结束后暂停',
    sleepCompleted: '已按计划暂停播放',
    sleepCanceledByTrackChange: '歌曲已切换，本曲结束定时已取消',
    noTrack: '当前没有可播放的歌曲'
  },
  zht: {
    osdPresetTitle: '桌面歌詞樣式預設',
    osdPresetDescription: '儲存並快速切換字體、排版、顏色、翻譯和封面控制區設定',
    apply: '套用',
    saveCurrent: '儲存目前設定',
    delete: '刪除',
    presetNamePrompt: '請輸入預設名稱',
    presetSaved: '預設已儲存',
    presetApplied: '預設已套用',
    presetDeleted: '預設已刪除',
    builtinMinimal: '極簡透明雙行',
    builtinCentered: '大字置中',
    builtinLeft: '靠左單行',
    builtinCover: '封面控制模式',
    settingsBackupTitle: '設定備份與還原',
    settingsBackupDescription:
      '匯出介面、桌面歌詞、快捷鍵和播放偏好；不會匯出登入憑證、Cookie、代理資訊和本機目錄',
    exportSettings: '匯出設定',
    importSettings: '匯入設定',
    exporting: '正在匯出…',
    exported: '設定已匯出到下載目錄',
    importConfirm: '匯入會覆蓋目前可遷移設定，完成後重新載入應用程式。確定繼續嗎？',
    imported: '設定匯入完成，應用程式將重新載入',
    invalidBackup: '設定檔無效或版本不支援',
    importFailed: '設定匯入失敗',
    sleepTimerTitle: '睡眠定時器',
    sleepTimerDescription: '到時平滑暫停播放；關閉應用程式後不會繼續計時',
    sleepOff: '關閉',
    sleep15: '15 分鐘後',
    sleep30: '30 分鐘後',
    sleep60: '60 分鐘後',
    sleep90: '90 分鐘後',
    sleepTrackEnd: '目前歌曲結束後',
    start: '啟用',
    cancel: '取消',
    sleepInactive: '未啟用',
    sleepCountdown: '剩餘 {time}',
    sleepTrackWaiting: '將在目前歌曲結束後暫停',
    sleepCompleted: '已依計畫暫停播放',
    sleepCanceledByTrackChange: '歌曲已切換，本曲結束定時已取消',
    noTrack: '目前沒有可播放的歌曲'
  },
  en: {
    osdPresetTitle: 'Desktop Lyric Presets',
    osdPresetDescription:
      'Save and switch font, layout, colors, translation and cover-control settings.',
    apply: 'Apply',
    saveCurrent: 'Save Current',
    delete: 'Delete',
    presetNamePrompt: 'Preset name',
    presetSaved: 'Preset saved',
    presetApplied: 'Preset applied',
    presetDeleted: 'Preset deleted',
    builtinMinimal: 'Minimal Transparent Two-line',
    builtinCentered: 'Large Centered',
    builtinLeft: 'Left-aligned Single-line',
    builtinCover: 'Cover Controls',
    settingsBackupTitle: 'Settings Backup and Restore',
    settingsBackupDescription:
      'Exports UI, desktop lyrics, shortcuts and playback preferences. Credentials, cookies, proxy data and local paths are excluded.',
    exportSettings: 'Export Settings',
    importSettings: 'Import Settings',
    exporting: 'Exporting…',
    exported: 'Settings exported to the downloads folder',
    importConfirm:
      'Importing will overwrite migratable settings and reload the app. Continue?',
    imported: 'Settings imported. The app will reload.',
    invalidBackup: 'The settings file is invalid or unsupported.',
    importFailed: 'Failed to import settings',
    sleepTimerTitle: 'Sleep Timer',
    sleepTimerDescription: 'Pauses playback smoothly when due. Timers do not survive app exit.',
    sleepOff: 'Off',
    sleep15: 'After 15 minutes',
    sleep30: 'After 30 minutes',
    sleep60: 'After 60 minutes',
    sleep90: 'After 90 minutes',
    sleepTrackEnd: 'After current track',
    start: 'Start',
    cancel: 'Cancel',
    sleepInactive: 'Inactive',
    sleepCountdown: '{time} remaining',
    sleepTrackWaiting: 'Playback will pause after the current track',
    sleepCompleted: 'Playback paused by sleep timer',
    sleepCanceledByTrackChange: 'Track changed. End-of-track timer canceled.',
    noTrack: 'No track is currently available.'
  }
} as const

const sleepTimerState: SleepTimerState = {
  mode: 'off',
  endAt: 0,
  trackId: null,
  lastProgress: 0,
  lastDuration: 0,
  completed: false
}

let sleepTimerInterval: number | null = null

const resolveLanguage = (): SupportedLanguage => {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}')
    const language = settings?.general?.language
    return language === 'zh' || language === 'zht' ? language : 'en'
  } catch {
    return 'en'
  }
}

const readJsonRecord = (key: string): JsonRecord => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const writeStorageValue = (key: string, newValue: string): void => {
  const oldValue = localStorage.getItem(key)
  localStorage.setItem(key, newValue)
  window.dispatchEvent(
    new StorageEvent('storage', {
      key,
      oldValue,
      newValue,
      storageArea: localStorage,
      url: window.location.href
    })
  )
}

const writeJsonRecord = (key: string, value: JsonRecord): void => {
  writeStorageValue(key, JSON.stringify(value))
}

const deepMerge = (base: JsonRecord, patch: JsonRecord): JsonRecord => {
  const result = cloneJson(base)

  Object.entries(patch).forEach(([key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value)
    } else {
      result[key] = cloneJson(value)
    }
  })

  return result
}

const getBuiltInPresets = (): UserOsdPreset[] => {
  const text = TEXTS[resolveLanguage()]

  return [
    {
      id: 'builtin-minimal',
      name: text.builtinMinimal,
      settings: {
        type: 'small',
        mode: 'twoLines',
        isWordByWord: true,
        translationMode: 'tlyric',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        playedLrcColor: '#37cf88',
        unplayLrcColor: 'rgba(210, 210, 210, 1)',
        textShadow: 'rgba(0, 0, 0, 0.2)',
        font: 'system-ui',
        align: 'center',
        showButtonWhenLock: true,
        coverControlsVisible: false
      }
    },
    {
      id: 'builtin-centered',
      name: text.builtinCentered,
      settings: {
        type: 'normal',
        mode: 'twoLines',
        isWordByWord: true,
        translationMode: 'tlyric',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        playedLrcColor: 'rgba(255, 255, 255, 1)',
        unplayLrcColor: 'rgba(185, 185, 185, 1)',
        textShadow: 'rgba(0, 0, 0, 0.5)',
        font: 'system-ui',
        align: 'center',
        showButtonWhenLock: true,
        coverControlsVisible: false
      }
    },
    {
      id: 'builtin-left',
      name: text.builtinLeft,
      settings: {
        type: 'small',
        mode: 'oneLine',
        isWordByWord: true,
        translationMode: 'none',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        playedLrcColor: '#37cf88',
        unplayLrcColor: 'rgba(210, 210, 210, 1)',
        textShadow: 'rgba(0, 0, 0, 0.25)',
        font: 'system-ui',
        align: 'left',
        showButtonWhenLock: true,
        coverControlsVisible: false
      }
    },
    {
      id: 'builtin-cover',
      name: text.builtinCover,
      settings: {
        type: 'small',
        mode: 'twoLines',
        isWordByWord: true,
        translationMode: 'tlyric',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        playedLrcColor: '#37cf88',
        unplayLrcColor: 'rgba(210, 210, 210, 1)',
        textShadow: 'rgba(0, 0, 0, 0.2)',
        font: 'system-ui',
        align: 'center',
        showButtonWhenLock: true,
        coverControlsVisible: true
      }
    }
  ]
}

const normalizePreset = (value: unknown): UserOsdPreset | null => {
  if (!value || typeof value !== 'object') return null

  const preset = value as Partial<UserOsdPreset>
  if (!preset.id || !preset.name || !preset.settings) return null

  return {
    id: String(preset.id),
    name: String(preset.name),
    settings: preset.settings as OsdPresetSettings
  }
}

const loadUserPresets = (): UserOsdPreset[] => {
  try {
    const value = JSON.parse(localStorage.getItem(OSD_PRESETS_STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.map(normalizePreset).filter((item): item is UserOsdPreset => item !== null)
      : []
  } catch {
    return []
  }
}

const saveUserPresets = (presets: UserOsdPreset[]): void => {
  writeStorageValue(OSD_PRESETS_STORAGE_KEY, JSON.stringify(presets))
}

const readCurrentOsdSettings = (): OsdPresetSettings => {
  const state = readJsonRecord(OSD_STORAGE_KEY)
  const coverControlsVisible =
    localStorage.getItem(OSD_COVER_CONTROLS_VISIBILITY_KEY) !== 'false'

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
    coverControlsVisible
  }
}

const applyOsdPreset = (preset: UserOsdPreset): void => {
  const currentState = readJsonRecord(OSD_STORAGE_KEY)
  const { coverControlsVisible, ...osdSettings } = preset.settings
  writeJsonRecord(OSD_STORAGE_KEY, { ...currentState, ...osdSettings })
  writeStorageValue(OSD_COVER_CONTROLS_VISIBILITY_KEY, String(coverControlsVisible))
}

const sanitizeSettingsForBackup = (settings: JsonRecord): JsonRecord => {
  const result = cloneJson(settings)

  if (result.unblockNeteaseMusic) {
    delete result.unblockNeteaseMusic.jooxCookie
    delete result.unblockNeteaseMusic.qqCookie
  }

  if (result.misc) {
    delete result.misc.proxy
    delete result.misc.realIp
  }

  if (result.localMusic) {
    delete result.localMusic.scanDir
  }

  if (result.autoCacheTrack) {
    delete result.autoCacheTrack.path
  }

  return result
}

const extractPlayerPreferences = (player: JsonRecord): JsonRecord => {
  const allowedKeys = [
    'volume',
    'volumeBeforeMuted',
    'repeatMode',
    '_shuffle',
    'backRate',
    'pitch',
    'biquadParams',
    'biquadUser'
  ]

  return Object.fromEntries(
    allowedKeys.filter((key) => key in player).map((key) => [key, cloneJson(player[key])])
  )
}

const collectUiStorage = (): Record<string, string> => {
  const result: Record<string, string> = {}

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith('vutronmusic-')) continue
    if (key === OSD_PRESETS_STORAGE_KEY || key === OSD_COVER_CONTROLS_VISIBILITY_KEY) continue

    const value = localStorage.getItem(key)
    if (value !== null) result[key] = value
  }

  return result
}

const downloadJson = (filename: string, value: unknown): void => {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const exportSettingsBackup = async (): Promise<void> => {
  const appVersion = await window.mainApi?.invoke('msgRequestGetVersion').catch(() => 'unknown')
  const payload = {
    schemaVersion: 1,
    appVersion: String(appVersion || 'unknown'),
    exportedAt: new Date().toISOString(),
    settings: sanitizeSettingsForBackup(readJsonRecord(SETTINGS_STORAGE_KEY)),
    osdLyric: readJsonRecord(OSD_STORAGE_KEY),
    osdPresets: loadUserPresets(),
    osdCoverControlsVisible:
      localStorage.getItem(OSD_COVER_CONTROLS_VISIBILITY_KEY) !== 'false',
    playerPreferences: extractPlayerPreferences(readJsonRecord(PLAYER_STORAGE_KEY)),
    uiStorage: collectUiStorage()
  }

  const date = new Date().toISOString().slice(0, 10)
  downloadJson(`VutronMusic-settings-${date}.json`, payload)
}

const importSettingsBackup = async (file: File): Promise<void> => {
  const text = TEXTS[resolveLanguage()]
  const payload = JSON.parse(await file.text()) as JsonRecord

  if (payload.schemaVersion !== 1) {
    throw new Error(text.invalidBackup)
  }

  if (!window.confirm(text.importConfirm)) return

  if (payload.settings && typeof payload.settings === 'object') {
    writeJsonRecord(
      SETTINGS_STORAGE_KEY,
      deepMerge(readJsonRecord(SETTINGS_STORAGE_KEY), payload.settings)
    )
  }

  if (payload.osdLyric && typeof payload.osdLyric === 'object') {
    writeJsonRecord(OSD_STORAGE_KEY, deepMerge(readJsonRecord(OSD_STORAGE_KEY), payload.osdLyric))
  }

  if (payload.playerPreferences && typeof payload.playerPreferences === 'object') {
    writeJsonRecord(
      PLAYER_STORAGE_KEY,
      deepMerge(readJsonRecord(PLAYER_STORAGE_KEY), payload.playerPreferences)
    )
  }

  if (Array.isArray(payload.osdPresets)) {
    const presets = payload.osdPresets
      .map(normalizePreset)
      .filter((item): item is UserOsdPreset => item !== null)
    saveUserPresets(presets)
  }

  if (typeof payload.osdCoverControlsVisible === 'boolean') {
    writeStorageValue(
      OSD_COVER_CONTROLS_VISIBILITY_KEY,
      String(payload.osdCoverControlsVisible)
    )
  }

  if (payload.uiStorage && typeof payload.uiStorage === 'object') {
    Object.entries(payload.uiStorage).forEach(([key, value]) => {
      if (key.startsWith('vutronmusic-') && typeof value === 'string') {
        writeStorageValue(key, value)
      }
    })
  }

  window.alert(text.imported)
  window.location.reload()
}

const resolveTrackDurationSeconds = (track: JsonRecord): number => {
  const rawDuration = Number(track?.dt ?? track?.duration ?? 0)
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) return 0
  return rawDuration > 10000 ? rawDuration / 1000 : rawDuration
}

const formatDuration = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
    .toString()
    .padStart(2, '0')}`
}

const updateSleepTimerStatus = (message?: string): void => {
  const text = TEXTS[resolveLanguage()]
  const statusElements = document.querySelectorAll<HTMLElement>('[data-sleep-timer-status]')
  let value = message || text.sleepInactive

  if (!message && sleepTimerState.mode === 'minutes') {
    const remaining = Math.max(0, (sleepTimerState.endAt - Date.now()) / 1000)
    value = text.sleepCountdown.replace('{time}', formatDuration(remaining))
  } else if (!message && sleepTimerState.mode === 'trackEnd') {
    value = text.sleepTrackWaiting
  } else if (!message && sleepTimerState.completed) {
    value = text.sleepCompleted
  }

  statusElements.forEach((element) => {
    element.textContent = value
  })
}

const cancelSleepTimer = (message?: string): void => {
  sleepTimerState.mode = 'off'
  sleepTimerState.endAt = 0
  sleepTimerState.trackId = null
  sleepTimerState.lastProgress = 0
  sleepTimerState.lastDuration = 0

  if (sleepTimerInterval !== null) {
    window.clearInterval(sleepTimerInterval)
    sleepTimerInterval = null
  }

  updateSleepTimerStatus(message)
}

const pauseForSleepTimer = (): void => {
  sleepTimerState.completed = true
  if (window.vutronmusic?.playing) {
    window.mainApi?.send('sleep-timer-pause')
  }
  cancelSleepTimer(TEXTS[resolveLanguage()].sleepCompleted)
}

const tickSleepTimer = (): void => {
  if (sleepTimerState.mode === 'off') return

  if (sleepTimerState.mode === 'minutes') {
    if (Date.now() >= sleepTimerState.endAt) {
      pauseForSleepTimer()
      return
    }
    updateSleepTimerStatus()
    return
  }

  const track = (window.vutronmusic?.currentTrack || {}) as JsonRecord
  const currentTrackId = track.id ?? null
  const progress = Number(window.vutronmusic?.progress || 0)
  const duration = resolveTrackDurationSeconds(track)

  if (sleepTimerState.trackId !== currentTrackId) {
    const text = TEXTS[resolveLanguage()]
    cancelSleepTimer(text.sleepCanceledByTrackChange)
    return
  }

  sleepTimerState.lastProgress = progress
  sleepTimerState.lastDuration = duration

  if (duration > 0 && duration - progress <= 0.8) {
    pauseForSleepTimer()
    return
  }

  updateSleepTimerStatus()
}

const startSleepTimer = (value: string): void => {
  const text = TEXTS[resolveLanguage()]
  sleepTimerState.completed = false

  if (value === 'trackEnd') {
    const track = (window.vutronmusic?.currentTrack || {}) as JsonRecord
    if (!track.id) {
      updateSleepTimerStatus(text.noTrack)
      return
    }

    sleepTimerState.mode = 'trackEnd'
    sleepTimerState.trackId = track.id
    sleepTimerState.endAt = 0
  } else {
    const minutes = Number(value)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      cancelSleepTimer()
      return
    }

    sleepTimerState.mode = 'minutes'
    sleepTimerState.endAt = Date.now() + minutes * 60 * 1000
    sleepTimerState.trackId = null
  }

  if (sleepTimerInterval !== null) window.clearInterval(sleepTimerInterval)
  sleepTimerInterval = window.setInterval(tickSleepTimer, 250)
  tickSleepTimer()
}

const injectStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .vutronmusic-v327-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      width: min(430px, 100%);
    }

    .vutronmusic-v327-controls select,
    .vutronmusic-v327-controls input[type='text'] {
      min-width: 190px;
      height: 38px;
      box-sizing: border-box;
      padding: 0 10px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      outline: none;
      background: var(--color-secondary-bg);
      color: var(--color-text);
      font: inherit;
    }

    .vutronmusic-v327-controls button {
      min-height: 36px;
      white-space: nowrap;
    }

    .vutronmusic-v327-status {
      flex-basis: 100%;
      min-height: 18px;
      color: var(--color-text-secondary);
      font-size: 12px;
      text-align: right;
    }

    @media (max-width: 720px) {
      .vutronmusic-v327-controls {
        justify-content: flex-start;
        width: 100%;
      }

      .vutronmusic-v327-controls select {
        flex: 1 1 190px;
      }

      .vutronmusic-v327-status {
        text-align: left;
      }
    }
  `
  document.head.appendChild(style)
}

const createSettingsItem = (id: string, title: string, description: string): HTMLElement => {
  const item = document.createElement('div')
  item.id = id
  item.className = 'item'

  const left = document.createElement('div')
  left.className = 'left'

  const titleElement = document.createElement('div')
  titleElement.className = 'title'
  titleElement.textContent = title

  const descriptionElement = document.createElement('div')
  descriptionElement.className = 'description'
  descriptionElement.textContent = description

  left.append(titleElement, descriptionElement)

  const right = document.createElement('div')
  right.className = 'right'

  const controls = document.createElement('div')
  controls.className = 'vutronmusic-v327-controls'
  right.appendChild(controls)
  item.append(left, right)

  return item
}

const refreshPresetSelect = (select: HTMLSelectElement, preferredId?: string): void => {
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

const ensureOsdPresetControl = (): boolean => {
  const lockInput = document.getElementById('isLock')
  const lockItem = lockInput?.closest<HTMLElement>('.item')
  if (!lockItem?.parentElement) return false
  if (document.getElementById(OSD_PRESET_CONTROL_ID)) return true

  const text = TEXTS[resolveLanguage()]
  const item = createSettingsItem(
    OSD_PRESET_CONTROL_ID,
    text.osdPresetTitle,
    text.osdPresetDescription
  )
  const controls = item.querySelector<HTMLElement>('.vutronmusic-v327-controls')!
  const select = document.createElement('select')
  const applyButton = document.createElement('button')
  const saveButton = document.createElement('button')
  const deleteButton = document.createElement('button')
  const status = document.createElement('div')
  status.className = 'vutronmusic-v327-status'

  applyButton.textContent = text.apply
  saveButton.textContent = text.saveCurrent
  deleteButton.textContent = text.delete

  refreshPresetSelect(select)

  applyButton.addEventListener('click', () => {
    const preset = [...getBuiltInPresets(), ...loadUserPresets()].find(
      (item) => item.id === select.value
    )
    if (!preset) return
    applyOsdPreset(preset)
    status.textContent = text.presetApplied
  })

  saveButton.addEventListener('click', () => {
    const name = window.prompt(text.presetNamePrompt)?.trim()
    if (!name) return

    const preset: UserOsdPreset = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      settings: readCurrentOsdSettings()
    }
    saveUserPresets([...loadUserPresets(), preset])
    refreshPresetSelect(select, preset.id)
    status.textContent = text.presetSaved
  })

  deleteButton.addEventListener('click', () => {
    if (!select.value.startsWith('user-')) return
    const presets = loadUserPresets().filter((preset) => preset.id !== select.value)
    saveUserPresets(presets)
    refreshPresetSelect(select)
    status.textContent = text.presetDeleted
  })

  controls.append(select, applyButton, saveButton, deleteButton, status)

  const coverControl = document.getElementById('osd-cover-controls-visibility-setting')
  ;(coverControl || lockItem).insertAdjacentElement('afterend', item)
  return true
}

const ensureSettingsBackupControl = (): boolean => {
  const anchorInput = document.getElementById('real-ip') || document.getElementById('enableAmuseServer')
  const anchorItem = anchorInput?.closest<HTMLElement>('.item')
  if (!anchorItem?.parentElement) return false
  if (document.getElementById(SETTINGS_BACKUP_CONTROL_ID)) return true

  const text = TEXTS[resolveLanguage()]
  const item = createSettingsItem(
    SETTINGS_BACKUP_CONTROL_ID,
    text.settingsBackupTitle,
    text.settingsBackupDescription
  )
  const controls = item.querySelector<HTMLElement>('.vutronmusic-v327-controls')!
  const exportButton = document.createElement('button')
  const importButton = document.createElement('button')
  const input = document.createElement('input')
  const status = document.createElement('div')

  exportButton.textContent = text.exportSettings
  importButton.textContent = text.importSettings
  input.type = 'file'
  input.accept = '.json,application/json'
  input.hidden = true
  status.className = 'vutronmusic-v327-status'

  exportButton.addEventListener('click', async () => {
    status.textContent = text.exporting
    try {
      await exportSettingsBackup()
      status.textContent = text.exported
    } catch (error) {
      console.error('[SettingsBackup] 导出失败：', error)
      status.textContent = String(error)
    }
  })

  importButton.addEventListener('click', () => input.click())
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return

    try {
      await importSettingsBackup(file)
    } catch (error) {
      console.error('[SettingsBackup] 导入失败：', error)
      status.textContent = `${text.importFailed}: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      input.value = ''
    }
  })

  controls.append(exportButton, importButton, input, status)
  anchorItem.parentElement.appendChild(item)
  return true
}

const ensureSleepTimerControl = (): boolean => {
  const anchorInput =
    document.getElementById('show-song-chorus') || document.getElementById('jump-to-lyric-begin')
  const anchorItem = anchorInput?.closest<HTMLElement>('.item')
  if (!anchorItem?.parentElement) return false
  if (document.getElementById(SLEEP_TIMER_CONTROL_ID)) {
    updateSleepTimerStatus()
    return true
  }

  const text = TEXTS[resolveLanguage()]
  const item = createSettingsItem(
    SLEEP_TIMER_CONTROL_ID,
    text.sleepTimerTitle,
    text.sleepTimerDescription
  )
  const controls = item.querySelector<HTMLElement>('.vutronmusic-v327-controls')!
  const select = document.createElement('select')
  const startButton = document.createElement('button')
  const cancelButton = document.createElement('button')
  const status = document.createElement('div')

  const options = [
    ['off', text.sleepOff],
    ['15', text.sleep15],
    ['30', text.sleep30],
    ['60', text.sleep60],
    ['90', text.sleep90],
    ['trackEnd', text.sleepTrackEnd]
  ]
  options.forEach(([value, label]) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    select.appendChild(option)
  })

  startButton.textContent = text.start
  cancelButton.textContent = text.cancel
  status.className = 'vutronmusic-v327-status'
  status.dataset.sleepTimerStatus = 'true'

  startButton.addEventListener('click', () => startSleepTimer(select.value))
  cancelButton.addEventListener('click', () => {
    select.value = 'off'
    sleepTimerState.completed = false
    cancelSleepTimer()
  })

  controls.append(select, startButton, cancelButton, status)
  anchorItem.insertAdjacentElement('afterend', item)
  updateSleepTimerStatus()
  return true
}

const initializeV327Features = (): void => {
  injectStyle()
  let pendingTimer: number | null = null

  const ensureControls = (): void => {
    ensureOsdPresetControl()
    ensureSettingsBackupControl()
    ensureSleepTimerControl()
  }

  const scheduleEnsureControls = (): void => {
    if (pendingTimer !== null) return
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null
      ensureControls()
    }, 80)
  }

  const observer = new MutationObserver(scheduleEnsureControls)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  })

  ;[0, 100, 300, 800, 1600].forEach((delay) => {
    window.setTimeout(ensureControls, delay)
  })

  window.addEventListener('beforeunload', () => {
    observer.disconnect()
    if (sleepTimerInterval !== null) window.clearInterval(sleepTimerInterval)
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeV327Features, { once: true })
} else {
  initializeV327Features()
}
