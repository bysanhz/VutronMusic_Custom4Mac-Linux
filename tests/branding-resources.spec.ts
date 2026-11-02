import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import Vue from '@vitejs/plugin-vue'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
import sharp from 'sharp'

let server: ViteDevServer, directory: string, app: ElectronApplication, page: Page
const errors: string[] = []
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'vutron-branding-'))
  server = await createServer({
    configFile: false,
    root: resolve('tests/fixtures/branding'),
    resolve: {
      alias: {
        'daily-card-under-test': resolve(
          process.env.VUTRON_DAILY_CARD_SOURCE_ROOT || '.',
          'src/renderer/components/DailyTracksCard.vue'
        )
      }
    },
    publicDir: resolve('src/public'),
    cacheDir: join(directory, 'cache'),
    plugins: [
      Vue(),
      createSvgIconsPlugin({
        iconDirs: [resolve('src/renderer/assets/icons')],
        symbolId: 'icon-[dir]-[name]'
      }),
      {
        name: 'branding-stores',
        enforce: 'pre',
        resolveId(source) {
          if (/\/store\/(player|state)$/.test(source))
            return '\0branding:' + source.split('/').at(-1)
          if (/\/utils\/auth$/.test(source)) return '\0branding:auth'
          if (/\/api\/playlist$/.test(source)) return '\0branding:api'
        },
        load(id) {
          if (id === '\0branding:player')
            return `import {defineStore} from 'pinia';export const usePlayerStore=defineStore('player',{state:()=>({title:'VutronMusic',_shuffle:false}),actions:{replacePlaylist(){}}});`
          if (id === '\0branding:state')
            return `import {defineStore} from 'pinia';export const useNormalStateStore=defineStore('state',{state:()=>({dailyTracks:[],showLyrics:false}),actions:{showToast(){}}});`
          if (id === '\0branding:auth')
            return 'export const isAccountLoggedIn=()=>!!window.brandingLoggedIn'
          if (id === '\0branding:api')
            return 'window.brandingRequests=[];export const dailyRecommendTracks=()=>new Promise((resolve,reject)=>window.brandingRequests.push({resolve,reject}))'
        }
      }
    ],
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } }
  })
  await server.listen()
  writeFileSync(
    join(directory, 'bootstrap.cjs'),
    `const{app,BrowserWindow,protocol}=require('electron');const fs=require('node:fs');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});app.disableHardwareAcceleration();protocol.registerSchemesAsPrivileged([{scheme:'atom',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);app.whenReady().then(()=>{protocol.handle('atom',r=>new URL(r.url).host==='get-default-pic'?new Response(fs.readFileSync(${JSON.stringify(resolve('src/public/images/default.jpg'))}),{headers:{'Content-Type':'image/jpeg'}}):new Response('',{status:503}));const w=new BrowserWindow({width:1100,height:800,show:false,webPreferences:{sandbox:true}});w.loadURL(${JSON.stringify(server.resolvedUrls!.local[0])});});`
  )
  app = await _electron.launch({ args: [join(directory, 'bootstrap.cjs')] })
  page = await app.firstWindow()
  await page.addInitScript(() => {
    const listeners = new Set<EventListenerOrEventListenerObject>()
    const add = document.addEventListener.bind(document)
    const remove = document.removeEventListener.bind(document)
    document.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options: any
    ) => {
      if (type === 'visibilitychange') listeners.add(listener)
      add(type, listener, options)
    }) as typeof document.addEventListener
    document.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options: any
    ) => {
      if (type === 'visibilitychange') listeners.delete(listener)
      remove(type, listener, options)
    }) as typeof document.removeEventListener
    ;(window as any).visibilityListenerCount = () => listeners.size
  })
  await page.reload()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForFunction(() => Boolean((window as any).brandingProbe))
})
test.afterAll(async () => {
  await app?.close()
  await server?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

test('real components load the new SVG symbols, local fallback, rounded art and Inter font', async ({}, testInfo) => {
  const cover = page.locator('.daily-recommend-card img')
  await expect(cover).toHaveAttribute(
    'src',
    /\/images\/branding\/recommend-(beach|snow|sakura)\.jpg$/
  )
  await expect
    .poll(() => cover.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth))
    .toBe(512)
  await expect
    .poll(() =>
      page.locator('#app-icon').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)
    )
    .toBe(1254)
  await expect(page.locator('.linux-titlebar use')).toHaveAttribute('xlink:href', '#icon-logo')
  expect(await page.locator('#icon-brand-logo path').count()).toBeGreaterThan(0)
  expect(
    await page.evaluate(async () => {
      await document.fonts.load('500 16px Inter')
      return document.fonts.check('500 16px Inter')
    })
  ).toBe(true)
  expect(await page.locator('#app').evaluate((e) => getComputedStyle(e).fontFamily)).toContain(
    'Inter'
  )
  await page.screenshot({ path: testInfo.outputPath('adopted-renderer.png') })
  expect(errors).toEqual([])
})

