import { test, expect, _electron } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLinuxAppProcessMemory } from '../src/main/linuxProcessMemory'

test('actual samplers have bounded attachment ownership under matched native-memory sampling', async ({}, testInfo) => {
  test.setTimeout(120000)
  const directory = mkdtempSync(join(tmpdir(), 'vutron-heap-sampling-'))
  const results: unknown[] = []
  try {
    for (const mode of ['baseline', 'fixed'])
      await build({
        entryPoints: [
          mode === 'fixed'
            ? 'src/main/utils/rendererHeapSampler.ts'
            : 'tests/fixtures/renderer-heap/baseline.ts'
        ],
        outfile: join(directory, `${mode}.cjs`),
        bundle: true,
        platform: 'node'
      })
    for (const [run, mode] of ['baseline', 'fixed', 'fixed', 'baseline'].entries()) {
      const bootstrap = join(directory, `bootstrap-${run}.cjs`)
      writeFileSync(
        bootstrap,
        `
        const {app,BrowserWindow}=require('electron');
        app.setPath('userData',${JSON.stringify(join(directory, 'profile'))}+'-'+process.pid);
        app.disableHardwareAcceleration();
        globalThis.sampler=require(${JSON.stringify(directory)}+'/'+${JSON.stringify(mode)}+'.cjs').readRendererHeapUsage;
        app.whenReady().then(()=>{
          const w=new BrowserWindow({show:true,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
          globalThis.audit={attaches:0,detaches:0};const d=w.webContents.debugger;
          const attach=d.attach.bind(d),detach=d.detach.bind(d);
          d.attach=(...args)=>{globalThis.audit.attaches++;return attach(...args)};
          d.detach=(...args)=>{globalThis.audit.detaches++;return detach(...args)};
          w.loadURL('data:text/html,<html><body>Heap sampler control</body></html>');
        });
      `
      )
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const app = await _electron.launch({ args: [bootstrap, '--no-sandbox'], env })
      try {
        const page = await app.firstWindow()
        await page.waitForLoadState('domcontentloaded')
        const cdp = await page.context().newCDPSession(page)
        const ids = await app.evaluate(({ BrowserWindow }) => ({
          browser: process.pid,
          renderer: BrowserWindow.getAllWindows()[0].webContents.getOSProcessId()
        }))
        const samples: unknown[] = []
        const sample = async (step: number) =>
          samples.push({
            step,
            heap: await cdp.send('Runtime.getHeapUsage'),
            memory:
              process.platform === 'linux'
                ? readLinuxAppProcessMemory(ids.browser, [ids.renderer])
                : null
          })
        await sample(0)
        for (let step = 100; step <= 500; step += 100) {
          const ok = await app.evaluate(async ({ BrowserWindow }) => {
            let ok = true
            for (let i = 0; i < 100; i++)
              ok =
                (await (globalThis as any).sampler(BrowserWindow.getAllWindows()[0].webContents))
                  .available && ok
            return ok
          })
          expect(ok).toBe(true)
          await sample(step)
        }
        const ownership = await app.evaluate(() => (globalThis as any).audit)
        expect(ownership.attaches).toBe(mode === 'fixed' ? 1 : 500)
        expect(ownership.detaches).toBe(mode === 'fixed' ? 0 : 500)
        results.push({ run, mode, ids, ownership, samples })
        await cdp.detach()
      } finally {
        await app.close()
      }
    }
    await testInfo.attach('native-sampler-comparison', {
      body: JSON.stringify(results),
      contentType: 'application/json'
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
