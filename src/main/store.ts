import Store from 'electron-store'
import { app, BrowserWindow, ipcMain } from 'electron'
import type { TrackInfoOrder, streamStatus } from '@/types/music'
import {
  WindowScaleBaseline,
  WindowScaleTarget,
  getDefaultWindowScaleBaseline,
  sanitizeWindowScaleBaseline
} from './windowScaleBaseline'

export interface TypeElectronStore {
  window: {
    width: number
    height: number
    x?: number
    y?: number
  }
  osdWin: {
    show: boolean
    isLock: boolean
    type: string
    x?: number
    y?: number
    x2?: number
    y2?: number
    scaleBaselineSmall?: WindowScaleBaseline
    scaleBaselineNormal?: WindowScaleBaseline
  }
  settings: {
    [key: string]: any
  }
  accounts: {
    selected: string
    navidrome: {
      url: string
      clientID: string
      anthorization: string
      token: string
      username: string
      password: string
      salt: string
      status: streamStatus
    }
    emby: {
      url: string
      username: string
      password: string
      userId: string
      accessToken: string
      status: streamStatus
    }
    jellyfin: {
      url: string
      username: string
      password: string
      userId: string
      accessToken: string
      status: streamStatus
    }
  }
}

const store = new Store<TypeElectronStore>({
  defaults: {
    window: {
      width: 1080,
      height: 720
    },
    osdWin: {
      type: 'small',
      show: false,
      isLock: false,
      scaleBaselineSmall: getDefaultWindowScaleBaseline('osd-small'),
      scaleBaselineNormal: getDefaultWindowScaleBaseline('osd-normal')
    },
    settings: {
      innerFirst: false,
      lang: 'zh',
      enableTrayMenu: false,
      closeAppOption: 'ask',
      useCustomTitlebar: false,
      showTray: true,
      trayColor: 0,
      embedCoverArt: 0,
      embedStyle: 0,
      enableGlobalShortcut: false,
      windowScaleBaseline: getDefaultWindowScaleBaseline('main'),
      unblockNeteaseMusic: {
        enable: true,
        source: '',
        enableFlac: true,
        orderFirst: true,
        jooxCookie: '',
        qqCookie: ''
      },
      trackInfoOrder: ['path', 'online', 'embedded'] as TrackInfoOrder[],
      autoCacheTrack: {
        enable: false,
        path: '',
        sizeLimit: 512 as boolean | number
      },
      shortcuts: [
        {
          id: 'play',
          name: '播放/暂停',
          shortcut: 'CommandOrControl+P',
          globalShortcut: 'Alt+CommandOrControl+P'
        },
        {
          id: 'next',
          name: '下一首',
          shortcut: 'CommandOrControl+Right',
          globalShortcut: 'Alt+CommandOrControl+Right'
        },
        {
          id: 'previous',
          name: '上一首',
          shortcut: 'CommandOrControl+Left',
          globalShortcut: 'Alt+CommandOrControl+Left'
        },
        {
          id: 'increaseVolume',
          name: '增加音量',
          shortcut: 'CommandOrControl+Up',
          globalShortcut: 'Alt+CommandOrControl+Up'
        },
        {
          id: 'decreaseVolume',
          name: '减少音量',
          shortcut: 'CommandOrControl+Down',
          globalShortcut: 'Alt+CommandOrControl+Down'
        },
        {
          id: 'like',
          name: '喜欢歌曲',
          shortcut: 'CommandOrControl+L',
          globalShortcut: 'Alt+CommandOrControl+L'
        },
        {
          id: 'minimize',
          name: '隐藏/显示播放器',
          shortcut: 'CommandOrControl+M',
          globalShortcut: 'Alt+CommandOrControl+M'
        }
      ],
      enableAmuseServer: true,
      lastfmSession: { name: '', key: '', subscriber: 0 },
      proxy: { type: 0, address: '', port: '' },
      forceFactor: false
    },
    accounts: {
      selected: 'navidrome',
      navidrome: {
        url: '',
        clientID: '',
        anthorization: '',
        username: '',
        password: '',
        token: '',
        salt: '',
        status: 'logout'
      },
      emby: {
        url: '',
        username: '',
        password: '',
        userId: '',
        accessToken: '',
        status: 'logout'
      },
      jellyfin: {
        url: '',
        username: '',
        password: '',
        userId: '',
        accessToken: '',
        status: 'logout'
      }
    }
  }
})

// ======== newADD start======
const WINDOW_SCALE_LISTENERS_KEY = '__VUTRON_WINDOW_SCALE_LISTENERS_INSTALLED__'

const readMainWindowBaseline = () => {
  return sanitizeWindowScaleBaseline(
    'main',
    store.get('settings.windowScaleBaseline') as Partial<WindowScaleBaseline> | undefined
  )
}

