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
import {
  activeNeteaseListenAccountId,
  getNeteaseListenSyncDiagnostics
} from './neteaseListenLedger'
import request from './request'
import { getCoverLoadDiagnostics, getFailedNeteaseCoverProbeUrls } from './coverNetworkDiagnostics'

const CONTROL_ID = 'vutronmusic-diagnostics-snapshot-setting'
const UPDATE_CONTROL_ID = 'vutronmusic-update-diagnostics-setting'
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
      '复制版本、系统、播放状态、封面加载及 CDN 检测、最近错误；不会包含密码、Cookie 或完整图片 URL',
    copy: '复制诊断快照',
    copied: '诊断信息已复制到剪贴板',
    failed: '生成诊断信息失败'
  },
  zht: {
    title: '一鍵診斷快照',
    description:
      '複製版本、系統、播放狀態、封面載入及 CDN 偵測、最近錯誤；不包含密碼、Cookie 或完整圖片網址',
    copy: '複製診斷快照',
    copied: '診斷資訊已複製到剪貼簿',
    failed: '產生診斷資訊失敗'
  },
  en: {
    title: 'One-click Diagnostics',
    description:
      'Copies version, system, playback, recent cover failures and CDN probe status without passwords, cookies or full image URLs.',
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
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
    }
  ).memory

  return {
    capturedAt: new Date().toISOString(),
    location: location.href,
    language: settings?.general?.language || document.documentElement.lang || '',
    jsHeap: memory
      ? {
          usedMiB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          allocatedMiB: Math.round(memory.totalJSHeapSize / 1024 / 1024),
          limitMiB: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
        }
      : null,
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
      playbackStartGuardActive: playbackStartGuardActive.value,
      media: player.media || null
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
    coverImages: getCoverLoadDiagnostics(),
    listenSync: getNeteaseListenSyncDiagnostics(activeNeteaseListenAccountId.value),
    recentErrors
  }
}

/**
 * Inspect the exact NetEase scrobble implementation used by this running app.
 * A successful upload receipt does not mean its duration is in the remote report.
 * Keep the snapshot free of cookies, account IDs and raw error messages.
 */
const getNeteaseScrobbleRuntimeDiagnostics = async () => {
  const info = await request({ url: '/runtime-info', method: 'get', timeout: 4000 })
  if (Number(info?.code) !== 200) return { available: false }

  return {
    available: info.stableScrobbleV1Available === true,
    appServerRevision:
      typeof info.appServerRevision === 'string' ? info.appServerRevision : '',
    source: typeof info.stableScrobbleV1Source === 'string' ? info.stableScrobbleV1Source : ''
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

/** Mount the same snapshot action in each settings section, without duplicating its logic. */
const mountControl = (id: string, anchor: HTMLElement | null): boolean => {
  if (!anchor?.parentElement) return false
  const existing = document.getElementById(id)
  if (existing) {
    if (existing.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement('afterend', existing)
    }
    return true
  }

  const text = TEXTS[resolveFeatureLanguage()]
  const item = createV327SettingsItem(id, text.title, text.description)
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
      const [main, neteaseScrobble] = await Promise.all([
        window.mainApi?.invoke('get-runtime-diagnostics') || Promise.resolve({}),
        getNeteaseScrobbleRuntimeDiagnostics()
      ])
      const probeUrls = getFailedNeteaseCoverProbeUrls()
      let coverNetwork: Record<string, unknown> = { checked: false, reason: 'no_recent_netease_failures' }
      if (probeUrls.length && window.mainApi?.invoke) {
        try {
          coverNetwork = await window.mainApi.invoke('probe-netease-cover-network', probeUrls)
        } catch {
          coverNetwork = { checked: false, reason: 'probe_unavailable' }
        }
      }
      const output = formatDiagnostics(main, {
        ...collectRendererDiagnostics(),
        neteaseScrobble,
        coverNetwork
      })
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

const ensureControl = (): boolean => {
  const generalAnchor =
    document.getElementById('vutronmusic-settings-backup-setting') ||
    document.querySelector<HTMLElement>('.settings-container .item:last-of-type')
  const mountedGeneral = mountControl(CONTROL_ID, generalAnchor as HTMLElement | null)
  const updateAnchor = document.getElementById('vutronmusic-update-diagnostics-anchor')
  // The software update tab exists only in Electron.
  const mountedUpdate = updateAnchor ? mountControl(UPDATE_CONTROL_ID, updateAnchor) : true
  return mountedGeneral && mountedUpdate
}

observeV327SettingsControl(ensureControl)
