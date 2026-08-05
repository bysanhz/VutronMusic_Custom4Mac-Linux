import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'

const mainAvailChannels: string[] = [
  'mouseleave',
  'from-osd',
  'osd-resize',
  'windowMouseleave',
  'drag-osd-window-absolute',
  'getFontList'
]

const rendererAvailChannels: string[] = [
  'set-isLock',
  'update-osd-playing-status',
  'updateLyricInfo',
  'mouseInWindow'
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

const removeWrappedListener = (channel: string, listener: RendererListener): WrappedListener | null => {
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
    console.error('[OSD Preload] port-connect 未携带 MessagePort')
    return
  }

  messagePort?.close()
  messagePort = port
  messagePort.start()
  messagePort.onmessage = (messageEvent) => {
    window.postMessage(messageEvent.data, '*')
  }
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
    if (!messagePort) throw new Error('Message port is not available')
    messagePort.postMessage(message)
  },
  closeMessagePort: (): void => {
    messagePort?.close()
    messagePort = null
  },
  // 桌面歌词使用独立的页面缩放范围，与主窗口设置相互隔离。
  setZoomFactor: (factor: number): void => {
    if (!Number.isFinite(factor) || factor <= 0) return
    webFrame.setZoomFactor(factor)
  },
  getZoomFactor: (): number => webFrame.getZoomFactor()
})

contextBridge.exposeInMainWorld('env', {
  isElectron: true,
  isEnableTitlebar: process.platform === 'win32' || process.platform === 'linux',
  isLinux: process.platform === 'linux',
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32'
})

const throttle = <T extends (...args: any[]) => void>(func: T, limit: number) => {
  let inThrottle = false

  return (...args: Parameters<T>): void => {
    if (inThrottle) return
    func(...args)
    inThrottle = true
    window.setTimeout(() => {
      inThrottle = false
    }, limit)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const titleBar = document.getElementById('titleBar')
  const root = document.querySelector<HTMLElement>('#main')
  const lockEl = document.querySelector<HTMLElement>('#osd-lock')
  if (!root) {
    console.error('[OSD Preload] 未找到 #main，已跳过窗口交互绑定')
    return
  }

  let isDragging = false
  let timeoutId: number | null = null
  let lastMoveTime = 0

  titleBar?.addEventListener('mousedown', (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.classList.contains('header')) return

    event.preventDefault()
    isDragging = true

    const startX = event.clientX
    const startY = event.clientY
    const startHeight = window.innerHeight
    const startWidth = window.innerWidth

    const onMouseMove = throttle((moveEvent: MouseEvent) => {
      if (!isDragging) return
      titleBar.style.cursor = 'move'
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      ipcRenderer.send('window-drag', { dx, dy, startHeight, startWidth })
    }, 16)

    const onMouseUp = () => {
      isDragging = false
      titleBar.style.cursor = 'unset'
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  lockEl?.addEventListener('mouseenter', () => {
    ipcRenderer.send('set-ignore-mouse', false)
  })

  lockEl?.addEventListener('mouseleave', () => {
    ipcRenderer.send('mouseleave')
  })

  root.addEventListener('mouseenter', () => {
    if (lockEl) lockEl.style.opacity = '1'
  })

  root.addEventListener('mouseleave', () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId)
    timeoutId = null
    if (lockEl) lockEl.style.opacity = '0'
    root.style.opacity = '1'
  })

  root.addEventListener('mousemove', () => {
    if (!root.classList.contains('is-lock')) return
    if (timeoutId !== null) window.clearTimeout(timeoutId)

    let osdLyric: { staticTime?: number } | null = null
    try {
      osdLyric = JSON.parse(localStorage.getItem('osdLyric') || 'null')
    } catch {
      osdLyric = null
    }

    const staticTime = Number(osdLyric?.staticTime ?? 1500)
    if (!Number.isFinite(staticTime) || staticTime <= 0) return

    lastMoveTime = Date.now()
    timeoutId = window.setTimeout(() => {
      const now = Date.now()
      if (root.classList.contains('is-lock') && now - lastMoveTime >= staticTime) {
        root.style.opacity = '0.02'
      }
      timeoutId = null
    }, staticTime)
  })
})
