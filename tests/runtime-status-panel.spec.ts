import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import Vue from '@vitejs/plugin-vue'
import { buildSync, build } from 'esbuild'

let directory: string, server: ViteDevServer, app: ElectronApplication, page: Page
const errors: string[] = []

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'vutron-runtime-status-'))
  server = await createServer({
    cacheDir: join(directory, 'vite-cache'),
    configFile: false,
    root: resolve('tests/fixtures/runtime-status'),
    plugins: [Vue()],
    resolve: { alias: { '@': resolve('src') } },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } }
  })
  server.middlewares.use('/netease', (_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ code: 200, data: [], stableScrobbleV1Available: true }))
  })
  await server.listen()
  buildSync({
    entryPoints: ['src/preload/index.ts'],
    bundle: true,
    platform: 'node',
    external: ['electron'],
    outfile: join(directory, 'preload.cjs')
  })
  // Keep the production IPC handler, substituting only the disk store so no personal profile is read.
  await build({
    entryPoints: ['src/main/runtimeDiagnostics.ts'],
    bundle: true,
    platform: 'node',
    external: ['electron'],
    outfile: join(directory, 'runtime.cjs'),
    plugins: [
      {
        name: 'isolated-store',
        setup(build) {
          build.onResolve({ filter: /^\.\/store$/ }, () => ({
            path: 'store',
            namespace: 'fixture'
          }))
          build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: 'export default { get: () => null, set: () => {} }'
          }))
        }
      }
    ]
  })
  writeFileSync(
    join(directory, 'bootstrap.cjs'),
    `
    const {app,BrowserWindow,ipcMain}=require('electron');
    if(process.env.VUTRON_TEST_SOFTWARE==='1')app.disableHardwareAcceleration();
    app.setPath('userData',${JSON.stringify(join(directory, 'profile'))}+'-'+process.pid);
    globalThis.probe={calls:{},fail:false,delay:0,windows:false};
    const native=ipcMain.handle.bind(ipcMain);
    ipcMain.handle=(channel,handler)=>native(channel,async(event,...args)=>{
      const p=globalThis.probe;p.calls[channel]=(p.calls[channel]||0)+1;
      if(channel==='get-runtime-memory'){
        if(p.delay)await new Promise(r=>setTimeout(r,p.delay));
        if(p.fail)throw new Error('fixture unavailable');
      }
      const result=await handler(event,...args);
      if(channel==='get-runtime-memory'&&p.windows){result.platform='win32';result.mainPrivateMiB=123;}
      return result;
    });
    app.whenReady().then(()=>{
      require('./runtime.cjs');
      for(const ch of ['getLocalMusic','get-lastfm-session','systemPing']) ipcMain.handle(ch,()=>ch==='getLocalMusic'?{songs:[],playlists:[]}:{});
      ipcMain.handle('msgRequestGetVersion',()=> '4.0.0-beta.1');
      ipcMain.handle('get-cache-path',()=> ${JSON.stringify(join(directory, 'cache'))});
      ipcMain.handle('clearCacheTracks',()=>true);
      const win=new BrowserWindow({width:1040,height:860,show:true,webPreferences:{sandbox:true,contextIsolation:true,preload:${JSON.stringify(join(directory, 'preload.cjs'))},backgroundThrottling:false}});
      win.loadURL(${JSON.stringify(server.resolvedUrls!.local[0])});
    });
  `
  )
})
test.afterAll(async () => {
  await server?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})
test.beforeEach(async () => {
  errors.length = 0
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({ args: [join(directory, 'bootstrap.cjs'), '--no-sandbox'], env })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('.network-button').waitFor()
})
test.afterEach(async () => {
  await app?.close()
})
const calls = () => app.evaluate(() => (globalThis as any).probe.calls['get-runtime-memory'] || 0)
const openMemory = async () => {
  await page.locator('.network-button').click()
  await page.getByRole('tab', { name: '内存', exact: true }).click()
  await expect(page.locator('.memory-panel')).toContainText('主窗口工作集')
}

