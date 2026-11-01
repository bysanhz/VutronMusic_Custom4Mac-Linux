import { expect, test, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import Vue from '@vitejs/plugin-vue'
import { buildSync } from 'esbuild'

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
    plugins: [Vue()],
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
    globalThis.fixture = {requests:[], audioRequests:[], modes:{}, delays:{}, offline:false, activeStreams:0, cancelledStreams:0}
    app.whenReady().then(()=>{
      protocol.handle('atom', async request=>{
        const u = new URL(request.url), f=globalThis.fixture
        if(u.host==='local-asset') {
          const id=Number(u.searchParams.get('id')); f.requests.push(id)
          await new Promise(r=>setTimeout(r,f.delays[id]||0))
          return new Response(JSON.stringify({id,name:'Fixture '+id,type:'online',source:'netease',
            url:f.modes[id]==='unavailable'?'':'http://audio.test/'+id+'.wav?v='+f.requests.length,
            dt:20000,duration:20000,ar:[{name:'Fixture artist'}],al:{id:1,name:'Fixture album',picUrl:''}}),
            {headers:{'content-type':'application/json'}})
        }
        return serveAudioProxy(request,async(url,options)=>{
          const id=Number(new URL(url).pathname.split('/')[1].split('.')[0]);f.audioRequests.push(id)
          if(f.offline) throw Object.assign(new Error('fixture offline'),{code:'ENETUNREACH'})
          const mode=f.modes[id]
          if(mode==='stall-once' && f.requests.filter(x=>x===id).length===1) return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(wav.subarray(0,44+44100*2*3)))}}),{headers:{'content-type':'audio/wav','content-length':String(wav.length)}})
          if(mode==='gzip') {const compressed=gzipSync(wav);return new Response(new Uint8Array(compressed),{headers:{'content-type':'audio/wav','content-encoding':'gzip','content-length':String(compressed.length)}})}
          if(mode==='empty') return new Response(new ReadableStream({start(){f.activeStreams++},cancel(){f.activeStreams--;f.cancelledStreams++}}),{headers:{'content-type':'audio/mpeg'}})
          if(mode==='403') return new Response('denied',{status:403})
          if(mode==='unsupported'){const bad=Buffer.from(wav);bad.writeUInt16LE(65535,20);return new Response(new Uint8Array(bad),{headers:{'content-type':'audio/wav'}})}
          if(mode==='invalid-container')return new Response('this is not audio',{headers:{'content-type':'audio/mpeg'}})
          const range=options.headers.get('range')
          const start=Number(range?.match(/bytes=(\\d+)-/)?.[1]||0)
          return new Response(new Uint8Array(wav.subarray(start)),{status:range?206:200,headers:{
            'content-type':'audio/wav','accept-ranges':'bytes','content-length':String(wav.length-start),
            ...(range?{'content-range':'bytes '+start+'-'+(wav.length-1)+'/'+wav.length}:{})}})
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
  for (let i = 0; i < 100; i++) {
    await play([1 + (i % 2)])
    await expect.poll(trackId).toBe(1 + (i % 2))
    if (i % 25 === 0) samples.push(await cdp.send('Runtime.getHeapUsage'))
  }
  for (let i = 0; i < 30; i++) {
    await setMode(3, 'unsupported')
    await play([3])
    await expect
      .poll(() => page.evaluate(() => (window as any).vutronmusic.media.lastEvent))
      .toBe('failure-limit-stop')
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
  samples.push(await cdp.send('Runtime.getHeapUsage'))
  await testInfo.attach('memory-samples', {
    body: JSON.stringify(samples),
    contentType: 'application/json'
  })
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
    if (p.playing) await p.playOrPause()
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
