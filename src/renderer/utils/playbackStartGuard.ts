import { nextTick, watch, type WatchStopHandle } from 'vue'
import type { usePlayerStore } from '../store/player'

type PlayerStore = ReturnType<typeof usePlayerStore>
type TrackID = number | string | null | undefined

const HEART_MODE_PLAYLIST_TYPE = 'intelligence'
const POSITION_EPSILON_SECONDS = 0.25
const MAX_GUARD_DURATION_MS = 10_000
const PLAYING_RELEASE_DELAY_MS = 300

const normalizeTrackID = (value: TrackID): string | null => {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

/**
 * 保证从桌面歌词控件启动的心动模式种子歌曲从 0 秒开始播放。
 *
 * 心动模式通过 replacePlaylist('intelligence', ...) 替换队列。播放器同时加载音源
 * 和歌词；当歌词请求先完成且新音源尚未进入 playing 状态时，旧进度可能被写回
 * 新的种子歌曲。本保护仅在 intelligence 播放列表启动期间生效，不影响普通切歌、
 * 暂停续播、应用重启恢复和同一歌曲的 URL 刷新。
 */
export const initializeHeartModePlaybackStartGuard = (
  playerStore: PlayerStore
): (() => void) => {
  let guardedTrackID: string | null = null
  let resettingPosition = false
  let releaseTimer: number | null = null
  let maxGuardTimer: number | null = null
  const scheduledTimers = new Set<number>()
  const stopHandles: WatchStopHandle[] = []

  const clearTimer = (timer: number | null): void => {
    if (timer === null) return
    window.clearTimeout(timer)
    scheduledTimers.delete(timer)
  }

  const clearScheduledResets = (): void => {
    for (const timer of scheduledTimers) window.clearTimeout(timer)
    scheduledTimers.clear()
  }

  const releaseGuard = (): void => {
    guardedTrackID = null
    clearScheduledResets()
    clearTimer(releaseTimer)
    clearTimer(maxGuardTimer)
    releaseTimer = null
    maxGuardTimer = null
  }

  const isGuardedTrackCurrent = (): boolean => {
    return (
      guardedTrackID !== null &&
      normalizeTrackID(playerStore.currentTrack?.id) === guardedTrackID
    )
  }

  const resetToTrackStart = (): void => {
    if (!isGuardedTrackCurrent() || resettingPosition) return

    const position = Number(playerStore.seek)
    if (!Number.isFinite(position) || position <= POSITION_EPSILON_SECONDS) return

    resettingPosition = true
    try {
      playerStore.seek = 0
    } finally {
      queueMicrotask(() => {
        resettingPosition = false
      })
    }
  }

  const scheduleReset = (delayMs: number): void => {
    const timer = window.setTimeout(() => {
      scheduledTimers.delete(timer)
      resetToTrackStart()
    }, delayMs)
    scheduledTimers.add(timer)
  }

  const armGuard = (trackID: TrackID): void => {
    const normalizedTrackID = normalizeTrackID(trackID)
    if (!normalizedTrackID) return

    guardedTrackID = normalizedTrackID
    clearScheduledResets()
    clearTimer(releaseTimer)
    clearTimer(maxGuardTimer)
    releaseTimer = null

    resetToTrackStart()
    queueMicrotask(resetToTrackStart)
    void nextTick(resetToTrackStart)
    window.requestAnimationFrame(resetToTrackStart)
    ;[0, 50, 180, 500, 1200, 2500].forEach(scheduleReset)

    maxGuardTimer = window.setTimeout(() => {
      maxGuardTimer = null
      releaseGuard()
    }, MAX_GUARD_DURATION_MS)
  }

  stopHandles.push(
    watch(
      () => normalizeTrackID(playerStore.currentTrack?.id),
      () => {
        if (guardedTrackID) {
          resetToTrackStart()
          scheduleReset(0)
        }
      },
      { flush: 'sync' }
    )
  )

  stopHandles.push(
    watch(
      () => Number(playerStore.seek),
      (position) => {
        if (
          isGuardedTrackCurrent() &&
          !resettingPosition &&
          Number.isFinite(position) &&
          position > POSITION_EPSILON_SECONDS
        ) {
          resetToTrackStart()
        }
      },
      { flush: 'sync' }
    )
  )

  stopHandles.push(
    watch(
      () => playerStore.playing,
      (isPlaying) => {
        if (!isPlaying || !isGuardedTrackCurrent()) return

        resetToTrackStart()
        scheduleReset(0)
        scheduleReset(80)

        clearTimer(releaseTimer)
        releaseTimer = window.setTimeout(() => {
          releaseTimer = null
          releaseGuard()
        }, PLAYING_RELEASE_DELAY_MS)
      },
      { flush: 'sync' }
    )
  )

  const unsubscribeActions = playerStore.$onAction(({ name, args, after, onError }) => {
    if (name !== 'replacePlaylist' || args[0] !== HEART_MODE_PLAYLIST_TYPE) return

    const trackIDs = Array.isArray(args[2]) ? (args[2] as TrackID[]) : []
    const requestedIndex = Number(args[3] ?? 0)
    const index = Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0
    const requestedTrackID = trackIDs[index]

    armGuard(requestedTrackID)
    after(() => {
      resetToTrackStart()
      scheduleReset(0)
      scheduleReset(120)
    })
    onError(() => releaseGuard())
  })

  const cleanup = (): void => {
    stopHandles.forEach((stop) => stop())
    unsubscribeActions()
    releaseGuard()
  }

  window.addEventListener('beforeunload', cleanup, { once: true })
  return cleanup
}
