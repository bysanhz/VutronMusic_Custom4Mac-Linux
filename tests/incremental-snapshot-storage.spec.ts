import { expect, test } from '@playwright/test'
import { IncrementalSnapshotStorage } from '../src/renderer/utils/incrementalSnapshotStorage'

const backend = () => {
  const data = new Map<string, string>()
  const writes: Array<{ key: string; characters: number }> = []
  return {
    data,
    writes,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
      writes.push({ key, characters: value.length })
    },
    removeItem: (key: string) => {
      data.delete(key)
    }
  }
}
const historical = () => ({
  entries: Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    seconds: 10,
    status: 'accepted',
    name: 'historical '.repeat(60)
  })),
  remoteBaselines: { 'account:month': 120 }
})

test('migrates a legacy full ledger, then broadcasts only bounded current-entry updates', () => {
  const storage = backend(),
    initial = historical()
  storage.setItem('ledger', JSON.stringify(initial))
  const persistence = new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger')
  expect(persistence.read()).toEqual(initial)
  persistence.write(initial)
  storage.writes.length = 0
  const current = {
    ...initial,
    entries: [...initial.entries, { id: 'current', seconds: 1, status: 'pending', name: 'current' }]
  }
  for (let i = 1; i <= 100; i++) {
    current.entries.at(-1)!.seconds = i
    persistence.write(current)
  }
  expect(storage.writes).toHaveLength(100)
  expect(
    storage.writes.every((write) => write.key === persistence.overlayKey && write.characters < 1024)
  ).toBe(true)
  expect(new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger').read()).toEqual(current)
  persistence.write(current)
  expect(storage.writes).toHaveLength(100)
})

test('restores entry removals, metadata and current seconds without the main-process backup', () => {
  const storage = backend(),
    initial = historical()
  const persistence = new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger')
  persistence.write(initial)
  const changed = { entries: initial.entries.slice(1), remoteBaselines: { 'account:month': 150 } }
  changed.entries[0] = { ...changed.entries[0], seconds: 45 }
  persistence.write(changed)
  expect(new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger').read()).toEqual(changed)
})

test('a crash between compaction and overlay cleanup cannot resurrect old entries', () => {
  const storage = backend(),
    initial = historical()
  const persistence = new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger', 1024)
  persistence.write(initial)
  persistence.write({ ...initial, entries: initial.entries.slice(1) })
  const stale = storage.getItem(persistence.overlayKey)!
  storage.removeItem = () => {
    throw new Error('fixture crash before removal')
  }
  const changed = {
    ...initial,
    entries: [{ id: 'new', seconds: 30, status: 'pending', name: 'x'.repeat(3000) }]
  }
  persistence.write(changed)
  expect(storage.getItem(persistence.overlayKey)).toBe(stale)
  expect(new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger').read()).toEqual(changed)
})

test('quota failures keep the previous durable state and retry the exact pending change', () => {
  const storage = backend(),
    initial = historical()
  const persistence = new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger')
  persistence.write(initial)
  const changed = { ...initial, entries: initial.entries.slice(1) }
  const set = storage.setItem
  storage.setItem = () => {
    throw new Error('fixture quota')
  }
  expect(() => persistence.write(changed)).toThrow('fixture quota')
  expect(
    new IncrementalSnapshotStorage<typeof initial>({ ...storage, setItem: set }, 'ledger').read()
  ).toEqual(initial)
  storage.setItem = set
  persistence.write(changed)
  expect(new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger').read()).toEqual(changed)
})

test('corrupt checkpoints are reported instead of silently dropping unverified entries', () => {
  const storage = backend(),
    initial = historical()
  const persistence = new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger')
  persistence.write(initial)
  storage.setItem(persistence.overlayKey, 'not JSON')
  expect(() => new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger').read()).toThrow()
})

test('keeps explicit ordering and legacy duplicate IDs without silently discarding data', () => {
  const storage = backend(),
    initial = historical()
  const persistence = new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger')
  persistence.write(initial)
  const reordered = { ...initial, entries: [...initial.entries].reverse() }
  persistence.write(reordered)
  expect(new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger').read()).toEqual(
    reordered
  )
  const duplicates = {
    ...initial,
    entries: [...initial.entries, { ...initial.entries[0], seconds: 15 }]
  }
  persistence.write(duplicates)
  persistence.write(duplicates)
  expect(new IncrementalSnapshotStorage<typeof initial>(storage, 'ledger').read()).toEqual(
    duplicates
  )
})

test('orphaned checkpoints fail visibly instead of being overwritten by an empty ledger', () => {
  const storage = backend()
  storage.setItem('ledger:checkpoint-v1', '{}')
  expect(() => new IncrementalSnapshotStorage(storage, 'ledger').read()).toThrow('no base')
})
