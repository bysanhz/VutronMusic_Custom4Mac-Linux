/**
 * A bounded, on-demand sample of Electron process working sets.
 *
 * This is diagnostic-only: a positive delta does not by itself establish a
 * memory leak (Chromium may retain reusable caches). No process paths, URLs,
 * file contents or personal information are recorded.
 */
import type { RuntimeMemorySample } from '../../types/runtimeMemory'

export type ProcessWorkingSet = { pid: number; workingSetMiB: number }

/** No /proc traversal, resource dumps, debugger attachment or process URLs in the result. */
export const summarizeRuntimeMemory = (
  processes: readonly { pid: number; memory: { workingSetSize?: number; privateBytes?: number } }[],
  mainPid: number,
  desktopLyricsPids: ReadonlySet<number>,
  platform: string,
  sampledAt = Date.now()
): RuntimeMemorySample => {
  const toMiB = (value: number | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value / 1024 : null
  const sum = (items: typeof processes): number | null => {
    const values = items.map((item) => toMiB(item.memory.workingSetSize))
    return values.length && values.every((value) => value !== null)
      ? values.reduce<number>((total, value) => total + value!, 0)
      : null
  }
  const main = processes.find((item) => item.pid === mainPid)
  const lyrics = processes.filter((item) => desktopLyricsPids.has(item.pid))
  return {
    sampledAt,
    platform,
    mainPid,
    mainWorkingSetMiB: toMiB(main?.memory.workingSetSize),
    mainPrivateMiB: platform === 'win32' ? toMiB(main?.memory.privateBytes) : null,
    desktopLyricsCount: lyrics.length,
    desktopLyricsWorkingSetMiB: sum(lyrics),
    appWorkingSetMiB: sum(processes),
    processCount: processes.length
  }
}

export type MemoryDelta = {
  deltaMiB: number | null
  previousSampleAgeSeconds: number | null
}

export class MemoryTrendSampler {
  private previous = new Map<number, { at: number; workingSetMiB: number }>()

  sample(
    processes: readonly ProcessWorkingSet[],
    sampledAt = Date.now()
  ): Map<number, MemoryDelta> {
    const next = new Map<number, { at: number; workingSetMiB: number }>()
    const result = new Map<number, MemoryDelta>()

    for (const process of processes) {
      if (
        !Number.isInteger(process.pid) ||
        process.pid <= 0 ||
        !Number.isFinite(process.workingSetMiB) ||
        process.workingSetMiB < 0
      )
        continue
      const previous = this.previous.get(process.pid)
      const elapsed = previous ? Math.max(0, (sampledAt - previous.at) / 1000) : null
      result.set(process.pid, {
        deltaMiB: previous
          ? Number((process.workingSetMiB - previous.workingSetMiB).toFixed(2))
          : null,
        previousSampleAgeSeconds: elapsed === null ? null : Math.round(elapsed)
      })
      next.set(process.pid, { at: sampledAt, workingSetMiB: process.workingSetMiB })
    }

    // Replace the entire map, so exited processes can never accumulate here.
    this.previous = next
    return result
  }
}
