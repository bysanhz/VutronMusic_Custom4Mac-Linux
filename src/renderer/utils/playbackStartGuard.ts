import { nextTick, ref, watch, type WatchStopHandle } from 'vue'
import type { usePlayerStore } from '../store/player'

type PlayerStore = ReturnType<typeof usePlayerStore>
type TrackID = number | string | null | undefined

export type PlaybackStartReason =
  | 'manual-playlist'
  | 'heart-mode'
  | 'previous'
  | 'next'
  | 'play-next-now'
  | 'personal-fm'
  | 'automatic-track-change'
  | 'session-restore'

const POSITION_EPSILON_SECONDS = 0.25
const MAX_GUARD_DURATION_MS = 10_000
const PLAYING_RELEASE_DELAY_MS = 300

export const playbackStartReason = ref<PlaybackStartReason>('session-restore')
export const playbackStartGuardActive = ref(false)

const normalizeTrackID = (value: TrackID): string | null => {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

export const shouldResetPlaybackPosition = (
  previousTrackID: TrackID,
  nextTrackID: TrackID,
  reason: PlaybackStartReason
): boolean => {
  const previous = normalizeTrackID(previousTrackID)
  const next = normalizeTrackID(nextTrackID)
  if (!next || reason === 'session-restore') return false

  // 播放列表显式替换时，即便种子歌曲与当前歌曲相同，也应从头开始。
  if (reason === 'manual-playlist' || reason === 'heart-mode' || reason === 'personal-fm') {
    return true
  }

  return previous !== next
}

/**
 * 统一播放器的起播位置语义：
 *
 * - 手动选歌、上一首、下一首、心动模式、私人 FM：从 0 秒开始；
 * - 暂停后继续、刷新同一歌曲音源：保留当前进度；
 * - 应用启动恢复：保留持久化进度。
 *
 * 初始化时记录当前持久化歌曲 ID，不使用 immediate watch，因此不会破坏会话恢复。
 */
export const initializePlaybackStartPolicy = (playerStore: PlayerStore): (() => void) => {
  let guardedTrackID: string | null = null
  let previousTrackID = normalizeTrackID(playerStore.currentTrack?.id)
  let pendingReason: PlaybackStartReason | null = null
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
    playbackStartGuardActive.value = false
    clearScheduledResets()
    clearTimer(releaseTimer)
    clearTimer(maxGuardTimer)
    releaseTimer = null
    maxGuardTimer = null
  }

  const isGuardedTrackCurrent = (): boolean =>
    guardedTrackID !== null && normalizeTrackID(playerStore.currentTrack?.id) === guardedTrackID

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

  const armGuard = (trackID: TrackID, reason: PlaybackStartReason): void => {
    const normalizedTrackID = normalizeTrackID(trackID)
    if (!normalizedTrackID) return

    playbackStartReason.value = reason
    playbackStartGuardActive.value = true
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

  const setPendingReason = (reason: PlaybackStartReason): void => {
    pendingReason = reason
    playbackStartReason.value = reason
  }

  stopHandles.push(
    watch(
      () => normalizeTrackID(playerStore.currentTrack?.id),
      (nextTrackID) => {
        if (!nextTrackID) return

        const reason = pendingReason || 'automatic-track-change'
        if (shouldResetPlaybackPosition(previousTrackID, nextTrackID, reason)) {
          armGuard(nextTrackID, reason)
        }

        previousTrackID = nextTrackID
        pendingReason = null
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
    if (name === 'replacePlaylist') {
      const type = String(args[0] || '')
      const trackIDs = Array.isArray(args[2]) ? (args[2] as TrackID[]) : []
      const requestedIndex = Number(args[3] ?? 0)
      const index = Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0
      const requestedTrackID = trackIDs[index]
      const reason: PlaybackStartReason =
        type === 'intelligence'
          ? 'heart-mode'
          : type === 'personalFM'
            ? 'personal-fm'
            : 'manual-playlist'

      setPendingReason(reason)
      if (shouldResetPlaybackPosition(previousTrackID, requestedTrackID, reason)) {
        armGuard(requestedTrackID, reason)
      }
      after(() => {
        resetToTrackStart()
        scheduleReset(0)
        scheduleReset(120)
      })
      onError(() => {
        pendingReason = null
        releaseGuard()
      })
      return
    }

    if (name === 'playPrev') setPendingReason('previous')
    else if (name === 'playNext' || name === '_playNextTrack') setPendingReason('next')
    else if (name === 'playPersonalFM' || name === 'playNextFMTrack') {
      setPendingReason('personal-fm')
    } else if (name === 'addTrackToPlayNext' && args[1] === true) {
      setPendingReason('play-next-now')
    }
  })

  const cleanup = (): void => {
    stopHandles.forEach((stop) => stop())
    unsubscribeActions()
    releaseGuard()
  }

  window.addEventListener('beforeunload', cleanup, { once: true })
  return cleanup
}
