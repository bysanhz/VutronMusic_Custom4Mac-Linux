import { test, expect, _electron } from '@playwright/test'
import { build } from 'esbuild'
import { createServer } from 'vite'
import Vue from '@vitejs/plugin-vue'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const channels = [
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

test('real contextBridge cancellation releases only player callbacks and preserves the settings resume listener', async ({}, testInfo) => {
  const directory = mkdtempSync(join(tmpdir(), 'vutron-ipc-release-'))
  const server = await createServer({
    configFile: false,
    cacheDir: join(directory, 'cache'),
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
    server: {
      host: '127.0.0.1',
      port: 0,
      watch: null,
      fs: { allow: [resolve('.'), resolve(process.env.VUTRON_PLAYER_SOURCE_ROOT || '.')] }
    }
  })
  server.middlewares.use('/netease', (_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ code: 200, data: [], lrc: { lyric: '' } }))
  })
  let app: Awaited<ReturnType<typeof _electron.launch>> | undefined
  try {
    await server.listen()
    const preload = join(directory, 'preload.cjs')
    await build({
      entryPoints: [resolve(process.env.VUTRON_PRELOAD_SOURCE_ROOT || '.', 'src/preload/index.ts')],
      outfile: preload,
      bundle: true,
      platform: 'node',
      external: ['electron']
    })
    appendFileSync(
      preload,
      `\nrequire('electron').contextBridge.exposeInMainWorld('ipcListenerProbe',{counts:()=>Object.fromEntries(${JSON.stringify(channels)}.map(c=>[c,require('electron').ipcRenderer.listenerCount(c)]))});`
    )
    const bootstrap = join(directory, 'main.cjs')
    writeFileSync(
      bootstrap,
      `
      const {app,BrowserWindow,ipcMain}=require('electron');
      app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});
      ipcMain.handle('getLocalMusic',()=>({songs:[],playlists:[]}));
      ipcMain.handle('get-lastfm-session',()=>({name:''}));
      ipcMain.handle('systemPing',()=>({navidrome:'logout',emby:'logout',jellyfin:'logout'}));
      ipcMain.handle('get-listen-ledger-backup',()=>null);
      ipcMain.handle('msgRequestGetVersion',()=> '4.0.0-beta.1');
      ipcMain.handle('get-cache-path',()=> ${JSON.stringify(join(directory, 'cache'))});
      ipcMain.handle('clearCacheTracks',()=> true);
      app.whenReady().then(()=>new BrowserWindow({show:true,webPreferences:{sandbox:true,contextIsolation:true,preload:${JSON.stringify(preload)}}}).loadURL(${JSON.stringify(server.resolvedUrls!.local[0])}));
    `
    )
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    app = await _electron.launch({ args: [bootstrap, '--no-sandbox'], env })
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForFunction(
      () =>
        !!(window as any).ipcListenerProbe &&
        (window as any).vutronmusic?.media.contextState === 'suspended'
    )
    const before = await page.evaluate(() => (window as any).ipcListenerProbe.counts())
    await page.evaluate(() => (window as any).playbackProbe.unmount())
    const after = await page.evaluate(() => (window as any).ipcListenerProbe.counts())
    await testInfo.attach('real-preload-callbacks', {
      body: JSON.stringify({ before, after }),
      contentType: 'application/json'
    })
    expect(before.resume).toBe(2)
    expect(after.resume).toBe(1)
    for (const channel of channels.filter((c) => c !== 'resume')) {
      expect(before[channel]).toBe(1)
      expect(after[channel]).toBe(0)
    }
    expect(errors).toEqual([])
  } finally {
    await app?.close()
    await server.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

for (const variant of ['index', 'osdWin']) {
  test(`${variant} preload disposers survive 100 cycles and preserve an unrelated listener`, async ({}, testInfo) => {
    const directory = mkdtempSync(join(tmpdir(), 'vutron-bridge-cancel-'))
    let app: Awaited<ReturnType<typeof _electron.launch>> | undefined
    const channel = variant === 'index' ? 'resume' : 'update-osd-playing-status'
    try {
      const preload = join(directory, 'preload.cjs')
      await build({
        entryPoints: [
          resolve(process.env.VUTRON_PRELOAD_SOURCE_ROOT || '.', `src/preload/${variant}.ts`)
        ],
        outfile: preload,
        bundle: true,
        platform: 'node',
        external: ['electron']
      })
      appendFileSync(
        preload,
        `\nrequire('electron').contextBridge.exposeInMainWorld('ipcListenerProbe',{count:()=>require('electron').ipcRenderer.listenerCount(${JSON.stringify(channel)})});`
      )
      const bootstrap = join(directory, 'main.cjs')
      writeFileSync(
        bootstrap,
        `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});app.whenReady().then(()=>new BrowserWindow({show:true,webPreferences:{sandbox:true,contextIsolation:true,preload:${JSON.stringify(preload)}}}).loadURL('data:text/html,<body>bridge lifecycle</body>'));`
      )
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      app = await _electron.launch({ args: [bootstrap, '--no-sandbox'], env })
      const page = await app.firstWindow()
      await page.waitForFunction(() => !!(window as any).ipcListenerProbe)
      const result = await page.evaluate((channel) => {
        const api = (window as any).mainApi
        const foreign = api.on(channel, () => {})
        ;(window as any).bridgeWeakRefs = []
        let supported = typeof foreign === 'function'
        for (let i = 0; i < 100; i++) {
          const handler = () => {}
          ;(window as any).bridgeWeakRefs.push(new WeakRef(handler))
          const cancel = api.on(channel, handler)
          if (typeof cancel === 'function') {
            cancel()
            cancel()
          } else {
            supported = false
            api.off(channel, handler)
          }
        }
        const withForeign = (window as any).ipcListenerProbe.count()
        if (typeof foreign === 'function') foreign()
        return { supported, withForeign, after: (window as any).ipcListenerProbe.count() }
      }, channel)
      await testInfo.attach('bridge-cycle-counts', {
        body: JSON.stringify(result),
        contentType: 'application/json'
      })
      expect(result).toEqual({ supported: true, withForeign: 1, after: 0 })
      if (process.env.VUTRON_RETAINER_AUDIT === '1') {
        const cdp = await page.context().newCDPSession(page)
        // Intrusive reachability check only; never use its memory values as a passive benchmark.
        await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
        const alive = await page.evaluate(
          () =>
            (window as any).bridgeWeakRefs.filter((ref: WeakRef<Function>) => ref.deref()).length
        )
        await testInfo.attach('bridge-weak-references', {
          body: JSON.stringify({ allocated: 100, aliveAfterSnapshot: alive, intrusive: true }),
          contentType: 'application/json'
        })
        expect(alive).toBe(0)
        await cdp.detach()
      }
    } finally {
      await app?.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
}
