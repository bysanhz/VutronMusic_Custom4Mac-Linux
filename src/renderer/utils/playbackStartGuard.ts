import { nextTick, watch, type WatchStopHandle } from 'vue'
import type { usePlayerStore } from '../store/player'

type PlayerStore = ReturnType<typeof usePlayerStore>
type TrackID = number | string | null | undefined

const POSITION_EPSILON_SECONDS = 0.25
const MAX_GUARD_DURATION_MS = 10_000
const PLAYING_RELEASE_DELAY_MS = 250

const normalizeTrackID = (value: TrackID): string | null => {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

/**
 * 防止普通切歌流程把上一首歌曲的持久化进度写入新歌曲。
 *
 * 播放器的音源请求和歌词请求并行执行。旧逻辑在歌词请求较早结束、HTMLAudioElement
 * 尚未进入 playing 状态时，会把上一首的 progress 当作暂停恢复位置写入新歌曲。
 * 本保护仅在歌曲 ID 发生变化或显式替换播放列表时启用，因此不会影响：
 *
 * - 暂停后继续播放当前歌曲；
 * - 应用启动时恢复上一次歌曲；
 * - 同一歌曲的过期 URL 刷新；
 * - 系统 resume 事件恢复当前进度。
 */
export const initializePlaybackStartGuard = (playerStore: PlayerStore): (() => void) => {
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
      (trackID, previousTrackID) => {
        if (trackID && trackID !== previousTrackID) armGuard(trackID)
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
          !playerStore.playing &&
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
    if (name !== 'replacePlaylist') return

    const trackIDs = Array.isArray(args[2]) ? (args[2] as TrackID[]) : []
    const requestedIndex = Number(args[3] ?? 0)
    const index = Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0
    const requestedTrackID = trackIDs[index]

    armGuard(requestedTrackID)
    after(() => resetToTrackStart())
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
