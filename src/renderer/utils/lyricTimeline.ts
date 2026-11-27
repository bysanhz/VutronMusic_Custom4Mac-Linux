type Timing = { start: number; end: number }

/** Timestamp-ordered lyrics: logarithmic lookup keeps long word-timed tracks inexpensive. */
export const findLyricIndex = (lyrics: Timing[], progress: number, offset = 0): number => {
  if (!lyrics.length || !Number.isFinite(progress)) return -1
  const target = progress + (Number(offset) || 0)
  const end = Number(lyrics.at(-1)?.end)
  if (Number.isFinite(end) && target > end) return lyrics.length
  let low = 0
  let high = lyrics.length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const start = Number(lyrics[mid].start)
    if (!Number.isFinite(start)) {
      // Malformed imported metadata is rare; preserve the existing tolerant behavior.
      result = -1
      for (let i = 0; i < lyrics.length; i++) {
        const value = Number(lyrics[i].start)
        if (!Number.isFinite(value)) continue
        if (value > target) break
        result = i
      }
      return result
    }
    if (start <= target) {
      result = mid
      low = mid + 1
    } else high = mid - 1
  }
  return result
}