test('zoomed popover controls do not create hover overflow or move during live updates', async ({}, testInfo) => {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setSize(1300, 920)
    win.webContents.setZoomFactor(1.5)
  })
  await page.evaluate(() => document.documentElement.setAttribute('data-accent-theme', 'rainbow'))
  await page.locator('.network-button').click()
  const panel = page.locator('.network-panel')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument')
  const measurements: unknown[] = []
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.body.setAttribute('data-theme', value), theme)
    for (const tab of ['网络', '内存']) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      if (tab === '内存') await expect(page.locator('.memory-panel')).toContainText('MiB')
      const controls =
        tab === '内存'
          ? ['#runtime-memory-tab', '.memory-copy']
          : ['#runtime-network-tab', '#runtime-memory-tab']
      for (const selector of controls) {
        await page.locator(selector).hover()
        // Other Electron fixtures can move the OS pointer. Hold the target's
        // CSS hover state while measuring its generated content and overflow.
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] })
        const frames = await panel.evaluate(async (element, selector) => {
          const result: Array<{
            x: number
            y: number
            width: number
            bottom: number
            viewportWidth: number
            viewportHeight: number
            overflow: number
            generated: boolean
          }> = []
          for (let i = 0; i < 20; i++) {
            window.dispatchEvent(
              new CustomEvent('vutronmusic-netease-request-metric', {
                detail: { elapsedMs: i % 2 ? 80 : 9999, ok: i % 3 !== 0 }
              })
            )
            await new Promise(requestAnimationFrame)
            const box = element.getBoundingClientRect()
            const hovered = element.querySelector(selector)!
            const after = getComputedStyle(hovered, '::after')
            result.push({
              x: box.x,
              y: box.y,
              width: box.width,
              bottom: box.bottom,
              viewportWidth: innerWidth,
              viewportHeight: innerHeight,
              overflow: element.scrollWidth - element.clientWidth,
              generated: after.display !== 'none' && !['none', 'normal'].includes(after.content)
            })
          }
          return result
        }, selector)
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
        measurements.push({ theme, tab, selector, frames })
        writeFileSync(
          testInfo.outputPath('hover-measurements.json'),
          JSON.stringify(measurements, null, 2)
        )
        await testInfo.attach(`hover-${theme}-${tab}-${selector}`, {
          body: JSON.stringify(frames),
          contentType: 'application/json'
        })
        expect(frames.every((frame) => frame.overflow === 0 && !frame.generated)).toBe(true)
        expect(
          frames.every(
            (frame) =>
              frame.x >= 0 &&
              frame.y >= 0 &&
              frame.x + frame.width <= frame.viewportWidth &&
              frame.bottom <= frame.viewportHeight
          )
        ).toBe(true)
        expect(new Set(frames.map(({ x, y, width }) => `${x},${y},${width}`)).size).toBe(1)
        await expect(panel).toBeVisible()
      }
    }
    // Native capture avoids CDP viewport cropping when webContents zoom is not 1.
    const screenshot = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')
    )
    writeFileSync(
      testInfo.outputPath(`popover-zoom-${theme}.png`),
      Buffer.from(screenshot, 'base64')
    )
  }
  await testInfo.attach('hover-measurements', {
    body: JSON.stringify(measurements),
    contentType: 'application/json'
  })
  await cdp.detach()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  // Navigation tooltips still work outside the panel.
  await page.locator('.side-nav > button[data-tip]').first().hover()
  expect(
    await page
      .locator('.side-nav > button[data-tip]')
      .first()
      .evaluate((element) => getComputedStyle(element, '::after').display)
  ).toBe('block')
  expect(errors).toEqual([])
})

