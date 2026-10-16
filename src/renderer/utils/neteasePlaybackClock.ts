/**
 * Real-time playback accumulator for NetEase listening records.
 *
 * Usage: start(mediaPosition, performanceNow, playbackRate) when audio starts;
 * sample(mediaPosition, performanceNow, epochNow) on timeupdate / stop;
 * suspend() on pauses, buffering, seeking, and track changes.
 *
 * Inputs: media position in seconds, monotonic clock in milliseconds, wall
 * timestamp in milliseconds, and HTMLMediaElement playbackRate.
 * Returns: real seconds listened with an epoch-time span, or null when audio
 * has not advanced. Never uses media progress as the credited duration.
 */
export type NeteasePlaybackSlice = {
  startedAt: number
  endedAt: number
  seconds: number
  continuous: boolean
}

type PlaybackAnchor = {
  mediaSeconds: number
  monotonicMs: number
  rate: number
}

export const createNeteasePlaybackClock = () => {
  let anchor: PlaybackAnchor | null = null
  let hasContinuousProgress = false

  const suspend = (): void => {
    anchor = null
    hasContinuousProgress = false
  }

  const start = (mediaSeconds: number, monotonicMs: number, rate: number): void => {
    if (
      !Number.isFinite(mediaSeconds) ||
      !Number.isFinite(monotonicMs) ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      suspend()
      return
    }
    anchor = { mediaSeconds, monotonicMs, rate }
    hasContinuousProgress = false
  }

  const isRunning = (): boolean => anchor !== null

  const sample = (
    mediaSeconds: number,
    monotonicMs: number,
    epochMs: number
  ): NeteasePlaybackSlice | null => {
    const previous = anchor
    if (!previous) return null
    if (
      !Number.isFinite(mediaSeconds) ||
      !Number.isFinite(monotonicMs) ||
      !Number.isFinite(epochMs)
    ) {
      suspend()
      return null
    }

    // A read always consumes the preceding interval, including a stalled one.
    anchor = { ...previous, mediaSeconds, monotonicMs }
    const wallSeconds = (monotonicMs - previous.monotonicMs) / 1000
    const progressedSeconds = mediaSeconds - previous.mediaSeconds
    if (wallSeconds <= 0 || progressedSeconds <= 0) {
      hasContinuousProgress = false
      return null
    }

    // Playback may jump after a seek, source switch, or delayed media event.
    // A genuine rate-adjusted interval must fit the monotonic elapsed time.
    const largestPlausibleAdvance = previous.rate * (wallSeconds * 1.5 + 0.5)
    if (progressedSeconds > largestPlausibleAdvance) {
      hasContinuousProgress = false
      return null
    }

    // Limit the credit by BOTH physical elapsed time and advancing audio.
    // At 2x, 2s media progress in 1s wall time credits 1s; at 0.5x,
    // 0.5s media progress in 1s wall time likewise credits 1s.
    const seconds = Math.min(wallSeconds, progressedSeconds / previous.rate)
    if (!Number.isFinite(seconds) || seconds <= 0) {
      hasContinuousProgress = false
      return null
    }

    const continuous = hasContinuousProgress
    hasContinuousProgress = true
    return {
      startedAt: epochMs - seconds * 1000,
      endedAt: epochMs,
      seconds,
      continuous
    }
  }

  return { start, suspend, sample, isRunning }
}
