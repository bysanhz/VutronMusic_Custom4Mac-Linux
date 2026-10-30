import { test, expect, _electron } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { buildSync } from 'esbuild'

/** Reproduce Chromium 351244335 using synthetic data only; never force collection. */
test('bounded ledger checkpoints avoid broadcasting the full archive to idle renderers', async ({}, testInfo) => {
  test.setTimeout(120000)
  const directory = mkdtempSync(join(tmpdir(), 'vutron-native-storage-'))
  const bundle = buildSync({
    entryPoints: ['src/renderer/utils/incrementalSnapshotStorage.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'Checkpoint',
    write: false
  }).outputFiles[0].text
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(`<html><body>Storage regression fixture<script>${bundle}</script></body></html>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as any).port}`
  const outcomes: any[] = []
  try {
    for (const mode of ['full', 'incremental']) {
      const bootstrap = join(directory, `${mode}.cjs`)
      writeFileSync(
        bootstrap,
        `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, mode))});app.whenReady().then(()=>{for(const role of ['writer','receiver']){const w=new BrowserWindow({show:true,webPreferences:{backgroundThrottling:false,sandbox:true}});w.loadURL(${JSON.stringify(url)}+'/'+role)}});`
      )
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const app = await _electron.launch({ args: [bootstrap, '--no-sandbox'], env })
      try {
        await app.firstWindow()
        await expect.poll(() => app.windows().length).toBe(2)
        const writer = app.windows().find((page) => page.url().endsWith('writer'))!
        const receiver = app.windows().find((page) => page.url().endsWith('receiver'))!
        await receiver.waitForLoadState('load')
        await receiver.evaluate(() => {
          ;(window as any).count = 0
          window.addEventListener('storage', (event) => {
            if (event.key) (window as any).count++
          })
        })
        const cdp = await receiver.context().newCDPSession(receiver)
        const pid = await app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().endsWith('receiver'))!
            .getOSProcessId()
        )
        const sample = async () => ({
          heap: await cdp.send('Runtime.getHeapUsage'),
          dom: await cdp.send('Memory.getDOMCounters'),
          process: await app.evaluate(
            ({ app }, pid) => app.getAppMetrics().find((metric) => metric.pid === pid)?.memory,
            pid
          ),
          proportionalMiB:
            process.platform === 'linux'
              ? Number(
                  readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8').match(/^Pss:\s+(\d+)/m)![1]
                ) / 1024
              : null
        })
        await writer.evaluate(() => {
          const state = {
            entries: Array.from({ length: 1000 }, (_, i) => ({
              id: String(i),
              seconds: 10,
              name: 'history '.repeat(100)
            })),
            remoteBaselines: { month: 100 }
          }
          ;(window as any).state = state
          ;(window as any).storage = new (window as any).Checkpoint.IncrementalSnapshotStorage(
            localStorage,
            'ledger'
          )
          ;(window as any).storage.write(state)
          state.entries.push({ id: 'current', seconds: 1, name: 'current' })
        })
        await receiver.waitForTimeout(100)
        const before = await sample()
        const bytes = await writer.evaluate(async (mode) => {
          const state = (window as any).state,
            storage = (window as any).storage
          const native = Storage.prototype.setItem
          let characters = 0
          Storage.prototype.setItem = function (key, value) {
            characters += value.length
            return native.call(this, key, value)
          }
          try {
            for (let i = 1; i <= 100; i++) {
              state.entries.at(-1).seconds = i
              if (mode === 'full') localStorage.setItem('ledger', JSON.stringify(state))
              else storage.write(state)
              await new Promise((resolve) => setTimeout(resolve, 15))
            }
          } finally {
            Storage.prototype.setItem = native
          }
          return characters
        }, mode)
        await receiver.waitForTimeout(300)
        outcomes.push({ mode, charactersWritten: bytes, before, after: await sample() })
      } finally {
        await app.close()
      }
    }
    expect(outcomes[1].charactersWritten).toBeLessThan(outcomes[0].charactersWritten / 100)
    const updated = outcomes[1]
    // Linux-only private memory evidence; allocator fluctuation is allowed, repeated archive copies are not.
    if (updated.after.proportionalMiB !== null)
      expect(updated.after.proportionalMiB - updated.before.proportionalMiB).toBeLessThan(40)
    await testInfo.attach('storage-native-memory', {
      body: JSON.stringify(outcomes, null, 2),
      contentType: 'application/json'
    })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})
