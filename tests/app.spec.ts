import { _electron, test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  appendFileSync,
  existsSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { pathToFileURL } from 'node:url'

let app: ElectronApplication, page: Page, directory: string
const errors: string[] = []

test.beforeAll(async ({}, testInfo) => {
  // Production assets, fresh profile, separate loopback port. Never read user data.
  const temporaryRoot = resolve('tmp')
  mkdirSync(temporaryRoot, { recursive: true })
  directory = mkdtempSync(join(temporaryRoot, 'production-audit-'))
  const socket = createServer()
  await new Promise<void>((done) => socket.listen(0, '127.0.0.1', done))
  const port = (socket.address() as { port: number }).port
  await new Promise<void>((done, reject) =>
    socket.close((error) => (error ? reject(error) : done()))
  )
  // The optional Amuse server also needs a private port during paired runs.
  const amuseSocket = createServer()
  await new Promise<void>((done) => amuseSocket.listen(0, '127.0.0.1', done))
  const amusePort = (amuseSocket.address() as { port: number }).port
  await new Promise<void>((done, reject) =>
    amuseSocket.close((error) => (error ? reject(error) : done()))
  )
  cpSync(resolve('dist'), join(directory, 'dist'), { recursive: true })
  const remapPort = (root: string) => {
    for (const file of readdirSync(root, { withFileTypes: true })) {
      const path = join(root, file.name)
      if (file.isDirectory()) remapPort(path)
      else if (file.name.endsWith('.js')) {
        const source = readFileSync(path, 'utf8')
        if (source.includes('41830') || source.includes('9863')) {
          writeFileSync(
            path,
            source.replace(/\b41830\b/g, String(port)).replace(/\b9863\b/g, String(amusePort))
          )
        }
      }
    }
  }
  remapPort(join(directory, 'dist'))
  mkdirSync(join(directory, 'resources'))
  cpSync(
    resolve('buildAssets/generated-icons/1024x1024.png'),
    join(directory, 'resources/app-icon.png')
  )
  cpSync(
    resolve('buildAssets/generated-icons/tray/24x24.png'),
    join(directory, 'resources/app-tray-icon.png')
  )
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ type: 'commonjs' }))
  writeFileSync(
    join(directory, 'bootstrap.mjs'),
    `
    import {app} from 'electron';
    app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});
    Object.defineProperty(process,'resourcesPath',{value:${JSON.stringify(join(directory, 'resources'))}});
    await import(${JSON.stringify(pathToFileURL(join(directory, 'dist/main/index.js')).href)});
  `
  )
  const env = { ...process.env, NODE_ENV: 'production' }
  delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({ args: [join(directory, 'bootstrap.mjs'), '--no-sandbox'], env })
  const startupLog = testInfo.outputPath('production-main.log')
  app.process().stderr?.on('data', (data) => appendFileSync(startupLog, data))
  app.process().stdout?.on('data', (data) => appendFileSync(startupLog, data))
  try {
    page = await app.firstWindow()
  } catch (error) {
    const log = join(directory, 'profile/logs/main.log')
    if (existsSync(log)) appendFileSync(startupLog, readFileSync(log))
    appendFileSync(
      startupLog,
      JSON.stringify(
        await app.evaluate(({ app, BrowserWindow }) => ({
          ready: app.isReady(),
          windows: BrowserWindow.getAllWindows().length,
          initialized: (globalThis as any).__VUTRON_MAIN_INITIALIZED__,
          profile: app.getPath('userData')
        }))
      )
    )
    throw error
  }
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.vutronmusic && window.mainApi))
})

