import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type ViteDevServer } from 'vite'
import Vue from '@vitejs/plugin-vue'
import { build } from 'esbuild'

let server: ViteDevServer, directory: string, app: ElectronApplication, page: Page
const errors: string[] = []
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'vutron-resources-'))
  server = await createServer({
    cacheDir: join(directory, 'vite-cache'),
    configFile: false,
    root: resolve('tests/fixtures/renderer-resources'),
    plugins: [Vue()],
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } }
  })
  server.middlewares.use('/broken', (_req, res) => {
    res.writeHead(503)
    res.end('unavailable')
  })
  await server.listen()
  await build({
    entryPoints: ['src/main/security/runtimeSecurity.ts'],
    platform: 'node',
    bundle: true,
    external: ['electron'],
    outfile: join(directory, 'security.cjs'),
    plugins: [
      {
        name: 'isolated-storage',
        setup(build) {
          build.onResolve({ filter: /^electron-store$/ }, () => ({
            path: 'store-class',
            namespace: 'fixture'
          }))
          build.onResolve({ filter: /^\.\.\/(store|db)$/ }, (args) => ({
            path: args.path,
            namespace: 'fixture'
          }))
          build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents:
              args.path === 'store-class'
                ? 'export default class Store {get(){return undefined} set(){}}'
                : args.path.endsWith('db')
                  ? 'export const db={};export const Tables={}'
                  : 'export default {get:()=>undefined,set:()=>{}}'
          }))
        }
      }
    ]
  })
  writeFileSync(
    join(directory, 'bootstrap.cjs'),
    `
    const{app,BrowserWindow,protocol,session}=require('electron');
    app.setPath('userData',${JSON.stringify(join(directory, 'profile'))}+'-'+process.pid);
    protocol.registerSchemesAsPrivileged([{scheme:'atom',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=','base64');
    globalThis.probe={requests:[]};
    app.whenReady().then(()=>{
      require('node:dns/promises').lookup=async()=>[{address:'8.8.8.8',family:4}];
      require('./security.cjs');
      protocol.handle('atom',request=>{
        globalThis.probe.requests.push(request.url);
        return new Response(png,{headers:{'content-type':'image/png'}});
      });
      session.defaultSession.webRequest.onBeforeRequest({urls:['https://p1.music.126.net/*']},(details,callback)=>callback({redirectURL:${JSON.stringify(server.resolvedUrls!.local[0])}+'broken'}));
      new BrowserWindow({show:true,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}}).loadURL(${JSON.stringify(server.resolvedUrls!.local[0])});
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
  page.on('pageerror', (e) => errors.push(e.message))
  await page.waitForFunction(() => !!(window as any).resourceProbe)
})
test.afterEach(async () => {
  await app?.close()
})
const run = async (count: number) =>
  page.evaluate((count) => (window as any).resourceProbe.translate(count), count)
const sample = async () => {
  const pid = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getOSProcessId()
  )
  const cdp = await page.context().newCDPSession(page)
  const heap = await cdp.send('Runtime.getHeapUsage')
  await cdp.detach()
  const memory = await app.evaluate(
    ({ app }, pid) => app.getAppMetrics().find((m) => m.pid === pid)?.memory,
    pid
  )
  return { heap, memory }
}

test('real vue-i18n development translations release owned timings and preserve application measurements', async ({}, testInfo) => {
  test.setTimeout(120000)
  const before = await sample()
  expect(await run(20000)).toBe('Hello fixture')
  const baselineCounts = await page.evaluate(() => (window as any).resourceProbe.measures())
  expect(baselineCounts.reduce((a: number, b: number) => a + b, 0)).toBeGreaterThan(30000)
  const baseline = await sample()
  await page.evaluate(() => {
    performance.measure('application-owned', { start: 0, end: 1 })
    ;(window as any).resourceProbe.cleanup()
  })
  expect(await page.evaluate(() => (window as any).resourceProbe.measures())).toEqual([0, 0, 0])
  for (let i = 0; i < 5; i++) expect(await run(20000)).toBe('Hello fixture')
  expect(await page.evaluate(() => (window as any).resourceProbe.measures())).toEqual([0, 0, 0])
  expect(
    await page.evaluate(() => performance.getEntriesByName('application-owned', 'measure').length)
  ).toBe(1)
  const fixed = await sample()
  const stats = await page.evaluate(() => (window as any).resourceProbe.timingDiagnostics())
  expect(stats.active).toBe(true)
  expect(stats.releasedEntries).toBeGreaterThan(100000)
  const path = testInfo.outputPath('timing-memory.json')
  writeFileSync(path, JSON.stringify({ before, baseline, baselineCounts, fixed, stats }, null, 2))
  await testInfo.attach('timing-memory', { path, contentType: 'application/json' })
  expect(errors).toEqual([])
})

test('a failed player cover reaches the guarded proxy, retains query bytes and unregisters on removal', async () => {
  const source = 'https://p1.music.126.net/fixture.png?param=512y512&token=fixture-private'
  await page.evaluate((source) => (window as any).resourceProbe.image(source), source)
  await expect
    .poll(() =>
      page.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)
    )
    .toBe(true)
  const requests = await app.evaluate(() => (globalThis as any).probe.requests)
  expect(requests).toHaveLength(1)
  expect(decodeURIComponent(new URL(requests[0]).pathname.slice(1))).toBe(source)
  const diagnostics = await page.evaluate(() => (window as any).resourceProbe.diagnostics())
  expect(diagnostics.currentImages.loaded).toBe(1)
  expect(diagnostics.failureCount).toBeGreaterThan(0)
  expect(JSON.stringify(diagnostics)).not.toContain('fixture-private')
  await page.evaluate(() => {
    ;(window as any).oldImage = document.querySelector('img')
    ;(window as any).resourceProbe.unmount()
  })
  expect(
    await page.evaluate(() => {
      const i = (window as any).oldImage
      const src = i.src
      i.dispatchEvent(new Event('error'))
      return i.src === src
    })
  ).toBe(true)
  expect(errors).toEqual([])
})

test('cover protocol still rejects private or unrelated remote resources', async () => {
  const statuses = await page.evaluate(async () => {
    const urls = ['http://127.0.0.1/private.png', 'https://unrelated.example/image.png']
    return await Promise.all(
      urls.map((url) => fetch('atom://get-image/' + encodeURIComponent(url)).then((r) => r.status))
    )
  })
  expect(statuses).toEqual([403, 403])
  expect(await app.evaluate(() => (globalThis as any).probe.requests)).toEqual([])
})
