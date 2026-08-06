import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'

const FORCE_TOGGLE_MESSAGE = 'playOrPauseFromOsd'

const findMainWindow = (senderId: number): BrowserWindow | null => {
  return (
    BrowserWindow.getAllWindows().find((window) => {
      if (window.isDestroyed() || window.webContents.id === senderId) return false
      const url = window.webContents.getURL()
      return url.includes('/index.html') && !url.includes('/osdlyric.html')
    }) || null
  )
}

/**
 * 桌面歌词中的播放/暂停属于明确的远程控制操作，不应受主窗口当前输入框焦点影响。
 *
 * 主播放器原有 `play` 事件会在主窗口焦点停留于 INPUT 时忽略操作，以避免用户输入
 * 时误触空格快捷键。锁定/解锁桌面歌词通常从设置页触发，主窗口焦点会继续留在
 * 对应表单控件上，导致只有播放/暂停失效，而上一首、下一首等控制仍然正常。
 *
 * 这里使用一个独立的 OSD 消息：先释放主窗口表单焦点，再复用既有 `play` 事件，
 * 从而保留键盘快捷键的输入保护，同时保证桌面歌词按钮始终可用。
 */
ipcMain.on('from-osd', async (event: IpcMainEvent, message: string) => {
  if (message !== FORCE_TOGGLE_MESSAGE) return

  const mainWindow = findMainWindow(event.sender.id)
  if (!mainWindow || mainWindow.webContents.isDestroyed()) return

  try {
    await mainWindow.webContents.executeJavaScript(
      `(() => {
        const active = document.activeElement
        if (active instanceof HTMLElement) active.blur()
      })()`,
      true
    )
  } catch (error) {
    console.warn('[OSD Playback] 释放主窗口焦点失败，仍继续发送播放控制：', error)
  }

  if (!mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('play')
  }
})
