import { app, type WebContents } from 'electron'

const SOFTWARE_RENDERING_FLAG = 'vutron-software-rendering'
const ENABLE_HARDWARE_ENV = 'VUTRON_ENABLE_HARDWARE_ACCELERATION'
const DISABLE_HARDWARE_ENV = 'VUTRON_DISABLE_HARDWARE_ACCELERATION'
const isDevelopment = process.env.NODE_ENV === 'development'
const useDevelopmentSoftwareFallback = isDevelopment && process.platform === 'darwin'
const forceHardwareAcceleration = process.env[ENABLE_HARDWARE_ENV] === '1'
const forceSoftwareRendering =
  process.env[DISABLE_HARDWARE_ENV] === '1' || app.commandLine.hasSwitch(SOFTWARE_RENDERING_FLAG)

/**
 * Electron 37/Chromium 在少数图形驱动组合中可能出现 SharedImage mailbox 失效，
 * 因此保留显式的软件渲染回退开关。
 *
 * Linux 开发环境不再默认禁用硬件加速：主窗口包含大图、模糊层和动态 webFrame zoom，
 * 软件栅格化在 GNOME/KDE 连续拖拽缩放时容易跟不上窗口合成，表现为局部 UI 晚绘制、
 * 空白或短暂显示不完整。遇到确实存在 GPU 白屏的机器仍可使用
 * VUTRON_DISABLE_HARDWARE_ACCELERATION=1 显式启用兼容模式。
 *
 * macOS 开发环境暂时保留旧的软件回退默认值；可通过
 * VUTRON_ENABLE_HARDWARE_ACCELERATION=1 显式恢复硬件加速。
 */
if ((forceSoftwareRendering || useDevelopmentSoftwareFallback) && !forceHardwareAcceleration) {
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
