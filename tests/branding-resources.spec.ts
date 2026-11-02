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
          if (id === '\0branding:auth') return 'export const isAccountLoggedIn=()=>false'
          if (id === '\0branding:api')
            return 'export const dailyRecommendTracks=async()=>({data:{dailySongs:[]}})'
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
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForFunction(() => Boolean((window as any).brandingProbe))
})
test.afterAll(async () => {
  await app?.close()
  await server?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

test('real components load the new SVG symbols, local fallback, rounded art and Inter font', async () => {
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
  await page.screenshot({ path: resolve('docs/design/prism-review-20261102/adopted-renderer.png') })
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
