const MAX_SCROBBLE_AGE_MS = 30 * 24 * 60 * 60 * 1000

const timestampMillis = (value: unknown): number | undefined => {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
}

/** Give PLV and PLD real, ordered event times and integer playback seconds. */
export const normalizeNeteaseScrobbleTiming = (options: {
  playedSeconds: number
  totalSeconds?: number
  startedAt?: number
  endedAt?: number
  now?: number
}) => {
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now()
  const playedSeconds = Math.max(1, Math.round(options.playedSeconds))
  const totalSeconds = Math.max(1, Math.floor(Number(options.totalSeconds) || playedSeconds))
  const earliest = now - MAX_SCROBBLE_AGE_MS
  const requestedStart = timestampMillis(options.startedAt) ?? now - playedSeconds * 1000
  const startedAt = Math.min(now - 1000, Math.max(earliest, requestedStart))
  const requestedEnd = timestampMillis(options.endedAt) ?? startedAt + playedSeconds * 1000
  const endedAt = Math.min(now, Math.max(startedAt + 1000, requestedEnd))

  return {
    playedSeconds: Math.min(playedSeconds, totalSeconds),
    totalSeconds,
    startedAtSeconds: Math.floor(startedAt / 1000),
    endedAtSeconds: Math.floor(endedAt / 1000)
  }
}
