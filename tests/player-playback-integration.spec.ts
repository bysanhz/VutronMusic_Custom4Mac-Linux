import { expect, test, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import Vue from '@vitejs/plugin-vue'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
import { buildSync } from 'esbuild'
import { readLinuxAppProcessMemory } from '../src/main/linuxProcessMemory'

let server: ViteDevServer
let directory: string
let app: ElectronApplication
let page: Page
const errors: string[] = []

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'vutron-playback-'))
  server = await createServer({
    cacheDir: join(directory, 'vite-cache'),
    configFile: false,
    root: resolve('tests/fixtures/player-playback'),
    plugins: [
      Vue(),
      createSvgIconsPlugin({
        iconDirs: [resolve('src/renderer/assets/icons')],
        symbolId: 'icon-[dir]-[name]'
      })
    ],
    resolve: {
      alias: {
        '@': resolve('src'),
        'player-under-test': resolve(
          process.env.VUTRON_PLAYER_SOURCE_ROOT || '.',
          'src/renderer/store/player.ts'
        ),
        'settings-under-test': resolve(
          process.env.VUTRON_PLAYER_SOURCE_ROOT || '.',
          'src/renderer/store/settings.ts'
        )
      }
    },
    optimizeDeps: { entries: ['index.html'] },
    server: {
      watch: null,
      host: '127.0.0.1',
      port: 0,
      fs: { allow: [resolve('.'), resolve(process.env.VUTRON_PLAYER_SOURCE_ROOT || '.')] }
    }
  })
  server.middlewares.use('/netease', (_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ code: 200, data: [], lrc: { lyric: '' }, songs: [] }))
  })
  await server.listen()
  buildSync({
    entryPoints: ['src/main/utils/audioProxyResponse.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: join(directory, 'audio.cjs')
  })
  const bootstrap = join(directory, 'bootstrap.cjs')
  writeFileSync(
    bootstrap,
    `
    const {app, BrowserWindow, protocol} = require('electron')
    const {gzipSync}=require('node:zlib')
    const {serveAudioProxy, monitorAudioResponse} = require('./audio.cjs')
    app.setPath('userData', ${JSON.stringify(join(directory, 'profile'))}+'-'+process.pid)
    protocol.registerSchemesAsPrivileged([{scheme:'atom',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}])
    const wav = Buffer.alloc(44 + 44100 * 2 * 20)
    wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16)
    wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28)
    wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40)
    const wrongWav = Buffer.from(wav.subarray(0,44 + 44100 * 2 * 6))
    wrongWav.writeUInt32LE(wrongWav.length-8,4);wrongWav.writeUInt32LE(wrongWav.length-44,40)
    globalThis.fixture = {requests:[], rejectedSources:[], audioRequests:[], modes:{}, delays:{}, offline:false, activeStreams:0, cancelledStreams:0}
    app.whenReady().then(()=>{
      protocol.handle('atom', async request=>{
        const u = new URL(request.url), f=globalThis.fixture
        if(u.host==='local-asset') {
          const id=Number(u.searchParams.get('id')); f.requests.push(id)
          const rejectedSource=u.searchParams.get('rejectSource')||'';f.rejectedSources.push(rejectedSource)
          await new Promise(r=>setTimeout(r,f.delays[id]||0))
          const wrong=f.modes[id]==='mismatched-qq'&&!rejectedSource
          return new Response(JSON.stringify({id,name:'Fixture '+id,type:'online',source:wrong?'qq':rejectedSource?'pyncmd':'netease',
            audioQuality:{requested:'hires',actual:'lossless',format:'WAV',bitrate:705600},
            url:f.modes[id]==='unavailable'?'':'http://audio.test/'+id+(wrong?'-wrong':'')+'.wav?v='+f.requests.length,
            dt:20000,duration:20000,ar:[{name:'Fixture artist'}],al:{id:1,name:'Fixture album',picUrl:''}}),
            {headers:{'content-type':'application/json'}})
        }
        return serveAudioProxy(request,async(url,options)=>{
          const pathname=new URL(url).pathname
          const id=parseInt(pathname.split('/')[1],10);f.audioRequests.push(id)
          if(f.offline) throw Object.assign(new Error('fixture offline'),{code:'ENETUNREACH'})
          const mode=f.modes[id]
          if(mode==='stall-once' && f.requests.filter(x=>x===id).length===1) return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(wav.subarray(0,44+44100*2*3)))}}),{headers:{'content-type':'audio/wav','content-length':String(wav.length)}})
          if(mode==='gzip') {const compressed=gzipSync(wav);return new Response(new Uint8Array(compressed),{headers:{'content-type':'audio/wav','content-encoding':'gzip','content-length':String(compressed.length)}})}
          if(mode==='empty') return new Response(new ReadableStream({start(){f.activeStreams++},cancel(){f.activeStreams--;f.cancelledStreams++}}),{headers:{'content-type':'audio/mpeg'}})
          if(mode==='403') return new Response('denied',{status:403})
          if(mode==='unsupported'){const bad=Buffer.from(wav);bad.writeUInt16LE(65535,20);return new Response(new Uint8Array(bad),{headers:{'content-type':'audio/wav'}})}
          if(mode==='invalid-container')return new Response('this is not audio',{headers:{'content-type':'audio/mpeg'}})
          const media=pathname.includes('-wrong')?wrongWav:wav
          const range=options.headers.get('range')
          const start=Number(range?.match(/bytes=(\\d+)-/)?.[1]||0)
          return new Response(new Uint8Array(media.subarray(start)),{status:range?206:200,headers:{
            'content-type':'audio/wav','accept-ranges':'bytes','content-length':String(media.length-start),
            ...(range?{'content-range':'bytes '+start+'-'+(media.length-1)+'/'+media.length}:{})}})
        })
      })
      const win = new BrowserWindow({show:true,width:500,height:300,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}})
      win.loadURL(${JSON.stringify(server.resolvedUrls!.local[0])})
    })
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
  await page.waitForLoadState('domcontentloaded')
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic?.media?.contextState))
    .toBe('suspended')
})
test.afterEach(async () => {
  await app?.close()
})

const play = async (ids: number[]) =>
  page.evaluate(async (ids) => {
    const p = (window as any).playbackProbe.player
    await p.replacePlaylist('playlist', 0, ids)
  }, ids)
const trackId = () => page.evaluate(() => (window as any).playbackProbe.player.currentTrack?.id)
const playing = () => page.evaluate(() => (window as any).vutronmusic.playing)
const ownedPlayerChannels = [
  'resume',
  'play-from-osd',
  'play',
  'previous',
  'next',
  'repeat',
  'repeat-shuffle',
  'like',
  'fm-trash',
  'setPosition',
  'increaseVolume',
  'decreaseVolume'
]
const setMode = (id: number, mode: string) =>
  app.evaluate(
    (_, { id, mode }) => {
      ;(globalThis as any).fixture.modes[id] = mode
    },
    { id, mode }
  )

test('plays a real media element through Web Audio, survives rapid switches and ignores stale lookups', async () => {
  await play([1])
  await expect.poll(playing).toBe(true)
  expect(await page.title()).toBe('Fixture 1 · Fixture artist')
  expect(await page.evaluate(() => (window as any).playbackProbe.player.title)).toBe(
    'Fixture 1 · Fixture artist'
  )
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic.progress))
    .toBeGreaterThan(0.2)
  await app.evaluate(() => {
    ;(globalThis as any).fixture.delays[2] = 300
  })
  await play([2])
  await play([3])
  await expect.poll(trackId).toBe(3)
  await page.waitForTimeout(450)
  expect(await trackId()).toBe(3)
  expect(await playing()).toBe(true)
  expect(await page.evaluate(() => (window as any).playbackProbe.contextCount())).toBe(1)
  expect(errors).toEqual([])
})

test('playback details expose actual quality and source, explain substitutions and support keyboard dismissal', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 720))
  await play([1])
  await expect.poll(playing).toBe(true)
  const details = page.locator('.playback-details')
  await expect(details.locator('summary')).toContainText('Lossless')
  await expect(details.locator('summary')).toContainText('NetEase')
  await details.locator('summary').click()
  await expect(details.locator('.quality-note')).toContainText(
    'Requested Hi-Res; this track returned Lossless.'
  )
  await expect(details.locator('.audio-format')).toContainText('WAV')
  await expect(details.locator('.diagnosis-result')).toHaveText(
    'The most recent official source request succeeded.'
  )
  await details.locator(':scope > summary').press('Escape')
  await expect(details).not.toHaveAttribute('open', '')
  expect(errors).toEqual([])
})

test('the real player bar and settings remain usable at desktop widths in light and dark themes', async ({}, testInfo) => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900))
  await page.goto(page.url() + '?ui=1')
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic?.media?.contextState))
    .toBe('suspended')
  await play([1])
  await expect.poll(playing).toBe(true)
  const badge = page.locator('.playback-details > summary')
  await expect(badge).toContainText('Lossless')
  expect((await badge.boundingBox())!.width).toBeGreaterThan(70)
  await badge.click()
  await expect(page.locator('.quality-note')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('playback-details-light.png') })
  await page.evaluate(() => document.body.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: testInfo.outputPath('playback-details-dark.png') })
  await page.getByRole('button', { name: 'Open audio settings' }).click()
  await expect(page.locator('.settings-header')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('diagnostics')
  await page.getByRole('button', { name: 'Maintenance & updates', exact: true }).click()
  await expect(page.locator('.system-settings .playback-diagnostics')).toBeVisible()
  await expect(page.locator('.build-identity')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('not-a-setting')
  await expect(page.getByText('No matching setting')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 700))
  const box = await badge.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(900)
  const content = page.locator('.settings-content-scroll')
  const headerBefore = (await page.locator('.settings-header').boundingBox())!
  const directoryBefore = (await page.locator('.settings-workspace > aside').boundingBox())!
  await content.hover()
  await page.mouse.wheel(0, 420)
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  expect((await page.locator('.settings-header').boundingBox())!.y).toBeCloseTo(headerBefore.y, 0)
  expect((await page.locator('.settings-workspace > aside').boundingBox())!.y).toBeCloseTo(
    directoryBefore.y,
    0
  )
  expect(await page.locator('#main').evaluate((el) => el.scrollTop)).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('settings-diagnostics-compact.png') })
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('Output Device')
  await page.getByRole('searchbox', { name: 'Search settings' }).press('Enter')
  const matchBox = (await page.locator('.setting-search-match').boundingBox())!
  const contentBox = (await content.boundingBox())!
  expect(matchBox.y).toBeGreaterThanOrEqual(contentBox.y)
  expect(matchBox.y + matchBox.height).toBeLessThanOrEqual(contentBox.y + contentBox.height)
  expect((await page.locator('.settings-header').boundingBox())!.y).toBeCloseTo(headerBefore.y, 0)
  expect(errors).toEqual([])
})

test('avatar opens account insights, account actions stay available and scale explanations sit beside controls', async ({}, testInfo) => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 920))
  await page.goto(page.url() + '?ui=1')
  let hasMembership = true
  let membershipGate: Promise<void> | null = null
  await page.route('**/netease/vip/info?*', async (route) => {
    await membershipGate
    return route.fulfill({
      json: {
        code: 200,
        data: {
          associator: { expireTime: hasMembership ? Date.now() + 86400000 : 0 },
          musicPackage: { expireTime: 0 },
          redVipLevel: 6
        }
      }
    })
  })
  await page.waitForFunction(() => Boolean((window as any).playbackProbe))
  await page.evaluate(async () => {
    const probe = (window as any).playbackProbe
    probe.data.user = {
      userId: 42,
      nickname: '测试账号',
      vipType: 10,
      signature: '测试签名',
      avatarUrl:
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/%3E'
    }
    await probe.navigate('/settings')
  })
  await expect(page.locator('.settings-header')).toBeVisible()
  await expect(page.locator('.system-settings .user-info')).toHaveCount(0)
  await expect(page.locator('.account-menu-button')).toHaveCount(0)
  const avatar = page.locator('.account-button')
  await avatar.focus()
  await avatar.click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Logout', exact: true })).toBeFocused()
  const menuBox = (await menu.boundingBox())!
  expect(menuBox.x).toBeGreaterThan(800)
  expect(menuBox.y).toBeGreaterThan(20)
  await page.keyboard.press('Escape')
  await expect(avatar).toBeFocused()
  await expect(avatar).toHaveAttribute('aria-expanded', 'false')
  await avatar.click({ button: 'right' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem')).toHaveCount(3)
  await avatar.click({ button: 'right' })
  await expect(menu).toBeVisible()
  await avatar.click()
  await expect(menu).toBeHidden()
  await expect(page.locator('.hero-nickname')).toHaveText('测试账号')
  await expect(page.locator('.membership-badge')).toContainText('Vinyl VIP')
  await expect(page.locator('.membership-badge')).toContainText('Lv.6')
  const account = page.locator('.hero-account')
  const image = (await account.locator('.hero-avatar').boundingBox())!
  const refresh = (await account.locator('.refresh-button').boundingBox())!
  expect(Math.abs(refresh.y + refresh.height / 2 - image.y - image.height / 2)).toBeLessThan(2)
  await expect(account.locator('.refresh-button')).toHaveAttribute('aria-label', 'Refresh')
  await expect(account.locator('.refresh-icon')).toBeVisible()
  await expect(account.locator('.refresh-button')).toBeEnabled()
  await page.evaluate(() => document.documentElement.setAttribute('data-accent-theme', 'rainbow'))
  for (const width of [1300, 900]) {
    await app.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 920),
      width
    )
    expect(
      await page.locator('.hero').evaluate((el) => el.scrollWidth - el.clientWidth)
    ).toBeLessThanOrEqual(1)
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => document.body.setAttribute('data-theme', theme), theme)
      await page.screenshot({
        path: testInfo.outputPath(`insights-account-${width}-${theme}.png`),
        animations: 'disabled'
      })
    }
  }
  await page.evaluate(() => document.documentElement.removeAttribute('data-accent-theme'))
  hasMembership = false
  let releaseMembership!: () => void
  membershipGate = new Promise<void>((resolve) => {
    releaseMembership = resolve
  })
  await account.locator('.refresh-button').click()
  await expect(account.locator('.refresh-button')).toBeDisabled()
  await expect(account.locator('.refresh-button')).toHaveAttribute('aria-busy', 'true')
  await expect(account.locator('.refresh-button')).toHaveAccessibleName(/Refreshing/)
  releaseMembership()
  membershipGate = null
  await expect(page.locator('.membership-badge')).toHaveText('Standard account')
  await expect(account.locator('.refresh-button')).toBeEnabled()
  // Loading failure is distinct from an ordinary account, even with cached vipType=10.
  await page.route('**/netease/vip/info?*', (route) => route.fulfill({ json: { code: 500 } }))
  await account.locator('.refresh-button').click()
  await expect(page.locator('.membership-badge')).toHaveText('Membership unavailable')
  await page.evaluate(() => (window as any).playbackProbe.navigate('/settings'))
  await expect(page.locator('.settings-header')).toBeVisible()
  await page.evaluate(() => (window as any).playbackProbe.mountScaleSettings())
  const scale = page.locator('.window-scale-font-range-item')
  await expect(scale).toBeVisible()
  await expect(scale.locator('[data-window-scale-reset="main"]')).toBeVisible()
  for (const width of [1300, 900]) {
    await app.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 920),
      width
    )
    await scale.scrollIntoViewIfNeeded()
    const left = (await scale.locator(':scope > .left').boundingBox())!
    const right = (await scale.locator(':scope > .right').boundingBox())!
    expect(left.x + left.width).toBeLessThanOrEqual(right.x)
    expect(Math.abs(left.y - right.y)).toBeLessThan(2)
    expect(await scale.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => document.body.setAttribute('data-theme', theme), theme)
      await page.screenshot({
        path: testInfo.outputPath(`scale-side-by-side-${width}-${theme}.png`)
      })
    }
  }
  await page.evaluate(() => {
    ;(window as any).playbackProbe.data.user.userId = null
  })
  await avatar.click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Logout', exact: true })).toHaveCount(0)
  await expect(menu).toContainText('Login')
  expect(errors).toEqual([])
})

test('settings search opens nested controls and alternative sources keep advanced preferences', async ({}, testInfo) => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900))
  await page.goto(page.url() + '?ui=1')
  await play([1])
  await page.locator('.playback-details > summary').click()
  await page.getByRole('button', { name: 'Open audio settings' }).click()
  const search = page.getByRole('searchbox', { name: 'Search settings' })
  const categories = page.locator('.settings-workspace > aside')
  await expect(categories.getByRole('button')).toHaveCount(8)
  await expect(page.locator('.quick-settings')).toHaveCount(0)
  await expect(page.locator('[data-settings-page="music"] .lyric-tab')).toHaveCount(0)
  await expect(page.locator('[data-settings-page="library"] #autoCacheTrack')).toHaveCount(1)
  await expect(page.locator('[data-settings-page="misc"] #stream')).toHaveCount(1)
  await expect(page.locator('[data-settings-page="lyric"] #click-to-lyric-page')).toHaveCount(1)
  await expect(
    page.locator('[data-settings-page="update"] #vutronmusic-settings-backup-setting')
  ).toHaveCount(1)
  await expect(page.locator('#vutronmusic-settings-backup-setting')).toHaveCount(1)
  await expect(page.locator('.build-identity')).toHaveCount(1)
  await categories.getByRole('button', { name: 'Maintenance & updates', exact: true }).click()
  await expect(page.locator('.diagnostic-panel__actions')).toHaveCount(1)
  await expect(page.locator('#vutronmusic-update-diagnostics-setting')).toHaveCount(0)
  await categories.getByRole('button', { name: 'Alternative sources', exact: true }).click()
  await expect(page.locator('.settings-explainer')).toBeVisible()
  const advanced = page.locator('.settings-advanced')
  await expect(advanced).not.toHaveAttribute('open', '')
  await search.fill('JOOX')
  await search.press('Enter')
  await expect(advanced).toHaveAttribute('open', '')
  await expect(advanced.locator('input[placeholder^="wmid"]')).toHaveAttribute('type', 'password')
  await expect(page.locator('.setting-search-match')).toContainText('JOOX')
  await search.fill('Output Device')
  await search.press('Enter')
  await expect(page.locator('[data-settings-page="music"]')).toBeVisible()
  await expect(page.locator('.setting-search-match')).toContainText('Output Device')
  await categories.getByRole('button', { name: 'Alternative sources', exact: true }).click()
  await page.locator('label[for="unblock-netease"]').click()
  await expect(page.locator('#unblock-netease')).not.toBeChecked()
  await expect(page.locator('#unblock-flac')).toBeDisabled()
  await expect(advanced.locator('textarea')).toBeDisabled()
  await expect(advanced.locator('.custom-select')).toHaveAttribute('aria-disabled', 'true')
  const before = await page.evaluate(() => ({
    ...(window as any).playbackProbe.settings.unblockNeteaseMusic
  }))
  await advanced.locator('.custom-select').dispatchEvent('click')
  await expect(advanced.locator('.custom-dropdown')).toHaveCount(0)
  await page.locator('label[for="unblock-netease"]').click()
  await expect(page.locator('#unblock-flac')).toBeEnabled()
  const after = await page.evaluate(() => ({
    ...(window as any).playbackProbe.settings.unblockNeteaseMusic
  }))
  expect(after).toEqual({ ...before, enable: true })
  const sourceOrder = advanced.locator('.custom-select')
  await sourceOrder.focus()
  await sourceOrder.press('Enter')
  await expect(advanced.locator('.custom-dropdown')).toBeVisible()
  await sourceOrder.press('ArrowUp')
  await sourceOrder.press('Enter')
  await expect(advanced.locator('.custom-dropdown')).toHaveCount(0)
  expect(
    await page.evaluate(() => (window as any).playbackProbe.settings.unblockNeteaseMusic.orderFirst)
  ).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('source-settings-expanded.png') })
  expect(errors).toEqual([])
})

test('rainbow settings use readable category accents across themes and desktop widths', async ({}, testInfo) => {
  await page.goto(page.url() + '?ui=1')
  await play([1])
  await page.locator('.playback-details > summary').click()
  await page.getByRole('button', { name: 'Open audio settings' }).click()
  await page.evaluate(() => {
    for (const color of (window as any).playbackProbe.settings.theme.colors) {
      color.selected = color.name === 'rainbow'
    }
  })
  await expect(page.locator('html')).toHaveAttribute('data-accent-theme', 'rainbow')
  const categories = page.locator('.settings-workspace > aside')
  const labels = [
    'Appearance & window',
    'Playback & quality',
    'Lyrics & desktop',
    'Library & cache',
    'Alternative sources',
    'Shortcuts',
    'Connections & services',
    'Maintenance & updates'
  ]
  for (const mode of ['light', 'dark']) {
    await page.evaluate((mode) => document.body.setAttribute('data-theme', mode), mode)
    for (const width of [1400, 900]) {
      await app.evaluate(
        ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 900),
        width
      )
      for (const label of labels) {
        const button = categories.getByRole('button', { name: label, exact: true })
        await button.click()
        await expect(button).toHaveAttribute('aria-current', 'page')
        await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        expect(
          await button.evaluate((element) => ({
            dot: getComputedStyle(element, '::before').content,
            barWidth: getComputedStyle(element, '::after').width,
            barHeight: getComputedStyle(element, '::after').height
          }))
        ).toEqual({ dot: 'none', barWidth: '4px', barHeight: '16px' })
        await expect(page.locator('.settings-section-heading > h2')).toHaveText(label)
        const colors = await button.evaluate((element) => {
          const root = document.querySelector('.system-settings')!
          return {
            text: getComputedStyle(element).color,
            accent: getComputedStyle(root).getPropertyValue('--color-primary').trim(),
            body: getComputedStyle(document.body).getPropertyValue('--color-body-bg').trim()
          }
        })
        // Compare resolved colors rather than the textual CSS variable representations.
        const contrast = await page.evaluate(({ text, body }) => {
          const luminance = (color: string) => {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')!
            ctx.fillStyle = color
            ctx.fillRect(0, 0, 1, 1)
            const channels = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
              const s = v / 255
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
            })
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          }
          const a = luminance(text),
            b = luminance(body)
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        }, colors)
        expect(contrast).toBeGreaterThanOrEqual(4.5)
        expect(
          await button.evaluate((element, accent) => {
            const probe = document.createElement('span')
            probe.style.color = accent
            element.append(probe)
            const match = getComputedStyle(probe).color === getComputedStyle(element).color
            probe.remove()
            return match
          }, colors.accent)
        ).toBe(true)
        const heading = (await page.locator('.settings-section-heading').boundingBox())!
        const directory = (await categories.boundingBox())!
        expect(directory.x + directory.width).toBeLessThan(heading.x)
        expect(
          await categories.locator('.slideBar').evaluate((el) => getComputedStyle(el).flexDirection)
        ).toBe('column')
        expect(heading.x).toBeGreaterThanOrEqual(0)
        expect(heading.x + heading.width).toBeLessThanOrEqual(width)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true)
      }
      await categories.getByRole('button', { name: 'Alternative sources', exact: true }).click()
      await page.screenshot({ path: testInfo.outputPath(`source-settings-${mode}-${width}.png`) })
    }
    await page.locator('.playback-details > summary').click()
    await expect(page.locator('.playback-popover')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`rainbow-playback-${mode}.png`) })
    await page.locator('.playback-details > summary').press('Escape')
  }
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('Language')
  await page.getByRole('searchbox', { name: 'Search settings' }).press('Enter')
  await page.locator('.setting-search-match .custom-select').click()
  await page
    .locator('.custom-dropdown .custom-select-item')
    .getByText('简体中文', { exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('data-accent-theme', 'rainbow')
  await categories.getByRole('button', { name: '备用音源', exact: true }).click()
  for (const mode of ['light', 'dark']) {
    await page.evaluate((mode) => document.body.setAttribute('data-theme', mode), mode)
    await page.screenshot({
      path: testInfo.outputPath(`source-settings-zh-${mode}.png`),
      animations: 'disabled'
    })
  }
  expect(errors).toEqual([])
})

test('appearance settings do not enumerate devices until audio settings are opened', async ({}, testInfo) => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 700))
  await page.goto(page.url() + '?ui=1')
  const navigate = (path: string) =>
    page.evaluate((path) => (window as any).playbackProbe.navigate(path), path)
  await navigate('/settings')
  await expect(page.locator('[data-settings-page="general"]')).toBeVisible()
  expect(await page.evaluate(() => (window as any).playbackProbe.outputDeviceEnumerations())).toBe(
    0
  )
  const sampleDevices = () =>
    app.evaluate(({ app }) =>
      app.getAppMetrics().map((p) => ({
        type: p.type,
        name: p.name || p.serviceName,
        workingSetMiB: p.memory.workingSetSize / 1024
      }))
    )
  const beforeDevices = await sampleDevices()
  await page.getByRole('button', { name: 'Playback & quality', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).playbackProbe.outputDeviceEnumerationsCompleted())
    )
    .toBe(1)
  const afterDevices = await sampleDevices()
  writeFileSync(
    testInfo.outputPath('device-processes.json'),
    JSON.stringify({ before: beforeDevices, after: afterDevices }, null, 2)
  )
  await page.getByRole('button', { name: 'Appearance & window', exact: true }).click()
  expect(await page.evaluate(() => (window as any).playbackProbe.outputDeviceEnumerations())).toBe(
    1
  )
  expect(errors).toEqual([])
})

test('cached HomePage cannot restart its banner after navigation or a late request', async () => {
  await page.goto(page.url() + '?ui=1')
  await page.evaluate(() => {
    const intervals = new Set<number>()
    const nativeSet = window.setInterval.bind(window)
    const nativeClear = window.clearInterval.bind(window)
    ;(window as any).bannerIntervals = intervals
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
      const id = nativeSet(handler, timeout, ...args)
      if (timeout === 8000) intervals.add(id)
      return id
    }) as typeof window.setInterval
    window.clearInterval = (id?: number) => {
      if (id !== undefined) intervals.delete(id)
      nativeClear(id)
    }
  })
  let requests = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/netease/banner?*', async (route) => {
    requests++
    if (requests === 1) await pending
    await route.fulfill({
      json: {
        code: 200,
        banners: [
          {
            id: 1,
            typeTitle: 'Fixture',
            imageUrl:
              'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
          }
        ]
      }
    })
  })
  const navigate = (path: string) =>
    page.evaluate((path) => (window as any).playbackProbe.navigate(path), path)
  const intervalCount = () => page.evaluate(() => (window as any).bannerIntervals.size)
  await navigate('/home')
  await expect.poll(() => requests).toBe(1)
  await navigate('/settings')
  const lateBanner = page.waitForResponse((response) => response.url().includes('/netease/banner?'))
  release()
  await (await lateBanner).finished()
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
  await expect(page.locator('.system-settings')).toBeVisible()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(await intervalCount()).toBe(0)
  await navigate('/home')
  await expect(page.locator('.home-page')).toBeVisible()
  await expect.poll(intervalCount).toBe(1)
  await navigate('/settings')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(await intervalCount()).toBe(0)
  expect(errors).toEqual([])
})

test('resume preserves playback intent and position while a paused session stays paused', async () => {
  await play([1])
  await expect.poll(playing).toBe(true)
  await page.evaluate(() => {
    ;(window as any).playbackProbe.player.seek = 5
  })
  await page.evaluate(() => (window as any).playbackProbe.handlers.resume())
  await expect.poll(playing).toBe(true)
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic.progress))
    .toBeGreaterThanOrEqual(5)
  await page.evaluate(() => (window as any).playbackProbe.player.playOrPause())
  await expect.poll(playing).toBe(false)
  await page.evaluate(() => (window as any).playbackProbe.handlers.resume())
  await expect.poll(() => app.evaluate(() => (globalThis as any).fixture.requests.length)).toBe(3)
  expect(await playing()).toBe(false)
})

test('explicit negative recommendation feedback affects only the current branch and leaves the profile and queue intact', async () => {
  const result = await page.evaluate(() => {
    const p = (window as any).playbackProbe
    const { heartProfile: hp, heartSession: hs } = p
    hp.setHeartModeCustomAlgorithmEnabled(true)
    const before = JSON.stringify(hp.heartModeProfile.value)
    hs.createHeartModeSession({
      profile: hp.heartModeProfile.value,
      seedIds: [10, 20],
      playlistId: 1,
      sourceSeedByTrackID: { '1': 10, '2': 20 },
      enqueuedTrackIDs: [1, 2],
      pendingTrackIDs: [3]
    })
    for (let i = 0; i < 20; i++) hs.reduceHeartModeCurrentBranch(1)
    const state = hs.getCurrentHeartModeSession()
    return {
      score: state.branchStates['10'].branchScore,
      other: state.branchStates['20'].branchScore,
      profileUnchanged: before === JSON.stringify(hp.heartModeProfile.value),
      queue: state.enqueuedTrackIDs,
      feedback: state.explicitFeedback.at(-1).type
    }
  })
  expect(result.score).toBeGreaterThanOrEqual(-1)
  expect(result.score).toBeLessThan(-0.9)
  expect(result.other).toBe(0)
  expect(result.profileUnchanged).toBe(true)
  expect(result.queue).toEqual([1, 2])
  expect(result.feedback).toBe('less-like-this')
})

test('rejecting a wrong-duration source during resume preserves the saved position', async () => {
  await play([1])
  await expect.poll(playing).toBe(true)
  await page.evaluate(() => {
    ;(window as any).playbackProbe.player.seek = 5
  })
  await setMode(1, 'mismatched-qq')
  await page.evaluate(() => (window as any).playbackProbe.handlers.resume())
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).fixture.rejectedSources))
    .toEqual(['', '', 'qq'])
  await expect.poll(playing).toBe(true)
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic.progress))
    .toBeGreaterThanOrEqual(5)
  expect(errors).toEqual([])
})

test('rejects a wrong-duration QQ file before playback and retries without QQ', async () => {
  await setMode(1, 'mismatched-qq')
  await play([1])
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).fixture.rejectedSources))
    .toEqual(['', 'qq'])
  await expect.poll(playing).toBe(true)
  expect(await app.evaluate(() => (globalThis as any).fixture.requests)).toEqual([1, 1])
  expect(await page.evaluate(() => (window as any).playbackProbe.player.currentTrack.source)).toBe(
    'pyncmd'
  )
  const events = await page.evaluate(() => (window as any).vutronmusic.media.recentEvents)
  expect(
    events.some((entry: { event: string }) =>
      entry.event.startsWith('identity-rejected:duration:20.00:6.00:qq')
    )
  ).toBe(true)
  expect(errors).toEqual([])
})

test('one media failure has one URL refresh; an unavailable repeat queue stops finitely', async () => {
  await setMode(2, 'unsupported')
  await page.evaluate(() => {
    ;(window as any).playbackProbe.player.repeatMode = 'on'
  })
  await play([2])
  await expect
    .poll(() =>
      app.evaluate(
        () => (globalThis as any).fixture.requests.filter((id: number) => id === 2).length
      )
    )
    .toBe(2)
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic.media.lastEvent))
    .toBe('failure-limit-stop')
  await page.waitForTimeout(200)
  expect(await app.evaluate(() => (globalThis as any).fixture.requests)).toEqual([2, 2])
  expect(await playing()).toBe(false)
  expect(
    await page.evaluate(() => (window as any).playbackProbe.audioElements[0].getAttribute('src'))
  ).toBeNull()
  expect(
    await page.evaluate(() => localStorage.getItem('vutronmusic-netease-listen-ledger-v1'))
  ).toBeNull()
})

test('a switch during recovery cannot overwrite the new track or increment its failure budget', async () => {
  await setMode(2, '403')
  await play([2])
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).fixture.requests.length))
    .toBeGreaterThanOrEqual(1)
  await app.evaluate(() => {
    ;(globalThis as any).fixture.delays[2] = 350
  })
  await play([1])
  await expect.poll(trackId).toBe(1)
  await expect.poll(playing).toBe(true)
  await page.waitForTimeout(500)
  expect(await trackId()).toBe(1)
  expect(await playing()).toBe(true)
  expect(await page.evaluate(() => (window as any).vutronmusic.media.sourceRetryCount)).toBe(0)
})

test('network failure stops and explicit retry after reconnection plays without counting failed time', async () => {
  await app.evaluate(() => {
    ;(globalThis as any).fixture.offline = true
  })
  await play([1])
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic.media.lastEvent))
    .toBe('failure-limit-stop')
  expect(await page.evaluate(() => (window as any).vutronmusic.progress)).toBe(0)
  await app.evaluate(() => {
    ;(globalThis as any).fixture.offline = false
  })
  await page.evaluate(() => {
    ;(window as any).playbackProbe.player.playOrPause()
  })
  await expect.poll(playing).toBe(true)
  expect(errors).toEqual([])
})

test('100 switches and 30 failures keep one context and release source, listeners and context at unmount', async ({}, testInfo) => {
  test.setTimeout(120000)
  const cdp = await page.context().newCDPSession(page)
  const samples: unknown[] = []
  const sample = async (phase: string) => {
    const [heap, dom, processes] = await Promise.all([
      cdp.send('Runtime.getHeapUsage'),
      cdp.send('Memory.getDOMCounters'),
      app.evaluate(({ app, BrowserWindow }) => ({
        browserPid: process.pid,
        rendererPid: BrowserWindow.getAllWindows()[0].webContents.getOSProcessId(),
        metrics: app
          .getAppMetrics()
          .map((entry) => ({ pid: entry.pid, type: entry.type, memory: entry.memory }))
      }))
    ])
    samples.push({
      phase,
      heap,
      dom,
      processes,
      linux:
        process.platform === 'linux'
          ? readLinuxAppProcessMemory(
              processes.browserPid,
              processes.metrics.map((entry) => entry.pid)
            )
          : null
    })
  }
  await sample('baseline')
  for (let i = 0; i < 100; i++) {
    await play([1 + (i % 2)])
    await expect.poll(trackId).toBe(1 + (i % 2))
    if ((i + 1) % 25 === 0) await sample(`switches-${i + 1}`)
  }
  for (let i = 0; i < 30; i++) {
    await setMode(3, 'unsupported')
    await play([3])
    await expect
      .poll(() => page.evaluate(() => (window as any).vutronmusic.media.lastEvent))
      .toBe('failure-limit-stop')
    if ((i + 1) % 10 === 0) await sample(`failures-${i + 1}`)
  }
  expect(await page.evaluate(() => (window as any).playbackProbe.audioElements.length)).toBe(1)
  expect(await page.evaluate(() => (window as any).playbackProbe.contextCount())).toBe(1)
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: 'window.playbackProbe.audioElements[0]'
  })
  const listeners = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
  expect(listeners.listeners.filter((l: any) => l.type === 'loadedmetadata')).toHaveLength(0)
  await page.evaluate(() => {
    ;(window as any).playbackProbe.unmount()
  })
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic.media.contextState))
    .toBe('unavailable')
  const after = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
  expect(after.listeners).toHaveLength(0)
  expect(
    await page.evaluate(() => (window as any).playbackProbe.audioElements[0].getAttribute('src'))
  ).toBeNull()
  await sample('unmounted')
  // Deliberate idle observation, not a synchronization delay or forced GC.
  await new Promise((resolve) => setTimeout(resolve, 15000))
  await sample('unmounted-idle-15s')
  await testInfo.attach('memory-samples', {
    body: JSON.stringify(samples),
    contentType: 'application/json'
  })
  await cdp.send('Runtime.releaseObject', { objectId: result.objectId })
  await cdp.detach()
  expect(errors).toEqual([])
})

test('unmount unregisters global messages, all IPC callbacks, asynchronous watches and MediaSession actions', async ({}, testInfo) => {
  const result = await page.evaluate(async (ownedChannels) => {
    const p = (window as any).playbackProbe
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
    p.osd.show = true
    await tick()
    p.osdMessages.length = 0
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'get-seek' } }))
    const ownedIpcCount = () =>
      ownedChannels.reduce(
        (sum: number, channel: string) =>
          sum +
          (p.subscriptions.get(channel)?.size || 0) -
          (p.initialSubscriptions.get(channel) || 0),
        0
      )
    const before = {
      messages: p.osdMessages.length,
      ipc: ownedIpcCount(),
      mediaActions: p.mediaActions.size
    }
    p.unmount()
    await tick()
    p.osdMessages.length = 0
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'get-seek' } }))
    p.player.currentIndex = 20
    await tick()
    return {
      before,
      after: {
        messages: p.osdMessages.length,
        ipc: ownedIpcCount(),
        mediaActions: p.mediaActions.size
      },
      metadataCleared: navigator.mediaSession.metadata === null
    }
  }, ownedPlayerChannels)
  await testInfo.attach('player-lifecycle', {
    body: JSON.stringify(result),
    contentType: 'application/json'
  })
  expect(result.before).toEqual({ messages: 1, ipc: 12, mediaActions: 8 })
  expect(result.after).toEqual({ messages: 0, ipc: 0, mediaActions: 0 })
  expect(result.metadataCleared).toBe(true)
  expect(errors).toEqual([])
})

test('unmount during asynchronous initialization cannot install late audio resources or global handlers', async ({}, testInfo) => {
  await page.addInitScript(() => {
    ;(window as any).startupGate = new Promise((resolve) => {
      ;(window as any).releaseStartup = resolve
    })
  })
  await page.reload()
  await page.waitForFunction(() => Boolean((window as any).playbackProbe))
  await page.evaluate(() => {
    ;(window as any).playbackProbe.unmount()
    ;(window as any).releaseStartup(null)
  })
  await page.waitForTimeout(100)
  const result = await page.evaluate((ownedChannels) => {
    const p = (window as any).playbackProbe
    return {
      contexts: p.contextCount(),
      ipc: ownedChannels.reduce(
        (sum: number, channel: string) =>
          sum +
          (p.subscriptions.get(channel)?.size || 0) -
          (p.initialSubscriptions.get(channel) || 0),
        0
      ),
      media: p.mediaActions.size
    }
  }, ownedPlayerChannels)
  await testInfo.attach('late-initialization', {
    body: JSON.stringify(result),
    contentType: 'application/json'
  })
  expect(result).toEqual({ contexts: 0, ipc: 0, media: 0 })
  expect(errors).toEqual([])
})

test('opt-in retainer audit separates completed XHR callbacks from live window listeners', async ({}, testInfo) => {
  test.skip(
    process.env.VUTRON_RETAINER_AUDIT !== '1',
    'Heap snapshots are intrusive diagnostic measurements'
  )
  test.setTimeout(120000)
  await page.addInitScript(() => {
    const NativeXHR = window.XMLHttpRequest
    const refs: WeakRef<XMLHttpRequest>[] = []
    ;(window as any).xhrAudit = refs
    window.XMLHttpRequest = class extends NativeXHR {
      constructor() {
        super()
        refs.push(new WeakRef(this))
      }
    }
  })
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic?.media?.contextState))
    .toBe('suspended')
  const cdp = await page.context().newCDPSession(page)
  const counts = () => cdp.send('Memory.getDOMCounters')
  const audit: unknown[] = []
  const snapshot = async (phase: string) => {
    const path = testInfo.outputPath(`${phase}.heapsnapshot`)
    writeFileSync(path, '')
    let size = 0
    const listener = ({ chunk }: { chunk: string }) => {
      size += Buffer.byteLength(chunk)
      if (size < 64 * 1024 * 1024) appendFileSync(path, chunk)
    }
    const before = await counts()
    cdp.on('HeapProfiler.addHeapSnapshotChunk', listener)
    try {
      await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
    } finally {
      cdp.off('HeapProfiler.addHeapSnapshotChunk', listener)
    }
    expect(size).toBeLessThan(64 * 1024 * 1024)
    const after = await counts()
    const xhr = await page.evaluate(() => {
      const alive = (window as any).xhrAudit
        .map((ref: WeakRef<XMLHttpRequest>) => ref.deref())
        .filter(Boolean) as XMLHttpRequest[]
      return {
        allocated: (window as any).xhrAudit.length,
        alive: alive.length,
        completed: alive.filter((xhr) => xhr.readyState === 4).length
      }
    })
    audit.push({ phase, path, before, after, xhr })
    writeFileSync(testInfo.outputPath('retainer-audit.json'), JSON.stringify(audit, null, 2))
  }
  await snapshot('baseline')
  for (let i = 0; i < 30; i++) {
    await play([1 + (i % 2)])
    await expect.poll(trackId).toBe(1 + (i % 2))
  }
  await snapshot('switched')
  await page.evaluate(() => (window as any).playbackProbe.unmount())
  await snapshot('unmounted')
  const win = await cdp.send('Runtime.evaluate', {
    expression: 'window',
    objectGroup: 'retainer-audit'
  })
  const listeners = await cdp.send('DOMDebugger.getEventListeners', {
    objectId: win.result.objectId!
  })
  writeFileSync(testInfo.outputPath('window-listeners.json'), JSON.stringify(listeners, null, 2))
  const owned = listeners.listeners.find(
    (listener: any) =>
      listener.type === 'message' && listener.handler?.description?.includes('init-from-osd')
  )
  if (owned?.handler?.objectId) {
    const identity = await cdp.send('HeapProfiler.getHeapObjectId', {
      objectId: owned.handler.objectId
    })
    writeFileSync(
      testInfo.outputPath('owned-message-handler.json'),
      JSON.stringify(
        { ...identity, scriptId: owned.scriptId, lineNumber: owned.lineNumber },
        null,
        2
      )
    )
  }
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'retainer-audit' })
  await cdp.detach()
  expect(errors).toEqual([])
})

test('repeated resume loads with no metadata retain only the current listener', async () => {
  await play([1])
  await expect.poll(playing).toBe(true)
  await page.evaluate(async () => {
    const p = (window as any).playbackProbe.player
    p.seek = 5
    await p.playOrPause()
  })
  await setMode(1, 'empty')
  const cdp = await page.context().newCDPSession(page)
  const counts: number[] = []
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: 'window.playbackProbe.audioElements[0]'
  })
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => (window as any).playbackProbe.handlers.resume())
    const info = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
    counts.push(info.listeners.filter((l: any) => l.type === 'loadedmetadata').length)
  }
  expect(Math.max(...counts)).toBeLessThanOrEqual(1)
  await page.evaluate(() => (window as any).playbackProbe.player.resetPlayer())
  const after = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
  expect(after.listeners.filter((l: any) => l.type === 'loadedmetadata')).toHaveLength(0)
  expect(
    await page.evaluate(() => (window as any).playbackProbe.audioElements[0].getAttribute('src'))
  ).toBeNull()
  await expect.poll(() => app.evaluate(() => (globalThis as any).fixture.activeStreams)).toBe(0)
})

test('pausing while a recovery lookup is pending preserves the user pause intent', async () => {
  await setMode(2, 'unsupported')
  await app.evaluate(() => {
    ;(globalThis as any).fixture.delays[2] = 200
  })
  await play([2])
  await expect.poll(() => app.evaluate(() => (globalThis as any).fixture.requests.length)).toBe(2)
  await setMode(2, 'healthy')
  await page.evaluate(async () => {
    const p = (window as any).playbackProbe.player
    await p.playOrPause()
  })
  await page.waitForTimeout(500)
  expect(await playing()).toBe(false)
  expect(await page.evaluate(() => (window as any).playbackProbe.audioElements[0].paused)).toBe(
    true
  )
})

test('a real buffering stall refreshes once and resumes the audible position', async () => {
  await setMode(1, 'stall-once')
  await play([1])
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic.progress))
    .toBeGreaterThan(0.1)
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).fixture.requests.length), { timeout: 22000 })
    .toBe(2)
  await expect.poll(playing).toBe(true)
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic.progress))
    .toBeGreaterThan(1)
  expect(await page.evaluate(() => (window as any).vutronmusic.media.stallCount)).toBe(1)
  expect(await app.evaluate(() => (globalThis as any).fixture.requests)).toEqual([1, 1])
})

test('a content-encoded upstream is not decoded twice by the protocol/media bridge', async () => {
  await setMode(1, 'gzip')
  await play([1])
  await expect.poll(playing).toBe(true)
  await expect
    .poll(() => page.evaluate(() => (window as any).vutronmusic.progress))
    .toBeGreaterThan(0.2)
})

test('derived lyric state remains live without rebroadcasting full word arrays through player persistence', async ({}, testInfo) => {
  const result = await page.evaluate(() => {
    const p = (window as any).playbackProbe.player
    p.lyrics = Array.from({ length: 500 }, (_, i) => ({
      start: i,
      end: i + 1,
      lyric: {
        text: 'fixture words '.repeat(30),
        info: Array.from({ length: 24 }, (_, w) => ({
          word: 'fixture',
          start: w * 100,
          end: w * 100 + 100
        }))
      }
    }))
    p.currentIndex = 12
    p.$persist()
    const raw = localStorage.getItem('player') || '{}',
      stored = JSON.parse(raw)
    return {
      characters: raw.length,
      hasLyrics: Object.hasOwn(stored, 'lyrics'),
      hasCurrentIndex: Object.hasOwn(stored, 'currentIndex'),
      liveLyrics: p.lyrics.length,
      liveIndex: p.currentIndex
    }
  })
  await testInfo.attach('player-persistence-size', {
    body: JSON.stringify(result),
    contentType: 'application/json'
  })
  expect(result.hasLyrics).toBe(false)
  expect(result.hasCurrentIndex).toBe(false)
  expect(result.characters).toBeLessThan(20000)
  expect(result.liveLyrics).toBe(500)
  expect(result.liveIndex).toBe(12)
})

test('a failed source refreshes once and automatic next still reaches a healthy song', async () => {
  await setMode(1, '403')
  await play([1, 2])
  await expect.poll(trackId).toBe(2)
  await expect.poll(playing).toBe(true)
  expect(await app.evaluate(() => (globalThis as any).fixture.requests)).toEqual([1, 1, 2])
})

test('a null source advances without opening an empty media URL', async () => {
  await setMode(1, 'unavailable')
  await play([1, 2])
  await expect.poll(trackId).toBe(2)
  await expect.poll(playing).toBe(true)
  expect(await app.evaluate(() => (globalThis as any).fixture.requests)).toEqual([1, 2])
  expect(await app.evaluate(() => (globalThis as any).fixture.audioRequests)).toEqual([2])
})

test('missing artwork stays empty during detail recovery and uses the default only after its finite budget', async () => {
  let lookups = 0
  await page.route('**/netease/song/detail?*', async (route) => {
    lookups++
    await route.fulfill({ json: { code: 200, songs: [] } })
  })
  await page.clock.install()
  await play([1])
  await expect.poll(trackId).toBe(1)
  await expect.poll(playing).toBe(true)
  await page.evaluate(() => (window as any).playbackProbe.player.playOrPause())
  expect(await page.evaluate(() => (window as any).playbackProbe.player.pic)).toBe('')
  for (const [index, delay] of [2000, 5000, 10000, 20000, 40000].entries()) {
    const response = page.waitForResponse((response) =>
      response.url().includes('/netease/song/detail?')
    )
    await page.clock.fastForward(delay + 100)
    await response
    await expect.poll(() => lookups).toBe(index + 1)
    if (index < 4) {
      expect(await page.evaluate(() => (window as any).playbackProbe.player.pic)).toBe('')
    }
  }
  await expect
    .poll(() => page.evaluate(() => (window as any).playbackProbe.player.pic))
    .toBe('atom://get-default-pic')
  await page.clock.fastForward(60000)
  expect(lookups).toBe(5)
  expect(errors).toEqual([])
})

test('an unavailable paused resume clears old bytes without advancing or starting the next song', async () => {
  await play([1, 2])
  await expect.poll(playing).toBe(true)
  await page.evaluate(() => (window as any).playbackProbe.player.playOrPause())
  await expect.poll(playing).toBe(false)
  await setMode(1, 'unavailable')
  await page.evaluate(() => (window as any).playbackProbe.handlers.resume())
  await expect.poll(() => app.evaluate(() => (globalThis as any).fixture.requests)).toEqual([1, 1])
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).playbackProbe.audioElements[0].getAttribute('src'))
    )
    .toBeNull()
  await expect.poll(trackId).toBe(1)
  expect(await playing()).toBe(false)
  expect(await page.evaluate(() => (window as any).playbackProbe.audioElements[0].paused)).toBe(
    true
  )
  expect(errors).toEqual([])
})
