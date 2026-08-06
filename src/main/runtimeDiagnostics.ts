import { app, ipcMain } from 'electron'
import os from 'os'
import path from 'path'
import { name, version } from '../../package.json'

const INSTALL_KEY = '__vutronRuntimeDiagnosticsInstalled'
const APP_NAME = name.charAt(0).toUpperCase() + name.slice(1)
const IS_DEV_ENV = process.env.NODE_ENV === 'development'

const installRuntimeDiagnostics = (): void => {
  const runtime = globalThis as typeof globalThis & Record<string, unknown>
  if (runtime[INSTALL_KEY]) return
  runtime[INSTALL_KEY] = true

  ipcMain.handle('get-runtime-diagnostics', async () => {
    const gpuStatus = app.isReady() ? app.getGPUFeatureStatus() : {}
    const userDataDirectoryName = path.basename(app.getPath('userData'))

    return {
      app: {
        name: APP_NAME,
        version,
        packaged: app.isPackaged,
        userDataDirectory: userDataDirectoryName,
        logDirectory: 'logs'
      },
      runtime: {
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        osVersion: typeof os.version === 'function' ? os.version() : '',
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        locale: app.getLocale(),
        hardwareAccelerationDisabled:
          process.env.VUTRON_DISABLE_HARDWARE_ACCELERATION === '1' ||
          (IS_DEV_ENV && process.env.VUTRON_ENABLE_HARDWARE_ACCELERATION !== '1')
      },
      gpu: gpuStatus
    }
  })

  ipcMain.on('quit-application', () => {
    app.quit()
  })
}

installRuntimeDiagnostics()