const readOsdWindowBaseline = (target: 'osd-small' | 'osd-normal') => {
  const key = target === 'osd-small' ? 'osdWin.scaleBaselineSmall' : 'osdWin.scaleBaselineNormal'

  return sanitizeWindowScaleBaseline(
    target,
    store.get(key) as Partial<WindowScaleBaseline> | undefined
  )
}

const applyWindowMinimumSize = (
  window: BrowserWindow | null,
  target: WindowScaleTarget,
  value: Partial<WindowScaleBaseline> | undefined
) => {
  if (!window || window.isDestroyed()) return

  const baseline = sanitizeWindowScaleBaseline(target, value)
  window.setMinimumSize(baseline.minWidth, baseline.minHeight)

  if (window.isMaximized() || window.isFullScreen()) return

  const [width, height] = window.getSize()
  const nextWidth = Math.max(width, baseline.minWidth)
  const nextHeight = Math.max(height, baseline.minHeight)
  if (nextWidth !== width || nextHeight !== height) {
    window.setSize(nextWidth, nextHeight)
  }
}

/**
 * 为桌面歌词窗口补一层运行时最小尺寸保护。
 *
 * Electron 的 minWidth/minHeight 与 setMinimumSize 主要约束用户手动拉伸，
 * 代码中的 setBounds 仍可能写入更小的尺寸。桌面歌词存在多条 setBounds 路径，
 * 因此这里以 BrowserWindow 当前 minimumSize 为唯一真值，在每次 resize 后校正。
 *
 * 校准预览期间 windowScaleBaseline.ts 会临时把 minimumSize 设为 1x1，
 * 所以这里读取 getMinimumSize() 而不是直接读取持久化 baseline，避免阻塞预览。
 */
const installOsdMinimumSizeGuard = (window: BrowserWindow) => {
  let correcting = false

  window.on('resize', () => {
    if (correcting || window.isDestroyed() || window.isMaximized() || window.isFullScreen()) return

    const [minimumWidth, minimumHeight] = window.getMinimumSize()
    const [width, height] = window.getSize()
    const nextWidth = Math.max(width, minimumWidth)
    const nextHeight = Math.max(height, minimumHeight)

    if (nextWidth === width && nextHeight === height) return

    correcting = true
    window.setSize(nextWidth, nextHeight)
    correcting = false
  })
}

const findDesktopLyricWindow = () => {
  return BrowserWindow.getAllWindows().find((window) => window.getTitle() === '桌面歌词') || null
}

const applyCreatedWindowBaseline = (window: BrowserWindow) => {
  if (window.getTitle() === '桌面歌词') {
    const type = store.get('osdWin.type') === 'normal' ? 'osd-normal' : 'osd-small'
    applyWindowMinimumSize(window, type, readOsdWindowBaseline(type))
    installOsdMinimumSizeGuard(window)
    return
  }

  if (window.getTitle() === app.getName()) {
    applyWindowMinimumSize(window, 'main', readMainWindowBaseline())
  }
}

const installWindowScaleListeners = () => {
  app.on('browser-window-created', (_event, window) => {
    applyCreatedWindowBaseline(window)
  })

  ipcMain.on('setStoreSettings', (event, data: any) => {
    const value = data?.windowScaleBaseline
    if (!value) return

    const baseline = sanitizeWindowScaleBaseline('main', value)
    store.set('settings.windowScaleBaseline', baseline)
    applyWindowMinimumSize(BrowserWindow.fromWebContents(event.sender), 'main', baseline)
  })

  ipcMain.on('updateOsdState', (_event, data: any) => {
    const [key, value] = Object.entries(data || {})[0] || []
    const target =
      key === 'scaleBaselineSmall'
        ? 'osd-small'
        : key === 'scaleBaselineNormal'
          ? 'osd-normal'
          : null
    if (!target) return

    const baseline = sanitizeWindowScaleBaseline(target, value as Partial<WindowScaleBaseline>)
    const storeKey =
      target === 'osd-small' ? 'osdWin.scaleBaselineSmall' : 'osdWin.scaleBaselineNormal'
    store.set(storeKey, baseline)

    const currentTarget = store.get('osdWin.type') === 'normal' ? 'osd-normal' : 'osd-small'
    if (currentTarget === target) {
      applyWindowMinimumSize(findDesktopLyricWindow(), target, baseline)
    }
  })
}

const runtimeGlobal = globalThis as Record<string, any>
if (!runtimeGlobal[WINDOW_SCALE_LISTENERS_KEY]) {
  runtimeGlobal[WINDOW_SCALE_LISTENERS_KEY] = true
  installWindowScaleListeners()
}
// =========== newADD end ========

export default store
