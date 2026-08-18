import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'

// Whitelist of valid channels used for IPC communication (Send message from Renderer to Main)
const mainAvailChannels: string[] = [
  'msgRequestGetVersion',
  'msgOpenExternalLink',
  'msgOpenFile',
  'msgShowInFolder',
  'msgCheckFileExist',
  'msgScanLocalMusic',
  'getLocalMusic',
  'selecteFolder',
  'showOpenDialog',
  'getFilesInFolder',
  'updateTray',
  'metadata',
  'updateOsdState',
  'updateTouchBarLyric',
  'showWindow',
  'updatePlayerState',
  'setStoreSettings',
  'preview-window-scale-baseline',
  'finish-window-scale-calibration',
  'deleteLocalMusicDB',
  'upsertLocalPlaylist',
  'deleteLocalPlaylist',
  'logout',
  'accurateMatch',
  'updateLocalTrackInfo',
  'updateLocalPlaylist',
  'updateStreamingAccount',
  'clearCacheTracks',
  'getCacheTracksInfo',
  'deleteACacheTrack',
  'updateLyricInfo',
  'clearDeletedMusic',
  'minimize',
  'maximizeOrUnmaximize',
  'close',
  'askExtensionStatus',
  'stream-login',
  'get-stream-songs',
  'get-stream-playlists',
  'get-stream-lyric',
  'deleteStreamPlaylist',
  'createStreamPlaylist',
  'updateStreamPlaylist',
  'updateStreamPlaylistInfo',
  'logoutStreamMusic',
  'scrobbleStreamMusic',
  'likeAStreamTrack',
  'systemPing',
  'get-stream-account',
  'check-update',
  'downloadUpdate',
  'update-powersave',
  'openLogFile',
  'updateTooltip',
  'write-cover',
  'getFontList',
  'cacheATrack',
  'playDiscordPresence',
  'pauseDiscordPresence',
  'lastfm-auth',
  'get-lastfm-session',
  'disconnect-lastfm',
  'update-now-playing',
  'track-scrobble',
  'get-screenshot',
  'delete-screenshot',
  'get-cache-path',
  'get-runtime-diagnostics',
  'quit-application'
]
const rendererAvailChannels: string[] = [
  'msgHandleScanLocalMusic',
  'msgHandleScanLocalMusicError',
  'scanLocalMusicDone',
  'handleTrayClick',
  'play',
  'play-from-osd',
  'previous',
  'next',
  'repeat',
  'repeat-shuffle',
  'like',
  'increaseVolume',
  'decreaseVolume',
  'fm-trash',
  'updateOSDSetting',
  'rememberCloseAppOption',
  'msgDeletedTracks',
  'msgExtensionCheckResult',
  'resume',
  'update-not-available',
  'update-error',
  'download-progress',
  'setPosition',
  'changeRouteTo',
  'updateAmuseServerStatus',
  'receiveCacheInfo',
  'updateLocalMusic'
]

type RendererListener = (event: undefined, ...args: any[]) => void
type WrappedListener = (event: IpcRendererEvent, ...args: any[]) => void

const wrappedListeners = new WeakMap<RendererListener, Map<string, WrappedListener>>()
let messagePort: MessagePort | null = null

const assertMainChannel = (channel: string): void => {
  if (!mainAvailChannels.includes(channel)) {
    throw new Error(`Unknown ipc channel name: ${channel}`)
  }
}

const assertRendererChannel = (channel: string): void => {
  if (!rendererAvailChannels.includes(channel)) {
    throw new Error(`Unknown ipc channel name: ${channel}`)
  }
}

const getWrappedListener = (channel: string, listener: RendererListener): WrappedListener => {
  let channelMap = wrappedListeners.get(listener)
  if (!channelMap) {
    channelMap = new Map()
    wrappedListeners.set(listener, channelMap)
  }

  let wrapped = channelMap.get(channel)
  if (!wrapped) {
    wrapped = (_event, ...args) => listener(undefined, ...args)
    channelMap.set(channel, wrapped)
  }
  return wrapped
}

const removeWrappedListener = (
  channel: string,
  listener: RendererListener
): WrappedListener | null => {
  const channelMap = wrappedListeners.get(listener)
  const wrapped = channelMap?.get(channel) || null
  if (wrapped) {
    channelMap?.delete(channel)
    if (channelMap?.size === 0) wrappedListeners.delete(listener)
  }
  return wrapped
}

ipcRenderer.on('port-connect', (event) => {
  const port = event.ports?.[0]
  if (!port) {
    console.error('[Preload] port-connect 未携带 MessagePort')
    return
  }

  messagePort?.close()
  messagePort = port
  messagePort.start()
  messagePort.onmessage = (messageEvent) => {
    window.postMessage(messageEvent.data, '*')
  }

  window.postMessage({ type: 'init-from-osd' }, '*')
})

window.addEventListener('unload', () => {
  messagePort?.close()
  messagePort = null
})

contextBridge.exposeInMainWorld('mainApi', {
  send: (channel: string, ...data: any[]): void => {
    assertMainChannel(channel)
    ipcRenderer.send(channel, ...data)
  },
  on: (channel: string, listener: RendererListener): void => {
    assertRendererChannel(channel)
    ipcRenderer.on(channel, getWrappedListener(channel, listener))
  },
  once: (channel: string, listener: RendererListener): void => {
    assertRendererChannel(channel)
    ipcRenderer.once(channel, (_event, ...args) => listener(undefined, ...args))
  },
  off: (channel: string, listener: RendererListener): void => {
    assertRendererChannel(channel)
    const wrapped = removeWrappedListener(channel, listener)
    if (wrapped) ipcRenderer.off(channel, wrapped)
  },
  invoke: async (channel: string, ...data: any[]): Promise<any> => {
    assertMainChannel(channel)
    return await ipcRenderer.invoke(channel, ...data)
  },
  sendMessage: (message: any): void => {
    messagePort?.postMessage(message)
  },
  closeMessagePort: (): void => {
    messagePort?.close()
    messagePort = null
  },
  // 使用 Electron 页面缩放统一缩放主窗口全部 DOM 元素。
  setZoomFactor: (factor: number): void => {
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(`Invalid zoom factor: ${factor}`)
    }
    webFrame.setZoomFactor(factor)
  },
  getZoomFactor: (): number => webFrame.getZoomFactor()
})

contextBridge.exposeInMainWorld('env', {
  isElectron: true,
  isEnableTitlebar: process.platform === 'win32' || process.platform === 'linux',
  isLinux: process.platform === 'linux',
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isDev: process.env.NODE_ENV === 'development'
})
