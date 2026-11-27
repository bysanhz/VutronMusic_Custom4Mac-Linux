import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('keeps one settings diagnostics action group in Maintenance', () => {
  const settings = readSource('src/renderer/views/SystemSettings.vue')
  const releaseNotes = readSource('src/renderer/components/LatestVersion.vue')
  const panel = readSource('src/renderer/components/UpdateDiagnostics.vue')
  const diagnostics = readSource('src/renderer/utils/diagnosticsSnapshotSettings.ts')
  expect(settings.indexOf('<UpdateDiagnostics')).toBeGreaterThan(settings.indexOf('key="update"'))
  expect(releaseNotes).not.toContain('copyDiagnostics')
  expect(panel).toContain('await copyDiagnosticsSnapshot(')
  expect(panel).toContain('await createDiagnosticsSnapshot(')
  expect(diagnostics).not.toContain('observeV327SettingsControl')
})

test('the remaining entries share a fresh and localized diagnostics snapshot', () => {
  const source = readSource('src/renderer/utils/diagnosticsSnapshotSettings.ts')
  expect(source).toContain("window.mainApi?.invoke('get-runtime-diagnostics')")
  expect(source).toContain('collectRendererDiagnostics()')
  expect(source).toContain('export const copyDiagnosticsSnapshot = async')
  expect(source).toContain('await createDiagnosticsSnapshot(additionalRendererDiagnostics)')
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
  expect(source).not.toContain('lastError: entry.lastError')
})
