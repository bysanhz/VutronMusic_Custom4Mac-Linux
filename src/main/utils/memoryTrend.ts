/**
 * A bounded, on-demand sample of Electron process working sets.
 *
 * This is diagnostic-only: a positive delta does not by itself establish a
 * memory leak (Chromium may retain reusable caches). No process paths, URLs,
 * file contents or personal information are recorded.
 */
export type ProcessWorkingSet = { pid: number; workingSetMiB: number }

export type MemoryDelta = {
  deltaMiB: number | null
  previousSampleAgeSeconds: number | null
}

export class MemoryTrendSampler {
  private previous = new Map<number, { at: number; workingSetMiB: number }>()

  sample(processes: readonly ProcessWorkingSet[], sampledAt = Date.now()): Map<number, MemoryDelta> {
    const next = new Map<number, { at: number; workingSetMiB: number }>()
    const result = new Map<number, MemoryDelta>()

    for (const process of processes) {
      if (!Number.isInteger(process.pid) || process.pid <= 0 ||
          !Number.isFinite(process.workingSetMiB) || process.workingSetMiB < 0) continue
      const previous = this.previous.get(process.pid)
      const elapsed = previous ? Math.max(0, (sampledAt - previous.at) / 1000) : null
      result.set(process.pid, {
        deltaMiB: previous ? Number((process.workingSetMiB - previous.workingSetMiB).toFixed(2)) : null,
        previousSampleAgeSeconds: elapsed === null ? null : Math.round(elapsed)
      })
      next.set(process.pid, { at: sampledAt, workingSetMiB: process.workingSetMiB })
    }

    // Replace the entire map, so exited processes can never accumulate here.
    this.previous = next
    return result
  }
}
