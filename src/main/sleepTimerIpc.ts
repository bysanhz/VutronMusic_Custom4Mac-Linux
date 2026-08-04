import { BrowserWindow, ipcMain } from 'electron'

const SLEEP_TIMER_PAUSE_CHANNEL = 'sleep-timer-pause'

/**
 * 睡眠定时器只在播放器仍处于播放状态时由渲染进程触发。
 * 主进程复用现有的 play 事件，让播放器继续走统一的淡出与暂停逻辑。
 */
ipcMain.on(SLEEP_TIMER_PAUSE_CHANNEL, (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return
  window.webContents.send('play')
})
