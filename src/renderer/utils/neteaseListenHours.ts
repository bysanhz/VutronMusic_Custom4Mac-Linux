/**
 * Aggregate locally recorded NetEase listening intervals into 24 local-hour buckets.
 *
 * Usage: buildLocalListeningHours(entries, accountId, startMs, endMs).
 * Args: Ledger entries with wall-time start/end and credited real seconds; a
 *       matching account ID and inclusive-exclusive time window.
 * Returns: 24 credited-second totals. This is not the cloud's full history.
 */
export type ListeningInterval = {
  accountId: string
  startedAt: number
  endedAt: number
  seconds: number
}

export const buildLocalListeningHours = (
  entries: readonly ListeningInterval[],
  accountId: string,
  startMs: number,
  endMs: number
): number[] => {
  const hours = Array<number>(24).fill(0)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return hours
  for (const entry of entries) {
    if (entry.accountId !== accountId) continue
    const { startedAt, endedAt, seconds } = entry
    if (![startedAt, endedAt, seconds].every(Number.isFinite)) continue
    if (seconds <= 0 || endedAt <= startedAt) continue
    const begin = Math.max(startMs, startedAt)
    const end = Math.min(endMs, endedAt)
    if (end <= begin) continue
    const durationMs = endedAt - startedAt
    // Durations come from real playback time, not media position or track length.
    // Partial overlaps are proportionally allocated without double-counting.
    let cursor = begin
    while (cursor < end) {
      const next = new Date(cursor)
      next.setHours(next.getHours() + 1, 0, 0, 0)
      const stop = Math.min(end, next.getTime())
      if (stop <= cursor) break
      hours[new Date(cursor).getHours()] += seconds * (stop - cursor) / durationMs
      cursor = stop
    }
  }
  return hours
}
