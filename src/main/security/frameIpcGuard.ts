import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

const INSTALL_KEY = '__vutronFrameIpcGuardInstalled'
const TRUSTED_RENDERER_ORIGINS = new Set([
  'http://localhost:41830',
  'http://127.0.0.1:41830'
])

const getEventOrigin = (event: IpcMainEvent | IpcMainInvokeEvent): string | null => {
  const rawUrl = event.senderFrame?.url || event.sender.getURL()
  try {
    return new URL(rawUrl).origin
  } catch {
    return null
  }
}

const assertTrustedFrame = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
  const origin = getEventOrigin(event)
  if (!origin || !TRUSTED_RENDERER_ORIGINS.has(origin)) {
    throw new Error(`拒绝来自非受信渲染帧的 IPC：${origin || 'unknown'}`)
  }
}

const installFrameIpcGuard = (): void => {
  const target = ipcMain as typeof ipcMain & Record<string, any>
  if (target[INSTALL_KEY]) return
  target[INSTALL_KEY] = true

  const guardedOn = ipcMain.on.bind(ipcMain)
  const guardedHandle = ipcMain.handle.bind(ipcMain)

  target.on = (channel: string, listener: (...args: any[]) => unknown) =>
    guardedOn(channel, async (event: IpcMainEvent, ...args: unknown[]) => {
      try {
        assertTrustedFrame(event)
        return await listener(event, ...args)
      } catch (error) {
        console.warn(`[Security] 已阻止非受信渲染帧 IPC：${channel}`, error)
      }
    })

  target.handle = (channel: string, listener: (...args: any[]) => unknown) =>
    guardedHandle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      assertTrustedFrame(event)
      return await listener(event, ...args)
    })
}

installFrameIpcGuard()
