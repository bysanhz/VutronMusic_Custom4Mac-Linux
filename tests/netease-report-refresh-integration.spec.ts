import { expect, test, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import Vue from '@vitejs/plugin-vue'

let directory: string, server: ViteDevServer, app: ElectronApplication, page: Page
let mode = 'stale'
const calls: string[] = []
const errors: string[] = []
const now = new Date(2026, 10, 1, 12)
const monthStart = new Date(2026, 10, 1).getTime()
const report = (startTime: number, days: Array<[string, number]>) => ({
  code: 200,
  data: {
    startTime,
    listenTimeDistributionBlock: {
      playDuration: days.reduce((sum, [, minutes]) => sum + minutes, 0),
      durationDetails: days.map(([period, duration]) => ({ period, duration }))
    }
  }
})

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'vutron-listen-reports-'))
  server = await createServer({
    optimizeDeps: {
      noDiscovery: true,
      include: ['vue', 'pinia', 'vue-i18n', 'axios', 'js-cookie', 'lodash']
    },
    configFile: false,
    cacheDir: join(directory, 'vite-cache'),
    root: resolve('tests/fixtures/listen-reports'),
    plugins: [
      {
        name: 'isolated-insights-stores',
        enforce: 'pre',
        configureServer(server) {
          server.middlewares.use('/netease', (req, res) => {
            const url = new URL(req.url!, 'http://fixture')
            calls.push(url.pathname + url.searchParams.get('type'))
            let body: any = { code: 200, data: {} }
            if (url.pathname.endsWith('/total')) body.data.totalDuration = 24854641
            if (url.pathname.endsWith('/today/song')) body.data.songDTOs = [{ songId: 1 }]
            if (url.pathname.endsWith('/realtime/report')) {
              if (url.searchParams.get('type') === 'month') {
                if (mode === 'offline') {
                  res.statusCode = 503
                  body = { code: 503 }
                } else if (mode === 'invalid')
                  body = {
                    code: 200,
                    data: {
                      startTime: monthStart,
                      listenTimeDistributionBlock: { playDuration: null }
                    }
                  }
                else
                  body =
                    mode === 'ready'
                      ? report(monthStart, [['2026-11-01', 15]])
                      : report(new Date(2026, 9, 1).getTime(), [['2026-10-31', 100]])
              } else {
                body = report(new Date(2026, 9, 25).getTime(), [
                  ['2026-10-25', 800],
                  ['2026-10-26', 10],
                  ['2026-10-31', 20],
                  ...(mode === 'stale' ? [] : [['2026-11-01', 5] as [string, number]])
                ])
              }
            }
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(body))
          })
        },
        resolveId(source, importer) {
          if (importer?.endsWith('/utils/request.ts') && source === './auth')
            return '\0fixture-auth'
          if (!importer?.includes('MusicInsightsStable.vue')) return
          if (source.endsWith('/store/data')) return '\0fixture-data'
          if (source.endsWith('/store/player')) return '\0fixture-player'
          if (source.endsWith('/store/state')) return '\0fixture-state'
          if (source.endsWith('.vue')) return '\0fixture-child'
        },
        load(id) {
          if (id === '\0fixture-auth')
            return `export const doLogout=()=>{throw Error('Unexpected logout in fixture')}`
          if (id === '\0fixture-data')
            return `import {defineStore} from 'pinia';export const useDataStore=defineStore('fixture-data',{state:()=>({liked:[],user:{userId:'fixture'},cloudDisk:[]}),actions:{async fetchCloudDisk(){}}})`
          if (id === '\0fixture-player')
            return `export const usePlayerStore=()=>({syncCurrentNeteaseListenCheckpoint:async()=>{},replayHistoricalNeteaseListens:async()=>{throw Error('Resend not permitted in report test')}})`
          if (id === '\0fixture-state')
            return `export const useNormalStateStore=()=>({showToast:()=>{}})`
          if (id === '\0fixture-child') return `export default {render:()=>null}`
        }
      },
      Vue()
    ],
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } }
  })
  await server.listen()
  writeFileSync(
    join(directory, 'main.cjs'),
    `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});app.whenReady().then(()=>new BrowserWindow({show:false,webPreferences:{sandbox:true}}).loadURL(${JSON.stringify(server.resolvedUrls!.local[0])}));`
  )
  app = await _electron.launch({
    args: ['--no-sandbox', join(directory, 'main.cjs')],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }
  })
  page = await app.firstWindow()
  await page.addInitScript(() => localStorage.clear())
  page.on('pageerror', (error) => errors.push(error.message))
  // Complete Vite's initial dependency reload before installing a test clock
  // and starting a new page load; otherwise those two navigations can race.
  await expect(page.locator('.rainbow-metric-total')).toContainText(/\d/)
  await page.waitForLoadState('networkidle')
})

test.afterAll(async () => {
  await app?.close()
  await server?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

test.beforeEach(async () => {
  mode = 'stale'
  calls.length = 0
  errors.length = 0
  await page.clock.install({ time: now })
  await page.reload()
  await expect(page.locator('.sync-report-unavailable')).toContainText('2026-10-31')
})

test('explains missing today separately from healthy lifetime totals without inventing duration', async () => {
  await expect(page.locator('.rainbow-metric-today')).toContainText('累计收听 —')
  await expect(page.locator('.rainbow-metric-today')).toContainText('暂缺今日时长')
  await expect(page.locator('.rainbow-metric-total')).not.toContainText('—')
  const entries = await page.evaluate(() => (window as any).listenProbe.entries())
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({
    sessionId: 'fixture-session',
    status: 'accepted',
    seconds: 300
  })
  expect(await page.evaluate(() => (window as any).listenProbe.diagnostics().acceptedSeconds)).toBe(
    300
  )
  expect(errors).toEqual([])
})

test('lightweight refresh uses the week when month is stale or fails, then recovers the month', async () => {
  mode = 'week-ready'
  const before = calls.length
  await page.clock.fastForward(61000)
  await expect(page.locator('.rainbow-metric-today')).toContainText('累计收听 5分')
  expect(calls.slice(before)).toContain('/listen/data/realtime/reportweek')
  await expect(page.locator('.rainbow-metric-week')).toContainText('35分')
  mode = 'offline'
  await page.clock.fastForward(61000)
  await expect(page.locator('.sync-report-unavailable')).toContainText('暂不可用')
  await expect(page.locator('.rainbow-metric-today')).toContainText('累计收听 5分')
  mode = 'invalid'
  await page.clock.fastForward(61000)
  await expect(page.locator('.sync-report-unavailable')).toContainText('缺少有效')
  mode = 'ready'
  await page.clock.fastForward(61000)
  await expect(page.locator('.sync-report-unavailable')).toHaveCount(0)
  await expect(page.locator('.rainbow-metric-today')).toContainText('累计收听 15分')
  await expect(page.locator('.rainbow-metric-week')).toContainText('45分')
  await expect(page.locator('.rainbow-metric-month')).toContainText('15分')
  const entries = await page.evaluate(() => (window as any).listenProbe.entries())
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ sessionId: 'fixture-session', seconds: 300 })
  expect(errors).toEqual([])
})