test('daily card prioritizes real covers and reaches the new default only after failures', async () => {
  const cover = page.locator('.daily-recommend-card img')
  await page.route('https://p1.music.126.net/real.jpg*', (route) =>
    route.fulfill({
      contentType: 'image/jpeg',
      body: readFileSync(resolve('src/public/images/branding/recommend-beach.jpg'))
    })
  )
  await page.evaluate(() =>
    (window as any).brandingProbe.setCover('https://p1.music.126.net/real.jpg')
  )
  await expect(cover).toHaveAttribute('src', /^https:\/\/p1.music.126.net\/real.jpg/)
  await expect(cover).toHaveAttribute('data-vutron-cover-state', 'loaded')
  await page.route('https://p1.music.126.net/failed.jpg*', (route) => route.abort())
  await page.evaluate(() =>
    (window as any).brandingProbe.setCover('https://p1.music.126.net/failed.jpg')
  )
  await expect(cover).toHaveAttribute('src', 'atom://get-default-pic')
  await expect(cover).toHaveAttribute('data-vutron-cover-state', 'fallback')
  expect(await cover.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(512)
  expect(errors).toEqual([])
})

test('daily card releases visibility listeners across 100 mounts and combines pause reasons', async ({}, testInfo) => {
  const result = await page.evaluate(async () => {
    const p = (window as any).brandingProbe
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
    const initial = (window as any).visibilityListenerCount()
    let maximum = initial
    let maximumAfterUnmount = 0
    for (let i = 0; i < 100; i++) {
      p.cardMounted.value = false
      await tick()
      maximumAfterUnmount = Math.max(maximumAfterUnmount, (window as any).visibilityListenerCount())
      p.cardMounted.value = true
      await tick()
      maximum = Math.max(maximum, (window as any).visibilityListenerCount())
    }
    p.setLyrics(true)
    await tick()
    document.dispatchEvent(new Event('visibilitychange'))
    await tick()
    const pausedWithLyrics = document
      .querySelector('.daily-recommend-card img')!
      .classList.contains('paused')
    p.cardActive.value = false
    await tick()
    p.setLyrics(false)
    p.cardActive.value = true
    await tick()
    const resumed = !document
      .querySelector('.daily-recommend-card img')!
      .classList.contains('paused')
    const image = document.querySelector('.daily-recommend-card img')!.getBoundingClientRect()
    const card = document.querySelector('.daily-recommend-card')!.getBoundingClientRect()
    return {
      initial,
      maximum,
      maximumAfterUnmount,
      pausedWithLyrics,
      resumed,
      imageHeight: image.height,
      cardHeight: card.height
    }
  })
  await testInfo.attach('card-lifecycle-counts', {
    body: JSON.stringify(result),
    contentType: 'application/json'
  })
  expect(result.initial).toBeGreaterThan(0)
  expect(result.maximum).toBe(result.initial)
  expect(result.maximumAfterUnmount).toBe(result.initial - 1)
  expect(result.pausedWithLyrics).toBe(true)
  expect(result.resumed).toBe(true)
  expect(result.imageHeight).toBeGreaterThanOrEqual(result.cardHeight)
  expect(result.imageHeight).toBeLessThan(result.cardHeight * 1.04)
  expect(errors).toEqual([])
})

test('late recommendation responses and failures preserve the newest mounted card state', async () => {
  const result = await page.evaluate(async () => {
    const w = window as any,
      p = w.brandingProbe
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
    const activate = async () => {
      p.cardActive.value = false
      await tick()
      p.cardActive.value = true
      await tick()
    }
    w.brandingLoggedIn = true
    await activate()
    const first = w.brandingRequests.at(-1)
    await activate()
    w.brandingRequests.at(-1).resolve({ data: { dailySongs: [{ id: 200 }] } })
    await tick()
    first.resolve({ data: { dailySongs: [{ id: 100 }] } })
    await tick()
    const newest = p.trackId()
    await activate()
    w.brandingRequests.at(-1).reject(new Error('offline'))
    await tick()
    const afterFailure = p.trackId()
    await activate()
    const late = w.brandingRequests.at(-1)
    p.cardMounted.value = false
    await tick()
    late.resolve({ data: { dailySongs: [{ id: 300 }] } })
    await tick()
    const afterUnmount = p.trackId()
    w.brandingLoggedIn = false
    w.brandingRequests = []
    p.cardMounted.value = true
    await tick()
    return { newest, afterFailure, afterUnmount }
  })
  expect(result).toEqual({ newest: 200, afterFailure: 200, afterUnmount: 200 })
  expect(errors).toEqual([])
})

test('settings controls observe only their live route and release pending work on leave', async () => {
  const result = await page.evaluate(async () => {
    const p = (window as any).brandingProbe
    const wait = () => new Promise((resolve) => setTimeout(resolve, 120))
    let calls = 0
    const root = document.createElement('div')
    root.className = 'system-settings'
    root.innerHTML = '<div id="fixture-settings-anchor"></div>'
    document.querySelector('#app')!.append(root)
    p.observeV327SettingsControl(() => {
      calls++
      const anchor = root.querySelector('#fixture-settings-anchor')
      if (!anchor) return false
      if (!root.querySelector('.vutronmusic-v327-settings-item')) {
        const item = document.createElement('div')
        item.className = 'vutronmusic-v327-settings-item'
        anchor.after(item)
      }
      return true
    })
    const stop = p.observeV327SettingsRoot(root)
    await wait()
    const beforeOutside = calls
    const outside = document.createElement('div')
    document.body.append(outside)
    for (let i = 0; i < 100; i++) outside.append(document.createElement('span'))
    await wait()
    const afterOutside = calls
    p.setFeatureLanguage('zh')
    await wait()
    const afterLanguage = calls
    const controlCount = root.querySelectorAll('.vutronmusic-v327-settings-item').length
    stop()
    root.append(document.createElement('span'))
    p.setFeatureLanguage('en')
    await wait()
    const afterLeave = calls
    root.remove()
    outside.remove()
    // Re-entering the route creates its controls again.
    document.querySelector('#app')!.append(root)
    const stopAgain = p.observeV327SettingsRoot(root)
    const reentered = calls > afterLeave
    stopAgain()
    root.remove()
    return { beforeOutside, afterOutside, afterLanguage, controlCount, afterLeave, reentered }
  })
  expect(result.afterOutside).toBe(result.beforeOutside)
  expect(result.afterLanguage).toBeGreaterThan(result.afterOutside)
  expect(result.controlCount).toBe(1)
  expect(result.afterLeave).toBe(result.afterLanguage)
  expect(result.reentered).toBe(true)
  expect(errors).toEqual([])
})

test('local scenes keep their focal points in wide cards without changing the artwork', async ({}, testInfo) => {
  const cover = page.locator('.daily-recommend-card img')
  for (const [name, position] of [
    ['beach', '32%'],
    ['snow', '75%'],
    ['sakura', '64%']
  ]) {
    await cover.evaluate((element, name) => {
      element.removeAttribute('data-vutron-cover-state')
      ;(element as HTMLImageElement).src = '/images/branding/recommend-' + name + '.jpg'
    }, name)
    await expect(cover).toHaveCSS('object-position', `50% ${position}`)
    await expect
      .poll(() =>
        cover.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth)
      )
      .toBe(512)
    await page
      .locator('.daily-recommend-card')
      .screenshot({ path: testInfo.outputPath(`scene-${name}.png`) })
  }
  expect(errors).toEqual([])
})

test('packaging sources are current and obsolete brand directories are absent', async () => {
  expect(existsSync(resolve('buildAssets/icons'))).toBe(false)
  expect(existsSync(resolve('buildAssets/icon-source'))).toBe(false)
  const source = await sharp(resolve('src/renderer/assets/branding/app-icon.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  expect(source.data[3]).toBe(0)
  for (const size of [16, 24, 32, 48, 64, 96, 128, 256, 512]) {
    const meta = await sharp(
      resolve(`buildAssets/generated-icons/linux/${size}x${size}.png`)
    ).metadata()
    expect([meta.width, meta.height]).toEqual([size, size])
  }
  const png = await sharp(resolve('buildAssets/generated-icons/1024x1024.png')).metadata()
  expect([png.width, png.height]).toEqual([1024, 1024])
  expect(readFileSync(resolve('src/public/images/default.jpg'))).toEqual(
    readFileSync(resolve('src/renderer/assets/images/default.jpg'))
  )
})
