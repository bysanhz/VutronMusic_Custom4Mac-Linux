import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'

const mainAvailChannels: string[] = [
  'mouseleave',
  'from-osd',
  'osd-resize',
  'windowMouseleave',
  'drag-osd-window-absolute',
  'osd-control-hit-region',
  'updateOsdState',
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

type OsdResizeDirection =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-right'
  | 'bottom-left'

type OsdResizeState = {
  direction: OsdResizeDirection
  pointerId: number
  handle: HTMLElement
  mouseX: number
  mouseY: number
  windowX: number
  windowY: number
  width: number
  height: number
  minWidth: number
  minHeight: number
}

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

const getResizeDirection = (target: EventTarget | null): OsdResizeDirection | null => {
  if (!(target instanceof Element)) return null
  const handle = target.closest('.resize-edge, .resize-corner')
  if (!handle) return null

  if (handle.classList.contains('resize-edge-top')) return 'top'
  if (handle.classList.contains('resize-edge-right')) return 'right'
  if (handle.classList.contains('resize-edge-bottom')) return 'bottom'
  if (handle.classList.contains('resize-edge-left')) return 'left'
  if (handle.classList.contains('resize-corner-top-left')) return 'top-left'
  if (handle.classList.contains('resize-corner-top-right')) return 'top-right'
  if (handle.classList.contains('resize-corner-bottom-right')) return 'bottom-right'
  if (handle.classList.contains('resize-corner-bottom-left')) return 'bottom-left'

  return null
}

const getResizeCursor = (direction: OsdResizeDirection): string => {
  if (direction === 'top' || direction === 'bottom') return 'ns-resize'
  if (direction === 'left' || direction === 'right') return 'ew-resize'
  if (direction === 'top-left' || direction === 'bottom-right') return 'nwse-resize'
  return 'nesw-resize'
}

const getOsdResizeMinimums = (): { minWidth: number; minHeight: number } => {
  let compact = false
  try {
    const options = JSON.parse(localStorage.getItem('osdLyric') || '{}') as { type?: string }
    compact = options.type === 'small'
  } catch {
    compact = false
  }

  const defaultWidth = compact ? 420 : 360
  const defaultHeight = compact ? 50 : 400
  const minWidthKey = compact ? 'osdSmallWindowScaleMinWidth' : 'osdNormalWindowScaleMinWidth'
  const minHeightKey = compact
    ? 'osdSmallWindowScaleMinHeight'
    : 'osdNormalWindowScaleMinHeight'
  const storedWidth = Number(localStorage.getItem(minWidthKey))
  const storedHeight = Number(localStorage.getItem(minHeightKey))

  return {
    minWidth: Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : defaultWidth,
    minHeight: Number.isFinite(storedHeight) && storedHeight > 0 ? storedHeight : defaultHeight
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
  let osdLocked = root.classList.contains('is-lock')
  let mouseInside = false
  let resizeState: OsdResizeState | null = null

  const restoreRootVisibility = () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId)
    timeoutId = null
    root.style.opacity = '1'
  }

  const scheduleLockedAutoHide = () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId)
    timeoutId = null

    if (!osdLocked || !mouseInside) return

    let osdLyric: { staticTime?: number; showButtonWhenLock?: boolean } | null = null
    try {
      osdLyric = JSON.parse(localStorage.getItem('osdLyric') || 'null')
    } catch {
      osdLyric = null
    }

    const showButtonWhenLock = osdLyric?.showButtonWhenLock ?? true
    const staticTime = Number(osdLyric?.staticTime ?? 1500)
    if (!showButtonWhenLock || !Number.isFinite(staticTime) || staticTime <= 0) return

    lastMoveTime = Date.now()
    timeoutId = window.setTimeout(() => {
      const now = Date.now()
      if (osdLocked && mouseInside && now - lastMoveTime >= staticTime) {
        root.style.opacity = '0.02'
      }
      timeoutId = null
    }, staticTime)
  }

  const handleMouseInWindow = (_event: IpcRendererEvent, value: boolean) => {
    mouseInside = Boolean(value)
    if (!mouseInside) {
      restoreRootVisibility()
      return
    }

    scheduleLockedAutoHide()
  }

  const handleSetIsLock = (_event: IpcRendererEvent, value: boolean) => {
    osdLocked = Boolean(value)
    if (!osdLocked) {
      restoreRootVisibility()
      return
    }

    scheduleLockedAutoHide()
  }

  const stopResize = (): void => {
    const state = resizeState
    resizeState = null
    root.classList.remove('is-custom-resizing')
    document.documentElement.style.cursor = ''

    if (state?.handle.hasPointerCapture(state.pointerId)) {
      state.handle.releasePointerCapture(state.pointerId)
    }

    window.removeEventListener('pointermove', handleResizeMove, true)
    window.removeEventListener('pointerup', stopResize, true)
    window.removeEventListener('pointercancel', stopResize, true)
    window.removeEventListener('blur', stopResize)
  }

  const handleResizeMove = throttle((event: PointerEvent) => {
    const state = resizeState
    if (!state || event.pointerId !== state.pointerId) return

    const dx = event.screenX - state.mouseX
    const dy = event.screenY - state.mouseY
    const fromLeft = state.direction.includes('left')
    const fromRight = state.direction.includes('right')
    const fromTop = state.direction.includes('top')
    const fromBottom = state.direction.includes('bottom')

    let x = state.windowX
    let y = state.windowY
    let width = state.width
    let height = state.height

    if (fromLeft) {
      width = Math.max(state.minWidth, state.width - dx)
      x = state.windowX + state.width - width
    } else if (fromRight) {
      width = Math.max(state.minWidth, state.width + dx)
    }

    if (fromTop) {
      height = Math.max(state.minHeight, state.height - dy)
      y = state.windowY + state.height - height
    } else if (fromBottom) {
      height = Math.max(state.minHeight, state.height + dy)
    }

    ipcRenderer.send('drag-osd-window-absolute', { x, y, width, height })
  }, 16)

  const startResize = (event: PointerEvent): void => {
    if (event.button !== 0 || osdLocked || resizeState) return

    const direction = getResizeDirection(event.target)
    if (!direction) return

    const target = event.target instanceof Element ? event.target : null
    const handle = target?.closest('.resize-edge, .resize-corner') as HTMLElement | null
    if (!handle) return

    event.preventDefault()
    event.stopPropagation()

    const minimums = getOsdResizeMinimums()
    resizeState = {
      direction,
      pointerId: event.pointerId,
      handle,
      mouseX: event.screenX,
      mouseY: event.screenY,
      windowX: window.screenX,
      windowY: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
      minWidth: minimums.minWidth,
      minHeight: minimums.minHeight
    }

    root.classList.add('is-custom-resizing')
    document.documentElement.style.cursor = getResizeCursor(direction)
    ipcRenderer.send('set-ignore-mouse', false)

    try {
      handle.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture 失败时仍保留 window 级监听作为回退。
    }

    window.addEventListener('pointermove', handleResizeMove, true)
    window.addEventListener('pointerup', stopResize, true)
    window.addEventListener('pointercancel', stopResize, true)
    window.addEventListener('blur', stopResize)
  }

  ipcRenderer.on('mouseInWindow', handleMouseInWindow)
  ipcRenderer.on('set-isLock', handleSetIsLock)
  window.addEventListener(
    'unload',
    () => {
      stopResize()
      ipcRenderer.off('mouseInWindow', handleMouseInWindow)
      ipcRenderer.off('set-isLock', handleSetIsLock)
    },
    { once: true }
  )

  root.addEventListener('pointerdown', startResize, true)

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
    mouseInside = true
    scheduleLockedAutoHide()
  })

  root.addEventListener('mouseleave', () => {
    mouseInside = false
    if (!resizeState) restoreRootVisibility()
  })

  root.addEventListener('mousemove', () => {
    mouseInside = true
    scheduleLockedAutoHide()
  })
})