test.afterAll(async () => {
  await app?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

test('production entry starts with an isolated profile and retains the global Heart Mode control', async () => {
  expect(await page.evaluate(() => window.mainApi?.invoke('get-runtime-diagnostics'))).toBeTruthy()
  await expect(page.locator('.heart-mode-trigger')).toBeVisible()
  expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(join(directory, 'profile'))
  expect(await page.evaluate(() => location.port)).not.toBe('41830')
  expect(errors).toEqual([])
})

test('production settings survive repeated route changes without duplicate diagnostics entries', async () => {
  for (let index = 0; index < 5; index++) {
    await page.locator('.rainbow-nav-settings').click()
    await expect(page.locator('.system-settings')).toBeVisible()
    await page.locator('.rainbow-settings-tab').last().click()
    await expect(page.locator('#vutronmusic-update-diagnostics-setting')).toHaveCount(1)
    await expect(page.locator('#vutronmusic-update-diagnostics-setting')).toBeVisible()
    await page.locator('.rainbow-settings-tab').nth(5).click()
    // Settings tabs use v-show; the update entry remains mounted but hidden.
    await expect(page.locator('#vutronmusic-update-diagnostics-setting')).toBeHidden()
    await page.locator('.rainbow-nav-home').click()
    await expect(page.locator('.system-settings')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('desktop lyric controls own their edge clicks while the window can still move and resize', async () => {
  test.skip(
    process.platform !== 'linux' ||
      process.env.XDG_SESSION_TYPE === 'wayland' ||
      Boolean(process.env.WAYLAND_DISPLAY),
    'Verifies the Linux X11 desktop lyric window'
  )
  const opening = app.waitForEvent('window')
  await page.evaluate(() => window.mainApi?.send('updateOsdState', { show: true }))
  const osd = await opening
  const controls = osd.locator('.compact-cover-controls')
  const previous = controls.locator('.control-prev')
  await expect(previous).toBeVisible()

  try {
    await expect.poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().includes('/osdlyric.html'))
          ?.isAlwaysOnTop()
      )
    ).toBe(true)
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().includes('/osdlyric.html'))!
          .isResizable()
      )
    ).toBe(false)
    await controls.hover()
    const points = await controls.locator('.compact-control-button').evaluateAll((buttons) =>
      buttons.map((button, index) => {
        const rect = button.getBoundingClientRect()
        return {
          x: rect.left + rect.width / 2,
          y: index < 3 ? rect.top + 1 : rect.bottom - 1,
          expected: Array.from(button.classList).find((name) => name.startsWith('control-'))
        }
      })
    )
    for (const { x, y, expected } of points) {
      const hit = await osd.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y)
        return {
          classes: element?.closest('button')?.className,
          cursor: element ? getComputedStyle(element).cursor : null
        }
      }, { x, y })
      expect(hit, `button at (${x}, ${y})`).toMatchObject({
        classes: expect.stringContaining(expected!),
        cursor: 'pointer'
      })
    }

    await previous.evaluate((button) => {
      button.addEventListener('click', () => button.setAttribute('data-tested-click', 'true'), {
        once: true
      })
    })
    await osd.mouse.move(points[0].x, points[0].y)
    await osd.mouse.down()
    try {
      await expect(previous).toHaveCSS('transform', 'none')
    } finally {
      await osd.mouse.up()
    }
    await expect(previous).toHaveAttribute('data-tested-click', 'true')

    const readBounds = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().includes('/osdlyric.html'))!
          .getBounds()
      )
    const start = await readBounds()
    const drag = osd.locator('.osd-drag-bar')
    const handle = (await drag.boundingBox())!
    await osd.mouse.move(handle.x + handle.width / 2, handle.y + handle.height - 1)
    await osd.mouse.down()
    try {
      await osd.mouse.move(handle.x + handle.width / 2 + 25, handle.y + handle.height - 1)
      await expect.poll(async () => (await readBounds()).x).toBeGreaterThan(start.x + 10)
    } finally {
      await osd.mouse.up()
    }
    expect((await readBounds()).width).toBe(start.width)

    const edge = (await osd.locator('.resize-edge-right').boundingBox())!
    await osd.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2)
    await osd.mouse.down()
    try {
      await osd.mouse.move(edge.x + edge.width / 2 + 30, edge.y + edge.height / 2)
      await expect.poll(async () => (await readBounds()).width).toBeGreaterThan(start.width + 15)
    } finally {
      await osd.mouse.up()
    }
  } finally {
    await page.evaluate(() => window.mainApi?.send('updateOsdState', { show: false }))
    await expect.poll(() => osd.isClosed()).toBe(true)
  }
})

test('opt-in production idle memory observation without forced GC', async ({}, testInfo) => {
  const seconds = Number(process.env.VUTRON_STABILITY_SECONDS || 0)
  test.skip(!seconds, 'Set VUTRON_STABILITY_SECONDS to run a controlled idle observation')
  expect(Number.isFinite(seconds) && seconds >= 10 && seconds <= 86400).toBe(true)
  test.setTimeout((seconds + 60) * 1000)
  const cdp = await page.context().newCDPSession(page)
  const output = testInfo.outputPath('production-idle-memory.jsonl')
  const start = Date.now()
  try {
    do {
      const [heap, dom, runtime] = await Promise.all([
        cdp.send('Runtime.getHeapUsage'),
        cdp.send('Memory.getDOMCounters'),
        page.evaluate(() => window.mainApi?.invoke('get-runtime-diagnostics'))
      ])
      appendFileSync(
        output,
        JSON.stringify({
          elapsedSeconds: (Date.now() - start) / 1000,
          scenario: 'production-idle-fresh-profile',
          heap,
          dom,
          runtime,
          intlifyMeasures: await page.evaluate(() =>
            [
              'intlify message resolve',
              'intlify message compilation',
              'intlify message evaluation'
            ].map((name) => performance.getEntriesByName(name, 'measure').length)
          )
        }) + '\n'
      )
      if (Date.now() - start >= seconds * 1000) break
      await new Promise((done) =>
        setTimeout(done, Math.min(15000, seconds * 1000 - (Date.now() - start)))
      )
    } while (true)
  } finally {
    await cdp.detach()
  }
  await testInfo.attach('production-idle-memory', {
    path: output,
    contentType: 'application/x-ndjson'
  })
  expect(errors).toEqual([])
})
