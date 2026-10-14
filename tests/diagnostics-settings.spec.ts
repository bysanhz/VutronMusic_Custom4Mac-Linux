import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('shows the existing diagnostics action in both General and Software Update', () => {
  const settings = readSource('src/renderer/views/SystemSettings.vue')
  const diagnostics = readSource('src/renderer/utils/diagnosticsSnapshotSettings.ts')

  expect(settings).toContain('id="vutronmusic-update-diagnostics-anchor"')
  expect(settings.indexOf('vutronmusic-update-diagnostics-anchor')).toBeGreaterThan(
    settings.indexOf('key="update"')
  )
  expect(diagnostics).toContain("const CONTROL_ID = 'vutronmusic-diagnostics-snapshot-setting'")
  expect(diagnostics).toContain(
    "const UPDATE_CONTROL_ID = 'vutronmusic-update-diagnostics-setting'"
  )
  expect(diagnostics).toContain('mountControl(CONTROL_ID, generalAnchor')
  expect(diagnostics).toContain('mountControl(UPDATE_CONTROL_ID, updateAnchor)')
  expect(diagnostics).toContain("anchor.insertAdjacentElement('afterend', item)")
})

test('both actions share a fresh and localized diagnostics snapshot', () => {
  const source = readSource('src/renderer/utils/diagnosticsSnapshotSettings.ts')
  expect(source).toContain('const text = TEXTS[resolveFeatureLanguage()]')
  expect(source).toContain("window.mainApi?.invoke('get-runtime-diagnostics')")
  expect(source).toContain('collectRendererDiagnostics()')
  expect(source).toContain('navigator.clipboard.writeText(output)')
  expect(source).toContain('getNeteaseListenSyncDiagnostics(activeNeteaseListenAccountId.value)')
})

test('diagnoses the active upload route without exporting authentication details', () => {
  const diagnostics = readSource('src/renderer/utils/diagnosticsSnapshotSettings.ts')
  const server = readSource('src/main/appServer/netease.ts')

  expect(diagnostics).toContain("request({ url: '/runtime-info', method: 'get', timeout: 4000 })")
  expect(diagnostics).toContain('stableScrobbleV1Source')
  expect(diagnostics).toContain('getNeteaseScrobbleRuntimeDiagnostics()')
  expect(diagnostics).not.toContain('info.packageLoadError')
  expect(server).toContain("fastify.get('/netease/runtime-info'")
})

test('audio health logs retain full NetEase song IDs', () => {
  const ipcs = readSource('src/main/IPCs.ts')
  expect(ipcs).toContain('safeNumber(data.trackId, Number.MAX_SAFE_INTEGER)')
  expect(ipcs).not.toContain('trackId: Math.floor(safeNumber(data.trackId)),')
})

test('diagnostics report storage failures and transport receipts without credentials', () => {
  const source = readSource('src/renderer/utils/neteaseListenLedger.ts')
  expect(source).toContain('persistenceFailures')
  expect(source).toContain('backupRecoveryEntries')
  expect(source).toContain('receiptEvidenceEntries')
  expect(source).not.toContain("lastError: entry.lastError")
})
