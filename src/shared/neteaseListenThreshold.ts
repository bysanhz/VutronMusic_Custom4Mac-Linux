/**
 * Configurable effective-listening threshold for VutronMusic.
 * This is a local reporting policy, NOT an official NetEase duration rule.
 * A zero threshold allows any positive playback time. With a positive
 * threshold, shorter tracks qualify after their whole duration.
 */
export const MIN_NETEASE_LISTEN_SECONDS = 15
export const MAX_NETEASE_LISTEN_SECONDS = 120
const STORAGE_KEY = 'vutronmusic-netease-listen-threshold-v1'

export const normalizeNeteaseListenThreshold = (value: unknown): number => {
  const seconds = Number(value)
  return Number.isInteger(seconds) && seconds >= 0 && seconds <= MAX_NETEASE_LISTEN_SECONDS
    ? seconds
    : MIN_NETEASE_LISTEN_SECONDS
}

export const getConfiguredNeteaseListenSeconds = (): number => {
  if (typeof localStorage === 'undefined') return MIN_NETEASE_LISTEN_SECONDS
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === null ? MIN_NETEASE_LISTEN_SECONDS : normalizeNeteaseListenThreshold(stored)
  } catch {
    return MIN_NETEASE_LISTEN_SECONDS
  }
}

export const setConfiguredNeteaseListenSeconds = (value: number): number => {
  const seconds = normalizeNeteaseListenThreshold(value)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(seconds))
  } catch {
    // Storage can be disabled; next read falls back to the default.
  }
  return seconds
}

export const getMinimumNeteaseListenSeconds = (total?: number): number => {
  const threshold = getConfiguredNeteaseListenSeconds()
  const duration = Number(total)
  if (threshold === 0 || !Number.isFinite(duration) || duration <= 0) return threshold
  return Math.min(threshold, Math.max(1, Math.floor(duration)))
}
