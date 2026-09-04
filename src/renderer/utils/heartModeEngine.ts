import type { HeartModeProfile } from './heartModeProfile'

export const HEART_MODE_INITIAL_QUEUE_SIZE = 12
export const HEART_MODE_REFILL_THRESHOLD = 5
export const HEART_MODE_REFILL_COUNT = 8

export const getHeartModeRemainingQueueCount = (
  currentTrackIndex: number,
  queueLength: number
): number =>
  Math.max(
    0,
    Math.max(0, Math.round(queueLength)) -
      Math.max(0, Math.round(currentTrackIndex)) -
      1
  )

export const shouldReplenishHeartModeQueue = (
  currentTrackIndex: number,
  queueLength: number,
  threshold = HEART_MODE_REFILL_THRESHOLD
): boolean =>
  getHeartModeRemainingQueueCount(currentTrackIndex, queueLength) <
  Math.max(0, Math.round(threshold))

/**
 * 返回 rolling refill 应参考的既有队尾上下文。
 *
 * 只需保留 max(artistDistance, seedDistance) 首，因为更早的歌曲不可能再触发
 * 当前 spacing 约束。
 */
export const getHeartModeSpacingContext = (
  queueTrackIDs: Iterable<number>,
  profile: HeartModeProfile
): number[] => {
  const contextLength = Math.max(
    0,
    Math.round(
      Math.max(
        Number(profile.maxSameArtistDistance) || 0,
        Number(profile.maxSameSeedDistance) || 0
      )
    )
  )

  if (contextLength <= 0) return []
  return Array.from(queueTrackIDs).slice(-contextLength)
}
