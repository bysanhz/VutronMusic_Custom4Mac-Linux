/**
 * Persist small updates without broadcasting a full historical ledger on every checkpoint.
 * The base key remains an ordinary full snapshot. A bounded, revision-matched overlay
 * carries updates/removals until compaction. Each Storage.setItem is atomic; after
 * compaction a stale overlay is ignored, including a crash before its removal.
 */
type Snapshot = { entries: Array<{ id: string }>; [key: string]: unknown }
type StorageBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Overlay = {
  baseRevision: string
  entries: Snapshot['entries']
  removed: string[]
  metadata: Record<string, unknown>
}
const REVISION = '__checkpointRevision'

export class IncrementalSnapshotStorage<T extends Snapshot> {
  private hasBase = false
  private revision = ''
  private baseEntries = new Map<string, string>()
  private lastOverlay: string | null = null
  readonly overlayKey: string

  constructor(
    readonly backend: StorageBackend,
    readonly key: string,
    private readonly maxOverlayCharacters = 32 * 1024
  ) {
    this.overlayKey = `${key}:checkpoint-v1`
  }

  diagnostics() {
    return {
      baseEntries: this.baseEntries.size,
      overlayCharacters: this.lastOverlay?.length || 0,
      maxOverlayCharacters: this.maxOverlayCharacters
    }
  }

  read(): T | null {
    const raw = this.backend.getItem(this.key)
    if (!raw) {
      if (this.backend.getItem(this.overlayKey)) throw new Error('Snapshot checkpoint has no base')
      return null
    }
    const stored = JSON.parse(raw)
    if (stored?.entries === undefined) stored.entries = []
    if (!Array.isArray(stored?.entries)) throw new Error('Invalid snapshot entries')
    const revision = typeof stored[REVISION] === 'string' ? stored[REVISION] : ''
    delete stored[REVISION]
    this.installBase(stored, revision)
    this.lastOverlay = this.backend.getItem(this.overlayKey)
    if (!this.lastOverlay) return stored
    const overlay = JSON.parse(this.lastOverlay) as Overlay
    if (!revision || overlay.baseRevision !== revision) return stored
    if (
      !Array.isArray(overlay.entries) ||
      !Array.isArray(overlay.removed) ||
      !overlay.metadata ||
      typeof overlay.metadata !== 'object'
    ) {
      throw new Error('Invalid snapshot checkpoint')
    }
    const entries = new Map(stored.entries.map((entry: { id: string }) => [entry.id, entry]))
    for (const id of overlay.removed) entries.delete(id)
    for (const entry of overlay.entries) entries.set(entry.id, entry)
    return { ...stored, ...overlay.metadata, entries: [...entries.values()] }
  }

  write(snapshot: T): void {
    if (!this.hasBase || !this.revision) {
      this.compact(snapshot)
      return
    }
    const { entries, ...metadata } = snapshot
    const currentIds = new Set(entries.map((entry) => entry.id))
    const mergedOrder = [...this.baseEntries.keys()]
      .filter((id) => currentIds.has(id))
      .concat(entries.filter((entry) => !this.baseEntries.has(entry.id)).map((entry) => entry.id))
    // Compaction preserves unusual legacy duplicates and explicit reorderings verbatim.
    if (
      currentIds.size !== entries.length ||
      entries.some((entry, index) => entry.id !== mergedOrder[index])
    ) {
      this.compact(snapshot)
      return
    }
    const overlay: Overlay = {
      baseRevision: this.revision,
      entries: entries.filter((entry) => JSON.stringify(entry) !== this.baseEntries.get(entry.id)),
      removed: [...this.baseEntries.keys()].filter((id) => !currentIds.has(id)),
      metadata
    }
    const serialized = JSON.stringify(overlay)
    if (serialized.length > this.maxOverlayCharacters) {
      this.compact(snapshot)
      return
    }
    if (serialized === this.lastOverlay) return
    this.backend.setItem(this.overlayKey, serialized)
    // Do not acknowledge failed writes in memory: a later checkpoint must retry.
    this.lastOverlay = serialized
  }

  private compact(snapshot: T): void {
    const revision = crypto.randomUUID()
    const serialized = JSON.stringify({ ...snapshot, [REVISION]: revision })
    this.backend.setItem(this.key, serialized)
    this.installBase(JSON.parse(serialized), revision)
    this.lastOverlay = null
    // The new base is already durable. An old overlay's revision cannot match it.
    try {
      this.backend.removeItem(this.overlayKey)
    } catch {
      /* Safe to leave a stale overlay. */
    }
  }

  private installBase(snapshot: T, revision: string): void {
    this.hasBase = true
    this.revision = revision
    this.baseEntries = new Map(snapshot.entries.map((entry) => [entry.id, JSON.stringify(entry)]))
  }
}
