import { app, ipcMain, webContents } from 'electron'
import os from 'os'
import path from 'path'
import { name, version } from '../../package.json'

const INSTALL_KEY = '__vutronRuntimeDiagnosticsInstalled'
const APP_NAME = name.charAt(0).toUpperCase() + name.slice(1)

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
        hardwareAccelerationDisabled: app.commandLine.hasSwitch('vutron-software-rendering')
      },
      gpu: gpuStatus,
      systemMemory: {
        totalMiB: Math.round(os.totalmem() / 1024 / 1024),
        freeMiB: Math.round(os.freemem() / 1024 / 1024)
      },
      processes: app.isReady()
        ? app.getAppMetrics().map((metric) => {
            const contents = webContents
              .getAllWebContents()
              .find((contents) => contents.getOSProcessId() === metric.pid)
            const url = contents?.getURL() || ''
            return {
              pid: metric.pid,
              type: metric.type,
              role: url.startsWith('devtools:')
                ? 'devtools'
                : url.includes('/osdlyric.html')
                  ? 'desktop-lyrics'
                  : contents
                    ? 'main-window'
                    : metric.name || metric.serviceName || metric.type,
              cpuPercent: Number(metric.cpu.percentCPUUsage.toFixed(2)),
              workingSetMiB: Number((metric.memory.workingSetSize / 1024).toFixed(2))
            }
          })
        : []
    }
  })

  ipcMain.on('quit-application', () => {
    app.quit()
  })
}

installRuntimeDiagnostics()