test('real preload and production IPC sample only on the visible memory page, and release timers on close', async () => {
  await page.clock.install()
  expect(await calls()).toBe(0)
  await page.locator('.network-button').click()
  await page.clock.fastForward(10000)
  expect(await calls()).toBe(0)
  await page.getByRole('tab', { name: '内存', exact: true }).click()
  await expect.poll(calls).toBe(1)
  await expect(page.locator('.memory-panel')).toContainText('MiB')
  await page.clock.fastForward(5000)
  await expect.poll(calls).toBe(2)
  await page.getByRole('tab', { name: '网络', exact: true }).click()
  await page.clock.fastForward(15000)
  expect(await calls()).toBe(2)
  await page.getByRole('tab', { name: '内存', exact: true }).click()
  await expect.poll(calls).toBe(3)
  await page.keyboard.press('Escape')
  await page.clock.fastForward(15000)
  expect(await calls()).toBe(3)
  expect(errors).toEqual([])
})

test('bounded trends copy through the existing full snapshot without periodic heavy diagnostics', async ({}, testInfo) => {
  test.setTimeout(120000)
  await page.clock.install()
  await openMemory()
  for (let i = 1; i <= 64; i++) {
    await page.clock.fastForward(5000)
    await expect.poll(calls).toBe(i + 1)
    await page.waitForTimeout(10)
  }
  expect(
    await app.evaluate(() => (globalThis as any).probe.calls['get-runtime-diagnostics'] || 0)
  ).toBe(0)
  await page.getByRole('button', { name: '复制诊断快照', exact: true }).click()
  await expect(page.locator('.memory-panel')).toContainText('诊断信息已复制')
  const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText())
  const snapshot = JSON.parse(clipboard.slice(clipboard.indexOf('{')))
  expect(snapshot.renderer.memoryMonitor.history).toHaveLength(60)
  expect(JSON.stringify(snapshot.renderer.memoryMonitor).length).toBeLessThan(16384)
  expect(snapshot.main.processes.length).toBeGreaterThan(0)
  expect(snapshot.renderer.memoryMonitor.sample.mainWorkingSetMiB).toBeGreaterThan(0)
  expect(clipboard).not.toContain('fixture-secret-token')
  const copyWidth = await page
    .locator('.memory-copy')
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(copyWidth).toBeGreaterThan(200)
  const screenshot = testInfo.outputPath('memory-panel.png')
  await page.screenshot({ path: screenshot })
  await testInfo.attach('memory-panel', { path: screenshot, contentType: 'image/png' })
  expect(errors).toEqual([])
})

test('failed and late requests cannot revive a closed panel; Windows private bytes and keyboard tabs work', async ({}, testInfo) => {
  await app.evaluate(() => {
    ;(globalThis as any).probe.fail = true
  })
  await page.locator('.network-button').click()
  await page.getByRole('tab', { name: '内存', exact: true }).click()
  await expect(page.locator('.memory-panel')).toContainText('暂时无法获取内存信息')
  await page.getByRole('tab', { name: '内存', exact: true }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: '网络', exact: true })).toBeFocused()
  await app.evaluate(() => {
    const p = (globalThis as any).probe
    p.fail = false
    p.windows = true
    p.delay = 150
  })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  const closedCount = await calls()
  await page.waitForTimeout(250)
  await expect(page.locator('.memory-panel')).toHaveCount(0)
  expect(await calls()).toBe(closedCount)
  await page.locator('.network-button').click()
  await expect(page.locator('.memory-panel')).toContainText('123.0 MiB')
  await page.evaluate(() => (window as any).runtimeProbe.language('en'))
  await expect(page.locator('.memory-panel')).toContainText('Main window private bytes')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(780, 650))
  await page.evaluate(() => document.body.setAttribute('data-theme', 'dark'))
  await page.waitForTimeout(250)
  const panel = page.locator('.network-panel')
  await expect
    .poll(async () => {
      const box = await panel.boundingBox()
      return (
        !!box &&
        box.y >= 0 &&
        box.x >= 0 &&
        box.x + box.width <= (await page.evaluate(() => innerWidth))
      )
    })
    .toBe(true)
  const screenshot = testInfo.outputPath('memory-panel-windows-dark.png')
  await page.screenshot({ path: screenshot })
  await testInfo.attach('memory-panel-windows-dark', { path: screenshot, contentType: 'image/png' })
  expect(errors).toEqual([])
})
