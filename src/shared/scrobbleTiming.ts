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

/**
 * Convert verified media advancement into actual wall-clock listening seconds.
 *
 * HTMLMediaElement.currentTime advances in media seconds (e.g. 2 seconds per
 * real second at 2x). elapsedSeconds must come from a monotonic clock such as
 * performance.now(), not Date.now() or a timer's nominal interval.
 *
 * A forward seek is not listening; reject progress that exceeds what the
 * playback rate and observed wall time could plausibly produce. Calling code
 * must also reset its baselines on seek, pause, buffering and source changes.
 */
export const getVerifiedListeningSeconds = (options: {
  elapsedSeconds: number
  mediaSeconds: number
  playbackRate: number
}): number => {
  const { elapsedSeconds, mediaSeconds, playbackRate } = options
  if (
    !Number.isFinite(elapsedSeconds) ||
    !Number.isFinite(mediaSeconds) ||
    !Number.isFinite(playbackRate) ||
    elapsedSeconds <= 0 ||
    mediaSeconds <= 0 ||
    playbackRate <= 0
  ) {
    return 0
  }

  const maxMediaAdvance = elapsedSeconds * playbackRate + Math.max(0.25, playbackRate * 0.15)
  if (mediaSeconds > maxMediaAdvance) return 0

  // The smaller bound prevents speed-up inflation, stalled-stream accrual
  // and counting more time than was actually observed by the wall clock.
  return Math.min(elapsedSeconds, mediaSeconds / playbackRate)
}
