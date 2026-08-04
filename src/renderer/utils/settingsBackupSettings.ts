import {
  cloneJson,
  createV327SettingsItem,
  deepMerge,
  observeV327SettingsControl,
  readJsonRecord,
  resolveFeatureLanguage,
  writeJsonRecord,
  writeStorageValue,
  type JsonRecord
} from './v327FeatureShared'

const CONTROL_ID = 'vutronmusic-settings-backup-setting'
const SETTINGS_STORAGE_KEY = 'settings'
const OSD_STORAGE_KEY = 'osdLyric'
const PLAYER_STORAGE_KEY = 'player'
const PRESETS_STORAGE_KEY = 'vutronmusic-osd-presets'
const COVER_CONTROLS_STORAGE_KEY = 'vutronmusic-osd-cover-controls-visible'
const MAX_BACKUP_FILE_SIZE = 2 * 1024 * 1024

/**
 * 可安全迁移的独立 localStorage 设置。
 *
 * 使用显式白名单而不是导出所有前缀键，避免未来新增的认证或隐私字段被
 * 无意写入备份。预览中的临时缩放值不在白名单中。
 */
const UI_STORAGE_KEYS = [
  'appGlobalFontSize',
  'appWindowScaleMinFontSize',
  'osdWindowScaleMinFontSize',
  'mainWindowScaleMinWidth',
  'mainWindowScaleMinHeight',
  'mainWindowScaleBaseFontSize',
  'osdSmallWindowScaleMinWidth',
  'osdSmallWindowScaleMinHeight',
  'osdSmallWindowScaleBaseFontSize',
  'osdNormalWindowScaleMinWidth',
  'osdNormalWindowScaleMinHeight',
  'osdNormalWindowScaleBaseFontSize',
  'osdMiniControlBaseSize'
] as const

const TEXTS = {
  zh: {
    title: '设置备份与恢复',
    description:
      '导出界面、桌面歌词、快捷键和播放偏好；不会导出登录凭据、Cookie、代理信息和本地目录',
    export: '导出配置',
    import: '导入配置',
    exporting: '正在导出…',
    exported: '配置已导出到下载目录',
    confirm: '导入会覆盖当前可迁移设置，并在完成后重新加载应用。确定继续吗？',
    imported: '配置导入完成，应用将重新加载',
    invalid: '配置文件无效或版本不受支持',
    failed: '配置导入失败'
  },
  zht: {
    title: '設定備份與還原',
    description:
      '匯出介面、桌面歌詞、快捷鍵和播放偏好；不會匯出登入憑證、Cookie、代理資訊和本機目錄',
    export: '匯出設定',
    import: '匯入設定',
    exporting: '正在匯出…',
    exported: '設定已匯出到下載目錄',
    confirm: '匯入會覆蓋目前可遷移設定，完成後重新載入應用程式。確定繼續嗎？',
    imported: '設定匯入完成，應用程式將重新載入',
    invalid: '設定檔無效或版本不支援',
    failed: '設定匯入失敗'
  },
  en: {
    title: 'Settings Backup and Restore',
    description:
      'Exports UI, desktop lyrics, shortcuts and playback preferences. Credentials, cookies, proxy data and local paths are excluded.',
    export: 'Export Settings',
    import: 'Import Settings',
    exporting: 'Exporting…',
    exported: 'Settings exported to the downloads folder',
    confirm: 'Importing will overwrite migratable settings and reload the app. Continue?',
    imported: 'Settings imported. The app will reload.',
    invalid: 'The settings file is invalid or unsupported.',
    failed: 'Failed to import settings'
  }
} as const

const sanitizeSettings = (settings: JsonRecord): JsonRecord => {
  const result = cloneJson(settings)

  if (result.unblockNeteaseMusic) {
    delete result.unblockNeteaseMusic.jooxCookie
    delete result.unblockNeteaseMusic.qqCookie
  }
  if (result.misc) {
    delete result.misc.proxy
    delete result.misc.realIp
  }
  if (result.localMusic) delete result.localMusic.scanDir
  if (result.autoCacheTrack) delete result.autoCacheTrack.path

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
  return Object.fromEntries(
    UI_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]).filter(
      (entry): entry is [string, string] => entry[1] !== null
    )
  )
}

const readPresetStorage = (): unknown[] => {
  try {
    const value = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
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

const resolveAppVersion = async (): Promise<string> => {
  try {
    const version = await window.mainApi?.invoke('msgRequestGetVersion')
    return String(version || 'unknown')
  } catch {
    return 'unknown'
  }
}

const exportBackup = async (): Promise<void> => {
  const payload = {
    schemaVersion: 1,
    appVersion: await resolveAppVersion(),
    exportedAt: new Date().toISOString(),
    settings: sanitizeSettings(readJsonRecord(SETTINGS_STORAGE_KEY)),
    osdLyric: readJsonRecord(OSD_STORAGE_KEY),
    osdPresets: readPresetStorage(),
    osdCoverControlsVisible: localStorage.getItem(COVER_CONTROLS_STORAGE_KEY) !== 'false',
    playerPreferences: extractPlayerPreferences(readJsonRecord(PLAYER_STORAGE_KEY)),
    uiStorage: collectUiStorage()
  }

  const date = new Date().toISOString().slice(0, 10)
  downloadJson(`VutronMusic-settings-${date}.json`, payload)
}

const compactDefinedValues = (value: JsonRecord): JsonRecord => {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined))
}

