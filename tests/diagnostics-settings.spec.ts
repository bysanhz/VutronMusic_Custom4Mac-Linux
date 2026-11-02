import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('keeps the settings diagnostics action only in Software Update', () => {
  const settings = readSource('src/renderer/views/SystemSettings.vue')
  const diagnostics = readSource('src/renderer/utils/diagnosticsSnapshotSettings.ts')

  expect(settings).toContain('id="vutronmusic-update-diagnostics-anchor"')
  expect(settings.indexOf('vutronmusic-update-diagnostics-anchor')).toBeGreaterThan(
    settings.indexOf('key="update"')
  )
  expect(diagnostics).not.toContain('vutronmusic-diagnostics-snapshot-setting')
  expect(diagnostics).not.toContain('generalAnchor')
  expect(diagnostics).not.toContain('.settings-container .item:last-of-type')
  expect(diagnostics).toContain(
    "const UPDATE_CONTROL_ID = 'vutronmusic-update-diagnostics-setting'"
  )
  expect(diagnostics).toContain('mountControl(UPDATE_CONTROL_ID, updateAnchor)')
  expect(diagnostics).toContain("anchor.insertAdjacentElement('afterend', item)")
})

test('the remaining entries share a fresh and localized diagnostics snapshot', () => {
  const source = readSource('src/renderer/utils/diagnosticsSnapshotSettings.ts')
  expect(source).toContain('const text = TEXTS[resolveFeatureLanguage()]')
  expect(source).toContain("window.mainApi?.invoke('get-runtime-diagnostics')")
  expect(source).toContain('collectRendererDiagnostics()')
  expect(source).toContain('export const copyDiagnosticsSnapshot = async')
  expect(source).toContain('await copyDiagnosticsSnapshot()')
  expect(source).toContain('navigator.clipboard.writeText(')
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
  expect(source).toContain("window.mainApi.on('listen-ledger-backup-status'")
  expect(source).toContain('lastBackupAcknowledgedAt')
  expect(source).toContain('receiptEvidenceEntries')
  expect(source).not.toContain("lastError: entry.lastError")
})
