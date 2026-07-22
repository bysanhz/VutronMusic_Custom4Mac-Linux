/**  By default, it writes logs to the following locations:
 * on Linux: ~/.config/R3PLAY/logs/main.log
 * on macOS: ~/Library/Logs/r3playx/main.log
 * on Windows: %USERPROFILE%\AppData\Roaming\r3play\logs\main.log
 * @see https://www.npmjs.com/package/electron-log
 */

import Constants from './utils/Constants'

let log: any = null

if (!log) {
  log = require('electron-log')
  const pc = require('picocolors')

  Object.assign(console, log.functions)
  log.variables.process = 'main'
  if (log.transports.ipc) log.transports.ipc.level = false
  log.transports.console.format = `${Constants.IS_DEV_ENV ? '' : pc.dim('{h}:{i}:{s}{scope} ')}{level} › {text}`
  log.transports.file.level = 'info'
}

// ======== newADD start======
type RuntimeProcess = NodeJS.Process & {
  __vutronUnhandledRejectionHandlerInstalled__?: boolean
}

const runtimeProcess = process as RuntimeProcess
const recentUnhandledRejections = new Map<string, number>()
const DUPLICATE_REJECTION_WINDOW_MS = 5000

const stringifyUnhandledReason = (reason: unknown) => {
  if (reason instanceof Error) {
    return reason.stack || reason.message
  }

  if (typeof reason === 'string') {
    return reason
  }

  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

/**
 * 统一处理主进程中未捕获的 Promise 拒绝。
 *
 * 详细说明：
 * 1. Discord 客户端未运行时，discord-rpc 会产生 Could not connect；
 * 2. 该情况不影响播放器本身，仅记录一次警告，不再让 Node 输出未处理拒绝；
 * 3. 其他异常仍按错误等级写入控制台和日志文件；
 * 4. 相同异常在五秒内去重，避免第三方模块连续刷屏。
 */
const installUnhandledRejectionHandler = () => {
  if (runtimeProcess.__vutronUnhandledRejectionHandlerInstalled__) return

  runtimeProcess.__vutronUnhandledRejectionHandlerInstalled__ = true
  runtimeProcess.on('unhandledRejection', (reason) => {
    const message = stringifyUnhandledReason(reason)
    const now = Date.now()
    const previousTime = recentUnhandledRejections.get(message) || 0

    if (now - previousTime < DUPLICATE_REJECTION_WINDOW_MS) {
      return
    }

    recentUnhandledRejections.set(message, now)

    for (const [storedMessage, storedTime] of recentUnhandledRejections) {
      if (now - storedTime > DUPLICATE_REJECTION_WINDOW_MS * 2) {
        recentUnhandledRejections.delete(storedMessage)
      }
    }

    const isDiscordUnavailable =
      message.includes('Could not connect') &&
      (message.includes('discord-rpc') || message.includes('discord-rich-presence'))

    if (isDiscordUnavailable) {
      log.warn('Discord Rich Presence 不可用，已跳过本次连接')
      return
    }

    log.error('主进程出现未处理的 Promise 拒绝', reason)
  })
}

installUnhandledRejectionHandler()
// =========== newADD end ========

export default log