const syncImportedSettingsToMain = (settings: JsonRecord): void => {
  const general = settings.general || {}
  const tray = settings.tray || {}
  const localMusic = settings.localMusic || {}
  const misc = settings.misc || {}

  const mainSettings = compactDefinedValues({
    lang: general.language,
    musicQuality: general.musicQuality,
    closeAppOption: general.closeAppOption,
    useCustomTitlebar: general.useCustomTitlebar,
    trayColor: general.trayColor,
    forceFactor: general.forceFactor,
    enableAmuseServer: misc.enableAmuseServer,
    enableGlobalShortcut: settings.enableGlobalShortcut,
    shortcuts: settings.shortcuts,
    showTray: tray.showTray,
    enableTrayMenu: !(tray.showControl || tray.showLyric),
    innerFirst: localMusic.useInnerInfoFirst,
    trackInfoOrder: localMusic.trackInfoOrder,
    autoCacheTrack: settings.autoCacheTrack,
    unblockNeteaseMusic: settings.unblockNeteaseMusic
  })

  if (Object.keys(mainSettings).length > 0) {
    window.mainApi?.send('setStoreSettings', mainSettings)
  }
}

const importBackup = async (file: File): Promise<void> => {
  const text = TEXTS[resolveFeatureLanguage()]
  if (file.size <= 0 || file.size > MAX_BACKUP_FILE_SIZE) throw new Error(text.invalid)

  const payload = JSON.parse(await file.text()) as JsonRecord
  if (
    payload.schemaVersion !== 1 ||
    !payload.settings ||
    typeof payload.settings !== 'object' ||
    Array.isArray(payload.settings)
  ) {
    throw new Error(text.invalid)
  }
  if (!window.confirm(text.confirm)) return

  const rollback = new Map<string, string | null>()
  ;[
    SETTINGS_STORAGE_KEY,
    OSD_STORAGE_KEY,
    PLAYER_STORAGE_KEY,
    PRESETS_STORAGE_KEY,
    COVER_CONTROLS_STORAGE_KEY,
    ...UI_STORAGE_KEYS
  ].forEach((key) => rollback.set(key, localStorage.getItem(key)))

  let mergedSettings: JsonRecord | null = null

  try {
    if (payload.settings && typeof payload.settings === 'object') {
      const safeImportedSettings = sanitizeSettings(payload.settings)
      mergedSettings = deepMerge(readJsonRecord(SETTINGS_STORAGE_KEY), safeImportedSettings)
      writeJsonRecord(SETTINGS_STORAGE_KEY, mergedSettings)
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
      writeStorageValue(PRESETS_STORAGE_KEY, JSON.stringify(payload.osdPresets))
    }
    if (typeof payload.osdCoverControlsVisible === 'boolean') {
      writeStorageValue(COVER_CONTROLS_STORAGE_KEY, String(payload.osdCoverControlsVisible))
    }
    if (payload.uiStorage && typeof payload.uiStorage === 'object') {
      UI_STORAGE_KEYS.forEach((key) => {
        const value = payload.uiStorage[key]
        if (typeof value === 'string') writeStorageValue(key, value)
      })
    }

    if (mergedSettings) syncImportedSettingsToMain(mergedSettings)
  } catch (error) {
    rollback.forEach((value, key) => {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    })
    throw error
  }

  window.alert(text.imported)
  window.location.reload()
}

const ensureControl = (): boolean => {
  const anchorItem = (
    document.getElementById('real-ip') || document.getElementById('enableAmuseServer')
  )?.closest<HTMLElement>('.item')
  const parent = anchorItem?.parentElement
  if (!anchorItem || !parent) return false
  if (document.getElementById(CONTROL_ID)) return true

  const text = TEXTS[resolveFeatureLanguage()]
  const item = createV327SettingsItem(CONTROL_ID, text.title, text.description)
  const controls = item.querySelector<HTMLElement>('.vutronmusic-v327-controls')!
  const exportButton = document.createElement('button')
  const importButton = document.createElement('button')
  const input = document.createElement('input')
  const status = document.createElement('div')

  exportButton.textContent = text.export
  importButton.textContent = text.import
  input.type = 'file'
  input.accept = '.json,application/json'
  input.hidden = true
  status.className = 'vutronmusic-v327-status'

  exportButton.addEventListener('click', async () => {
    status.textContent = text.exporting
    try {
      await exportBackup()
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
      await importBackup(file)
    } catch (error) {
      console.error('[SettingsBackup] 导入失败：', error)
      const message = error instanceof Error ? error.message : String(error)
      status.textContent = `${text.failed}: ${message}`
    } finally {
      input.value = ''
    }
  })

  controls.append(exportButton, importButton, input, status)
  parent.appendChild(item)
  return true
}

observeV327SettingsControl(ensureControl)
