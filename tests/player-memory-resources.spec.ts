import { expect, test, _electron } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import Vue from '@vitejs/plugin-vue'
import { DeferredTaskScope } from '../src/renderer/utils/deferredTaskScope'
import { OwnedObjectUrls } from '../src/renderer/utils/ownedObjectUrls'

test('track changes and disposal cancel delayed work holding lyric components', async () => {
  const scope = new DeferredTaskScope()
  const calls: string[] = []
  const old = scope.restart()
  scope.schedule(old, () => calls.push('old track'), 10)
  const current = scope.restart()
  scope.schedule(current, () => calls.push('current track'), 10)
  scope.schedule(old, () => calls.push('stale async continuation'), 10)
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(calls).toEqual(['current track'])
  scope.schedule(current, () => calls.push('after unmount'), 10)
  scope.dispose()
  scope.schedule(scope.restart(), () => calls.push('restarted after unmount'), 10)
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(calls).toEqual(['current track'])
  expect(scope.isCurrent(current)).toBe(false)
})

test('releases replaced artwork once while retaining shared and remote URLs', () => {
  const original = URL.revokeObjectURL
  const revoked: string[] = []
  URL.revokeObjectURL = (url) => {
    revoked.push(url)
  }
  try {
    const urls = new OwnedObjectUrls()
    urls.replace(['blob:old', 'blob:shared', 'https://cover.example/image'])
    urls.replace(['blob:shared', 'blob:new', 'blob:new'])
    expect(revoked).toEqual(['blob:old'])
    urls.clear()
    urls.clear()
    expect(revoked).toEqual(['blob:old', 'blob:shared', 'blob:new'])
  } finally {
    URL.revokeObjectURL = original
  }
})

test('native lyric animations stay bounded through rebuilds, races, cleanup and unmount', async ({}, testInfo) => {
  test.setTimeout(120000)
  const projectRoot = resolve('.')
  const directory = mkdtempSync(join(tmpdir(), 'vutron-lyric-memory-'))
  const server = await createServer({
    configFile: false,
    root: resolve('tests/fixtures/lyric-memory'),
    plugins: [Vue()],
    resolve: { alias: { '@': resolve('src') } },
    optimizeDeps: { entries: ['index.html'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [projectRoot] } }
  })
  let app: Awaited<ReturnType<typeof _electron.launch>> | undefined
  const errors: string[] = []
  try {
    await server.listen()
    const url = server.resolvedUrls!.local[0]
    const bootstrap = join(directory, 'bootstrap.cjs')
    writeFileSync(
      bootstrap,
      `
      const { app, BrowserWindow } = require('electron')
      app.setPath('userData', ${JSON.stringify(join(directory, 'profile'))})
      app.whenReady().then(() => {
        const win = new BrowserWindow({ show: true, width: 400, height: 200,
          webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true } })
        win.loadURL(${JSON.stringify(url)})
      })
    `
    )
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    app = await _electron.launch({ args: [bootstrap, '--no-sandbox'], env })
    const page = await app.firstWindow()
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await expect
      .poll(() => page.evaluate(() => !!(window as any).memoryProbe?.line.value))
      .toBe(true)

    const result = await page.evaluate(async () => {
      const probe = (window as any).memoryProbe
      const cases: any[] = []
      for (const mini of [false, true]) {
        await probe.mount(mini)
        const line = probe.line.value
        const counts: number[] = []
        for (let i = 0; i < 300; i++) {
          await line.createAnimations()
          line.updatePlayStatus('pause')
          line.updateCurrentTime(100)
          if (i % 50 === 0) counts.push(document.getAnimations().length)
        }
        await Promise.all(Array.from({ length: 30 }, () => line.createAnimations()))
        line.updatePlayStatus('pause')
        line.updateCurrentTime(100)
        const afterConcurrent = document.getAnimations().length
        await line.createAnimations('translation')
        line.updatePlayStatus('pause')
        line.updateCurrentTime(100)
        const afterTranslation = document.getAnimations().length
        line.clearAnimation(false)
        const lyricOnly = document.getAnimations().length
        line.clearAnimation()
        const afterCleanup = document.getAnimations().length
        // Suspend frame delivery to exercise cleanup while a builder awaits a frame.
        const originalFrame = window.requestAnimationFrame
        const originalCancelFrame = window.cancelAnimationFrame
        let frameId = 0
        const frames = new Set<number>()
        window.requestAnimationFrame = () => {
          frames.add(++frameId)
          return frameId
        }
        window.cancelAnimationFrame = (id) => {
          frames.delete(id)
        }
        const pending = line.createAnimations()
        for (let i = 0; i < 5; i++) await Promise.resolve()
        const waitingFrames = frames.size
        line.clearAnimation()
        await pending
        const afterCancelledBuild = document.getAnimations().length
        const pendingUnmount = line.createAnimations()
        for (let i = 0; i < 5; i++) await Promise.resolve()
        probe.unmount()
        await pendingUnmount
        await line.createAnimations()
        window.requestAnimationFrame = originalFrame
        window.cancelAnimationFrame = originalCancelFrame
        cases.push({
          mini,
          counts,
          afterConcurrent,
          afterTranslation,
          lyricOnly,
          afterCleanup,
          afterCancelledBuild,
          waitingFrames,
          remainingFrames: frames.size,
          afterUnmount: document.getAnimations().length
        })
      }
      return cases
    })
    await testInfo.attach('native-animation-counts', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json'
    })
    for (const item of result) {
      const expected = item.mini ? 4 : 2
      expect(item.counts).toEqual(Array(6).fill(expected))
      expect(item.afterConcurrent).toBe(expected)
      expect(item.afterTranslation).toBe(expected)
      expect(item.lyricOnly).toBe(expected / 2)
      expect(item.afterCleanup).toBe(0)
      expect(item.afterCancelledBuild).toBe(0)
      expect(item.waitingFrames).toBe(1)
      expect(item.remainingFrames).toBe(0)
      expect(item.afterUnmount).toBe(0)
    }
    expect(errors).toEqual([])
  } finally {
    await app?.close()
    await server.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
