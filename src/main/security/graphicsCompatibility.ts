import { app, type WebContents } from 'electron'

const SOFTWARE_RENDERING_FLAG = 'vutron-software-rendering'
const ENABLE_HARDWARE_ENV = 'VUTRON_ENABLE_HARDWARE_ACCELERATION'
const DISABLE_HARDWARE_ENV = 'VUTRON_DISABLE_HARDWARE_ACCELERATION'
const isDevelopment = process.env.NODE_ENV === 'development'
const isDesktopUnix = process.platform === 'darwin' || process.platform === 'linux'
const forceHardwareAcceleration = process.env[ENABLE_HARDWARE_ENV] === '1'
const forceSoftwareRendering =
  process.env[DISABLE_HARDWARE_ENV] === '1' || app.commandLine.hasSwitch(SOFTWARE_RENDERING_FLAG)

/**
 * Electron 37/Chromium 在部分 macOS 与 Linux 图形驱动组合中可能出现 SharedImage
 * mailbox 失效，表现为窗口已加载但合成结果全白。开发环境默认使用软件渲染，保证
 * 调试稳定；正式构建仍保留硬件加速。可通过 VUTRON_ENABLE_HARDWARE_ACCELERATION=1
 * 临时恢复开发环境硬件加速。
 */
if ((forceSoftwareRendering || (isDevelopment && isDesktopUnix)) && !forceHardwareAcceleration) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch(SOFTWARE_RENDERING_FLAG)
  console.info('[Graphics] 已启用软件渲染兼容模式')
}

const recoveredContents = new WeakSet<WebContents>()

app.on('web-contents-created', (_event, contents) => {
  contents.on('did-fail-load', (_loadEvent, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return
    console.error('[Window] 页面加载失败', {
      errorCode,
      errorDescription,
      validatedURL
    })
  })

  contents.on('render-process-gone', (_goneEvent, details) => {
    console.error('[Window] 渲染进程退出', details)

    if (
      recoveredContents.has(contents) ||
      contents.isDestroyed() ||
      !['crashed', 'oom', 'abnormal-exit', 'launch-failed'].includes(details.reason)
    ) {
      return
    }

    recoveredContents.add(contents)
    setTimeout(() => {
      if (!contents.isDestroyed()) contents.reload()
    }, 500)
  })

  contents.on('unresponsive', () => {
    console.error('[Window] 渲染进程无响应', contents.getURL())
  })
})

app.on('child-process-gone', (_event, details) => {
  if (details.type !== 'GPU') return
  console.error('[Graphics] GPU 子进程退出', details)
})
