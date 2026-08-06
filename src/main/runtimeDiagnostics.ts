import { app, ipcMain } from 'electron'
import os from 'os'
import Constants from './utils/Constants'

const INSTALL_KEY = '__vutronRuntimeDiagnosticsInstalled'

const installRuntimeDiagnostics = (): void => {
  const runtime = globalThis as typeof globalThis & Record<string, unknown>
  if (runtime[INSTALL_KEY]) return
  runtime[INSTALL_KEY] = true

  ipcMain.handle('get-runtime-diagnostics', async () => {
    const gpuStatus = app.isReady() ? app.getGPUFeatureStatus() : {}
    return {
      app: {
        name: Constants.APP_NAME,
        version: Constants.APP_VERSION,
        packaged: app.isPackaged,
        userDataPath: app.getPath('userData'),
        logPath: app.getPath('logs')
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
          (Constants.IS_DEV_ENV && process.env.VUTRON_ENABLE_HARDWARE_ACCELERATION !== '1')
      },
      gpu: gpuStatus
    }
  })

  ipcMain.on('quit-application', () => {
    app.quit()
  })
}

installRuntimeDiagnostics()
