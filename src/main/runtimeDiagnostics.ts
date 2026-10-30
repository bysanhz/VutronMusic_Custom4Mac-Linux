import { app, ipcMain, net, webContents, type WebContents } from 'electron'
import os from 'os'
import path from 'path'
import { name, version } from '../../package.json'
import store from './store'
import { getAudioRequestDiagnostics } from './utils/audioDiagnostics'
import { MemoryTrendSampler, summarizeRuntimeMemory } from './utils/memoryTrend'
import { readLinuxAppProcessMemory } from './linuxProcessMemory'
import { getNeteaseImageCandidateUrls, isNeteaseAssetUrl } from '../shared/neteaseAssetUrl'

const INSTALL_KEY = '__vutronRuntimeDiagnosticsInstalled'
const APP_NAME = name.charAt(0).toUpperCase() + name.slice(1)
const COVER_PROBE_TIMEOUT_MS = 3500
const memoryTrendSampler = new MemoryTrendSampler()

const classifyCoverNetworkError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.match(/\bERR_[A-Z0-9_]+\b/)?.[0]
  if (code) return code
  return /abort|timeout/i.test(message) ? 'timeout' : 'request_failed'
}

/** Probe only NetEase's image CDN, without exporting URL paths or query strings. */
const probeCoverCandidate = async (url: string) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), COVER_PROBE_TIMEOUT_MS)
  const host = new URL(url).hostname
  try {
    const response = await net.fetch(url, {
      method: 'GET',
      credentials: 'omit',
      signal: controller.signal
    })
    const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase()
    const result = {
      host,
      status: response.status,
      contentType,
      image: response.ok && contentType.startsWith('image/')
    }
    await response.body?.cancel().catch(() => undefined)
    return result
  } catch (error) {
    return {
      host,
      status: null,
      contentType: '',
      image: false,
      error: classifyCoverNetworkError(error)
    }
  } finally {
    clearTimeout(timeout)
  }
}

/** Share only URL structure: never include paths, query values, or resource identifiers. */
const describeCoverUrlShape = (value: string) => {
  const url = new URL(value)
  const segments = url.pathname.split('/').filter(Boolean)
  const queryKeys = Array.from(url.searchParams.keys())
  return {
    pathSegmentCount: segments.length,
    pathLength: url.pathname.length,
    hasEncodedPath: /%[0-9a-f]{2}/i.test(url.pathname),
    hasSizeParam: url.searchParams.has('param'),
    sizeParamCount: queryKeys.filter((key) => key === 'param').length,
    uniqueQueryKeyCount: new Set(queryKeys).size,
    repeatedQueryKeyCount: queryKeys.length - new Set(queryKeys).size,
    embeddedQuestionMarkCount: (url.search.match(/\\?/g) || []).length - 1,
    queryParameterCount: queryKeys.length,
    hasOtherQueryParameters: queryKeys.some((key) => key !== 'param'),
    hasFragment: Boolean(url.hash)
  }
}

/** Main-world V8/backing storage, unavailable rather than invented when DevTools owns the target. */
const readRendererHeapUsage = async (contents: WebContents) => {
  if (contents.isDevToolsOpened()) return { available: false, reason: 'devtools_open' }
  const debuggerApi = contents.debugger
  let owned = false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (!debuggerApi.isAttached()) {
      debuggerApi.attach('1.3')
      owned = true
    }
    const usage = await Promise.race([
      debuggerApi.sendCommand('Runtime.getHeapUsage'),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 1500)
      })
    ])
    return {
      available: true,
      usedBytes: usage.usedSize,
      allocatedBytes: usage.totalSize,
      embedderBytes: usage.embedderHeapUsedSize ?? null,
      backingStorageBytes: usage.backingStorageSize ?? null
    }
  } catch {
    return { available: false, reason: 'unavailable' }
  } finally {
    if (timer) clearTimeout(timer)
    if (owned && debuggerApi.isAttached()) debuggerApi.detach()
  }
}

