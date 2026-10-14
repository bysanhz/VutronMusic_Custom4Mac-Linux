import { app, ipcMain, webContents } from 'electron'
import os from 'os'
import path from 'path'
import { name, version } from '../../package.json'
import store from './store'

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

  // Keep an independent disk mirror: Chromium localStorage has a small quota
  // and is not sufficient as the only archive for unverified cloud uploads.
  // Only the main player window may overwrite this backup.
  ipcMain.handle('get-listen-ledger-backup', (event) => {
    if (!event.sender.getURL().includes('index.html')) return null
    return store.get('netease.listenLedgerBackupV1') ?? null
  })

  ipcMain.on('listen-ledger-snapshot', (event, value: unknown) => {
    if (!event.sender.getURL().includes('index.html')) return
    const acknowledge = (ok: boolean): void => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('listen-ledger-backup-status', { ok })
      }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      acknowledge(false)
      return
    }
    const snapshot = value as Record<string, unknown>
    if (
      !Array.isArray(snapshot.entries) ||
      !snapshot.remoteBaselines ||
      typeof snapshot.remoteBaselines !== 'object' ||
      !snapshot.remoteObservations ||
      typeof snapshot.remoteObservations !== 'object'
    ) {
      acknowledge(false)
      return
    }
    try {
      const serialized = JSON.stringify(snapshot)
      if (serialized.length > 40 * 1024 * 1024) {
        console.warn('[ListenSync] 账本磁盘备份超过容量保护阈值')
        acknowledge(false)
        return
      }
      store.set('netease.listenLedgerBackupV1', snapshot)
      acknowledge(true)
    } catch (error) {
      console.warn('[ListenSync] 写入磁盘账本备份失败：', error)
      acknowledge(false)
    }
  })

  ipcMain.on('quit-application', () => {
    app.quit()
  })
}

installRuntimeDiagnostics()
