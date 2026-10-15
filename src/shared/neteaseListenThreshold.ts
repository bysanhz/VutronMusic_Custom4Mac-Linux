/**
 * VutronMusic's local minimum effective-listening threshold (not an official
 * NetEase server rule). Short tracks qualify after their actual full duration.
 * Keep the player, API and sync-status UI on one shared definition.
 */
export const MIN_NETEASE_LISTEN_SECONDS = 15

export const getMinimumNeteaseListenSeconds = (total?: number): number => {
  const duration = Number(total)
  if (!Number.isFinite(duration) || duration <= 0) return MIN_NETEASE_LISTEN_SECONDS
  return Math.min(MIN_NETEASE_LISTEN_SECONDS, Math.max(1, Math.floor(duration)))
}
