import {
  createV327SettingsItem,
  observeV327SettingsControl,
  readJsonRecord,
  resolveFeatureLanguage
} from './v327FeatureShared'
import {
  sleepTimerAction,
  sleepTimerFadeSeconds,
  sleepTimerMode,
  sleepTimerRemainingSeconds
} from './sleepTimerSettings'
import { playbackStartGuardActive, playbackStartReason } from './playbackStartGuard'

const CONTROL_ID = 'vutronmusic-diagnostics-snapshot-setting'
const MAX_RECENT_ERRORS = 20

const recentErrors: Array<{ time: string; message: string }> = []

const pushError = (message: unknown): void => {
  recentErrors.unshift({
    time: new Date().toISOString(),
    message: String(message instanceof Error ? message.stack || message.message : message)
  })
  recentErrors.splice(MAX_RECENT_ERRORS)
}

window.addEventListener('error', (event) => pushError(event.error || event.message))
window.addEventListener('unhandledrejection', (event) => pushError(event.reason))

const TEXTS = {
  zh: {
    title: '一键诊断快照',
    description:
      '复制版本、系统、播放状态、桌面歌词、定时器和最近错误；不会包含密码、Cookie 或完整本地路径',
    copy: '复制诊断快照',
    copied: '诊断信息已复制到剪贴板',
    failed: '生成诊断信息失败'
  },
  zht: {
    title: '一鍵診斷快照',
    description:
      '複製版本、系統、播放狀態、桌面歌詞、定時器與最近錯誤；不包含密碼、Cookie 或完整本機路徑',
    copy: '複製診斷快照',
    copied: '診斷資訊已複製到剪貼簿',
    failed: '產生診斷資訊失敗'
  },
  en: {
    title: 'One-click Diagnostics',
    description:
      'Copies version, system, playback, desktop lyric, timer and recent error data without passwords, cookies or full local paths.',
    copy: 'Copy diagnostics',
    copied: 'Diagnostics copied to the clipboard',
    failed: 'Could not generate diagnostics'
  }
} as const

const redactPath = (value: unknown): string => {
  if (typeof value !== 'string' || !value) return ''
  const segments = value.replace(/\\/g, '/').split('/').filter(Boolean)
  return segments.length ? `…/${segments.at(-1)}` : ''
}

const readJsonArray = (key: string): unknown[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

const collectRendererDiagnostics = () => {
  const player = window.vutronmusic || ({} as NonNullable<typeof window.vutronmusic>)
  const osd = readJsonRecord('osdLyric')
  const settings = readJsonRecord('settings')
  const queueSnapshots = readJsonArray('vutronmusic-queue-snapshots-v1')

  return {
    capturedAt: new Date().toISOString(),
    location: location.href,
    language: settings?.general?.language || document.documentElement.lang || '',
    playback: {
      trackId: player.currentTrack?.id ?? null,
      trackName: player.currentTrack?.name ?? '',
      source: player.currentTrack?.source ?? player.currentTrack?.type ?? '',
      playing: Boolean(player.playing),
      progress: Number(player.progress || 0).toFixed(2),
      volume: Number(player.volume || 0).toFixed(2),
      repeatMode: player.repeatMode || '',
      playlistType: readJsonRecord('player')?.playlistSource?.type || '',
      playbackStartReason: playbackStartReason.value,
      playbackStartGuardActive: playbackStartGuardActive.value
    },
    desktopLyric: {
      type: osd.type,
      mode: osd.mode,
      locked: Boolean(osd.isLock),
      translationMode: osd.translationMode,
      font: osd.font,
      coverControlsVisible:
        localStorage.getItem('vutronmusic-osd-cover-controls-visible') !== 'false'
    },
    sleepTimer: {
      mode: sleepTimerMode.value,
      action: sleepTimerAction.value,
      fadeSeconds: sleepTimerFadeSeconds.value,
      remainingSeconds: Math.ceil(sleepTimerRemainingSeconds.value)
    },
    localMusic: {
      scanDirectoryCount: Array.isArray(settings?.localMusic?.scanDir)
        ? settings.localMusic.scanDir.length
        : 0,
      cachePath: redactPath(settings?.autoCacheTrack?.cachePath)
    },
    queueSnapshotCount: queueSnapshots.length,
    recentErrors
  }
}

const formatDiagnostics = (main: Record<string, any>, renderer: Record<string, any>): string => {
  const sanitizedMain = {
    ...main,
    app: {
      ...main.app,
      userDataPath: redactPath(main.app?.userDataPath),
      logPath: redactPath(main.app?.logPath)
    }
  }

  return [
    'VutronMusic Diagnostics',
    '=======================',
    JSON.stringify({ main: sanitizedMain, renderer }, null, 2)
  ].join('\n')
}

const ensureControl = (): boolean => {
  const anchor =
    document.getElementById('vutronmusic-settings-backup-setting') ||
    document.querySelector<HTMLElement>('.settings-container .item:last-of-type')
  if (!anchor?.parentElement) return false
  if (document.getElementById(CONTROL_ID)) return true

  const text = TEXTS[resolveFeatureLanguage()]
  const item = createV327SettingsItem(CONTROL_ID, text.title, text.description)
  const controls = item.querySelector<HTMLElement>('.vutronmusic-v327-controls')!
  const button = document.createElement('button')
  const status = document.createElement('div')

  button.type = 'button'
  button.textContent = text.copy
  status.className = 'vutronmusic-v327-status'
  status.setAttribute('aria-live', 'polite')

  button.addEventListener('click', async () => {
    button.disabled = true
    status.textContent = ''
    try {
      const main = (await window.mainApi?.invoke('get-runtime-diagnostics')) || {}
      const output = formatDiagnostics(main, collectRendererDiagnostics())
      await navigator.clipboard.writeText(output)
      status.textContent = text.copied
    } catch (error) {
      console.warn('[Diagnostics] 生成诊断快照失败：', error)
      status.textContent = text.failed
    } finally {
      button.disabled = false
    }
  })

  controls.append(button, status)
  anchor.insertAdjacentElement('afterend', item)
  return true
}

observeV327SettingsControl(ensureControl)