const installRuntimeDiagnostics = (): void => {
  const runtime = globalThis as typeof globalThis & Record<string, unknown>
  if (runtime[INSTALL_KEY]) return
  runtime[INSTALL_KEY] = true

  ipcMain.handle('get-runtime-memory', (event) => {
    const lyricsPids = new Set(
      webContents
        .getAllWebContents()
        .filter((contents) => contents.getURL().includes('/osdlyric.html'))
        .map((contents) => contents.getOSProcessId())
    )
    return summarizeRuntimeMemory(
      app.getAppMetrics(),
      event.sender.getOSProcessId(),
      lyricsPids,
      process.platform
    )
  })

  ipcMain.handle('probe-netease-cover-network', async (_event, sources: unknown) => {
    if (!Array.isArray(sources)) return { checked: false, reason: 'invalid_input' }
    const urls = Array.from(
      new Set(
        sources
          .slice(0, 2)
          .filter((value): value is string => typeof value === 'string' && value.length < 2048)
          .filter((value) => {
            if (!isNeteaseAssetUrl(value)) return false
            const parsed = new URL(value)
            return !parsed.username && !parsed.password && !parsed.port
          })
      )
    )
    if (!urls.length) return { checked: false, reason: 'no_netease_failures' }

    const results = await Promise.all(
      urls.map(async (url) => {
        const candidates = getNeteaseImageCandidateUrls(url)
        const withoutSize = candidates.find((candidate) => {
          const parsed = new URL(candidate)
          return (
            parsed.hostname === new URL(url).hostname &&
            !parsed.searchParams.has('param') &&
            new URL(url).searchParams.has('param')
          )
        })
        // Diagnostic-only comparison: never strip unknown parameters from production URLs.
        const bareUrl = new URL(url)
        bareUrl.search = ''
        bareUrl.hash = ''
        const sample = [
          { variant: 'original', url: candidates[0] },
          { variant: 'without_query_diagnostic', url: bareUrl.toString() }
        ]
        if (withoutSize) sample.push({ variant: 'without_size_param', url: withoutSize })
        return {
          urlShape: describeCoverUrlShape(url),
          sizeVariantAvailable: Boolean(withoutSize),
          attempts: await Promise.all(
            sample.map(async (candidate) => ({
              variant: candidate.variant,
              ...(await probeCoverCandidate(candidate.url))
            }))
          )
        }
      })
    )
    return { checked: true, sampleCount: results.length, results }
  })

  ipcMain.handle('get-runtime-diagnostics', async (event) => {
    const gpuStatus = app.isReady() ? app.getGPUFeatureStatus() : {}
    const processMetrics = app.isReady() ? app.getAppMetrics() : []
    const linuxProcessMemory =
      process.platform === 'linux' && app.isReady()
        ? readLinuxAppProcessMemory(
            process.pid,
            processMetrics.map((metric) => metric.pid)
          )
        : null
    const deltas = memoryTrendSampler.sample(
      processMetrics.map((metric) => ({
        pid: metric.pid,
        workingSetMiB: metric.memory.workingSetSize / 1024
      }))
    )
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
      audioRequests: getAudioRequestDiagnostics(),
      rendererHeap: await readRendererHeapUsage(event.sender),
      browserMemory: {
        heap: process.getHeapStatistics(),
        externalBytes: process.memoryUsage().external,
        arrayBufferBytes: process.memoryUsage().arrayBuffers
      },
      gpu: gpuStatus,
      systemMemory: {
        totalMiB: Math.round(os.totalmem() / 1024 / 1024),
        freeMiB: Math.round(os.freemem() / 1024 / 1024)
      },
      // Linux /proc tree includes child processes that getAppMetrics may
      // omit; PSS distinguishes shared resident pages from virtual mappings.
      linuxProcessMemory,
      processes: app.isReady()
        ? processMetrics.map((metric) => {
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
              memoryTrend: deltas.get(metric.pid) || null,
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
