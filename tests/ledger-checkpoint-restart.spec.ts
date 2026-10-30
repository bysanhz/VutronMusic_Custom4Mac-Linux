import { expect, test } from '@playwright/test'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { resolve } from 'node:path'

const source = buildSync({
  entryPoints: ['src/renderer/utils/neteaseListenLedger.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vue'],
  write: false
}).outputFiles[0].text
const requireModule = createRequire(resolve('package.json'))
const KEY = 'vutronmusic-netease-listen-ledger-v3'
const makeStorage = () => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    }
  }
}
const boot = (localStorage: ReturnType<typeof makeStorage>) => {
  const module = { exports: {} as any }
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: requireModule,
    localStorage,
    crypto: globalThis.crypto,
    console
  })
  return module.exports
}

test('the actual ledger recovers current seconds and receipts from a browser checkpoint without IPC backup', () => {
  const storage = makeStorage()
  const first = boot(storage)
  const now = Date.now()
  const [entry] = first.recordNeteaseListenSegment({
    accountId: 'fixture',
    sessionId: 'session',
    startedAt: now - 10000,
    endedAt: now,
    seconds: 10,
    params: { id: 123, sourceid: 1, total: 240 }
  })
  first.recordNeteaseListenSegment({
    accountId: 'fixture',
    sessionId: 'session',
    startedAt: now,
    endedAt: now + 10000,
    seconds: 10,
    params: { id: 123, sourceid: 1, total: 240 }
  })
  first.markNeteaseListenEntryAccepted(entry.id)
  expect(storage.getItem(`${KEY}:checkpoint-v1`)).not.toBeNull()
  const reopened = boot(storage)
  expect(reopened.neteaseListenEntries.value).toHaveLength(1)
  expect(reopened.neteaseListenEntries.value[0]).toMatchObject({
    id: entry.id,
    seconds: 20,
    status: 'accepted'
  })
  expect(reopened.getNeteaseListenSyncDiagnostics('fixture').persistence.backupReady).toBe(false)
})

test('a malformed browser checkpoint is preserved and surfaced instead of overwriting unverified history', () => {
  const storage = makeStorage(),
    first = boot(storage),
    now = Date.now()
  first.recordNeteaseListenSegment({
    accountId: 'fixture',
    sessionId: 'session',
    startedAt: now - 10000,
    endedAt: now,
    seconds: 10,
    params: { id: 123, sourceid: 1, total: 240 }
  })
  const original = storage.getItem(KEY)
  storage.setItem(`${KEY}:checkpoint-v1`, 'malformed checkpoint')
  const reopened = boot(storage)
  expect(
    reopened.getNeteaseListenSyncDiagnostics('fixture').persistence.localStorageCorrupted
  ).toBe(true)
  reopened.flushNeteaseListenLedger(true)
  expect(storage.getItem(KEY)).toBe(original)
  expect(storage.getItem(`${KEY}:checkpoint-v1`)).toBe('malformed checkpoint')
})
