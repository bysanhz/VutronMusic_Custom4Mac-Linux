import { ref, watch, type WatchStopHandle } from 'vue'
import type { usePlayerStore } from '../store/player'
import {
  applyHeartModeFeedbackToSession,
  getHeartModeTrackContext,
  recordHeartModePlayedTrack
} from './heartModeSession'

type PlayerStore = ReturnType<typeof usePlayerStore>

export type PlaybackEndReason =
  | 'natural-end'
  | 'manual-next'
  | 'manual-previous'
  | 'manual-select'
  | 'heart-mode-restart'
  | 'queue-replaced'
  | 'app-close'
  | 'playback-error'

export type PlaybackFeedback = {
  trackId: number
  source: string
  heartModeSessionId?: string
  sourceSeedId?: number
  durationSeconds: number
  activeListenSeconds: number
  completionRatio: number
  endReason: PlaybackEndReason
  likedAtEnd: boolean
  likedDuringPlayback: boolean
  playedAt: number
}

type ActivePlayback = {
  trackId: number
  source: string
  heartModeSessionId?: string
  sourceSeedId?: number
  durationSeconds: number
  activeListenSeconds: number
  activeProgressSeconds: number
  playedAt: number
  lastSampleAt: number
  lastProgress: number
  maxProgress: number
  likedAtEnd: boolean
  likedDuringPlayback: boolean
}

type PendingEndReason = {
  trackId: number
  reason: PlaybackEndReason
  explicit: boolean
  setAt: number
}

export const PLAYBACK_FEEDBACK_KEY = 'vutronmusic-playback-feedback-v1'
export const MAX_PLAYBACK_FEEDBACK = 1000

export const playbackFeedback = ref<PlaybackFeedback[]>([])

let activePlayerStore: PlayerStore | null = null
let activePlayback: ActivePlayback | null = null
let pendingEndReason: PendingEndReason | null = null
let sampleTimer: number | null = null
let stopTrackWatch: WatchStopHandle | null = null
let stopLikedWatch: WatchStopHandle | null = null
let unsubscribeActions: (() => void) | null = null
let beforeUnloadHandler: (() => void) | null = null

const normalizeID = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

export const calculateActiveListenIncrement = ({
  playing,
  wallDeltaSeconds,
  progressDeltaSeconds,
  playbackRate = 1
}: {
  playing: boolean
  wallDeltaSeconds: number
  progressDeltaSeconds: number
  playbackRate?: number
}): number => {
  if (!playing || wallDeltaSeconds <= 0 || progressDeltaSeconds <= 0) return 0

  const normalizedRate = Math.max(0.25, Number(playbackRate) || 1)
  const maxExpectedProgressDelta = wallDeltaSeconds * normalizedRate * 2.5 + 2

  if (progressDeltaSeconds > maxExpectedProgressDelta) return 0
  return wallDeltaSeconds
}

const readPlaybackProgress = (): number => {
  const directProgress = Number(window.vutronmusic?.progress)
  if (Number.isFinite(directProgress) && directProgress >= 0) return directProgress

  const fallbackProgress = Number(activePlayerStore?.progress)
  return Number.isFinite(fallbackProgress) && fallbackProgress >= 0 ? fallbackProgress : 0
}

const readStoredFeedback = (): PlaybackFeedback[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAYBACK_FEEDBACK_KEY) || '[]')
    if (!Array.isArray(stored)) return []

    return stored
      .filter((item: any) => normalizeID(item?.trackId))
      .map((item: any) => ({
        trackId: Number(item.trackId),
        source: String(item.source || 'unknown'),
        heartModeSessionId: item.heartModeSessionId ? String(item.heartModeSessionId) : undefined,
        sourceSeedId: normalizeID(item.sourceSeedId) ?? undefined,
        durationSeconds: Math.max(0, Number(item.durationSeconds) || 0),
        activeListenSeconds: Math.max(0, Number(item.activeListenSeconds) || 0),
        completionRatio: clamp01(Number(item.completionRatio) || 0),
        endReason: item.endReason as PlaybackEndReason,
        likedAtEnd: Boolean(item.likedAtEnd),
        likedDuringPlayback: Boolean(item.likedDuringPlayback),
        playedAt: Number(item.playedAt) || Date.now()
      }))
      .slice(0, MAX_PLAYBACK_FEEDBACK)
  } catch {
    return []
  }
}

const persistFeedback = (): void => {
  try {
    localStorage.setItem(
      PLAYBACK_FEEDBACK_KEY,
      JSON.stringify(playbackFeedback.value.slice(0, MAX_PLAYBACK_FEEDBACK))
    )
  } catch (error) {
    console.warn('[PlaybackFeedback] 保存播放反馈失败：', error)
  }
}

const sampleActivePlayback = (): void => {
  const store = activePlayerStore
  const active = activePlayback
  if (!store || !active) return

  const now = Date.now()
  const wallDelta = Math.max(0, (now - active.lastSampleAt) / 1000)
  const progress = readPlaybackProgress()
  const progressDelta = progress - active.lastProgress
  const increment = calculateActiveListenIncrement({
    playing: store.playing,
    wallDeltaSeconds: wallDelta,
    progressDeltaSeconds: progressDelta,
    playbackRate: Number(store.playbackRate) || 1
  })

  active.activeListenSeconds += increment
  if (increment > 0) {
    active.activeProgressSeconds += progressDelta
  }

  active.maxProgress = Math.max(active.maxProgress, progress)
  active.lastProgress = progress
  active.lastSampleAt = now

  if (normalizeID(store.currentTrack?.id) === active.trackId) {
    active.likedAtEnd = Boolean(store.isLiked)
  }
}

const setPendingEndReason = (reason: PlaybackEndReason, explicit: boolean): void => {
  if (!activePlayback) return
  if (
    !explicit &&
    pendingEndReason?.trackId === activePlayback.trackId &&
    Date.now() - pendingEndReason.setAt < 15_000
  ) {
    return
  }

  pendingEndReason = {
    trackId: activePlayback.trackId,
    reason,
    explicit,
    setAt: Date.now()
  }
}

export const markPlaybackEndReason = (reason: PlaybackEndReason): void => {
  setPendingEndReason(reason, true)
}

const resolveEndReason = (): PlaybackEndReason => {
  const active = activePlayback
  if (!active) return 'playback-error'

  if (
    pendingEndReason &&
    pendingEndReason.trackId === active.trackId &&
    Date.now() - pendingEndReason.setAt < 15_000
  ) {
    return pendingEndReason.reason
  }

  const positionRatio =
    active.durationSeconds > 0 ? clamp01(active.maxProgress / active.durationSeconds) : 0

  return positionRatio >= 0.97 ? 'natural-end' : 'playback-error'
}

const finalizeActivePlayback = (reason: PlaybackEndReason): PlaybackFeedback | null => {
  const store = activePlayerStore
  const active = activePlayback
  if (!store || !active) return null

  sampleActivePlayback()

  const activeListenSeconds = Math.max(0, active.activeListenSeconds)
  const activeProgressSeconds = Math.max(0, active.activeProgressSeconds)
  const completionRatio =
    active.durationSeconds > 0 ? clamp01(activeProgressSeconds / active.durationSeconds) : 0

  if (activeListenSeconds <= 0 && activeProgressSeconds <= 0 && !active.likedDuringPlayback) {
    activePlayback = null
    pendingEndReason = null
    return null
  }

  const entry: PlaybackFeedback = {
    trackId: active.trackId,
    source: active.source,
    heartModeSessionId: active.heartModeSessionId,
    sourceSeedId: active.sourceSeedId,
    durationSeconds: active.durationSeconds,
    activeListenSeconds,
    completionRatio,
    endReason: reason,
    likedAtEnd: active.likedAtEnd,
    likedDuringPlayback: active.likedDuringPlayback,
    playedAt: active.playedAt
  }

  playbackFeedback.value = [entry, ...playbackFeedback.value].slice(0, MAX_PLAYBACK_FEEDBACK)
  persistFeedback()

  const preferenceScore = scorePlaybackFeedback(entry)
  if (entry.heartModeSessionId && entry.sourceSeedId) {
    const manualSwitch = ['manual-next', 'manual-previous', 'manual-select'].includes(
      entry.endReason
    )
    applyHeartModeFeedbackToSession({
      sessionId: entry.heartModeSessionId,
      seedId: entry.sourceSeedId,
      score: preferenceScore,
      completionRatio: entry.completionRatio,
      quickSkip: manualSwitch && entry.activeListenSeconds <= 15 && entry.completionRatio < 0.8,
      positive: preferenceScore !== null && preferenceScore >= 2
    })
  }

  activePlayback = null
  pendingEndReason = null
  return entry
}

const startActivePlayback = (): void => {
  const store = activePlayerStore
  const trackID = normalizeID(store?.currentTrack?.id)
  if (!store || !trackID) return

  const source = String(store.playlistSource?.type || store.currentTrack?.type || 'unknown')
  const durationSeconds = Math.max(0, Number(store.currentTrackDuration) || 0)
  const heartModeContext = source === 'intelligence' ? getHeartModeTrackContext(trackID) : null

  activePlayback = {
    trackId: trackID,
    source,
    heartModeSessionId: heartModeContext?.heartModeSessionId,
    sourceSeedId: heartModeContext?.sourceSeedId,
    durationSeconds,
    activeListenSeconds: 0,
    activeProgressSeconds: 0,
    playedAt: Date.now(),
    lastSampleAt: Date.now(),
    lastProgress: readPlaybackProgress(),
    maxProgress: readPlaybackProgress(),
    likedAtEnd: Boolean(store.isLiked),
    likedDuringPlayback: false
  }

  if (heartModeContext) {
    recordHeartModePlayedTrack(trackID)
  }
}

const actionEndReason = (
  actionName: string,
  args: unknown[],
  store: PlayerStore
): PlaybackEndReason | null => {
  switch (actionName) {
    case '_playNextTrack':
      return 'manual-next'
    case 'playPrev':
      return 'manual-previous'
    case 'replacePlaylist': {
      const [sourceType, sourceID, trackIDs, autoPlayTrackIndex] = args
      const targetTrackID = Array.isArray(trackIDs)
        ? normalizeID(trackIDs[Math.max(0, Number(autoPlayTrackIndex) || 0)])
        : null
      const sameSource =
        String(sourceType ?? '') === String(store.playlistSource?.type ?? '') &&
        String(sourceID ?? '') === String(store.playlistSource?.id ?? '')

      if (sameSource && targetTrackID && targetTrackID !== activePlayback?.trackId) {
        return 'manual-select'
      }
      return 'queue-replaced'
    }
    case 'resetPlayer':
      return 'queue-replaced'
    default:
      return null
  }
}

export const scorePlaybackFeedback = (feedback: PlaybackFeedback): number | null => {
  const likedBonus = feedback.likedDuringPlayback && feedback.likedAtEnd ? 5 : 0

  if (feedback.endReason === 'natural-end') {
    return likedBonus + 2
  }

  const manualSwitch = ['manual-next', 'manual-previous', 'manual-select'].includes(
    feedback.endReason
  )

  if (manualSwitch) {
    let score = 0
    if (feedback.completionRatio >= 0.8) {
      score = 1
    } else if (feedback.activeListenSeconds <= 15) {
      score = -4
    } else if (feedback.activeListenSeconds <= 45 && feedback.completionRatio < 0.3) {
      score = -3
    } else if (feedback.completionRatio < 0.3) {
      score = -3
    } else if (feedback.completionRatio < 0.7) {
      score = -1
    }
    return score + likedBonus
  }

  return likedBonus > 0 ? likedBonus : null
}

export const resetActivePlaybackFeedbackWindow = (): void => {
  const store = activePlayerStore
  const active = activePlayback
  const trackId = normalizeID(store?.currentTrack?.id)
  if (!store || !active || !trackId || active.trackId !== trackId) return

  const progress = readPlaybackProgress()
  const source = String(store.playlistSource?.type || store.currentTrack?.type || 'unknown')
  const context = source === 'intelligence' ? getHeartModeTrackContext(trackId) : null

  activePlayback = {
    ...active,
    source,
    heartModeSessionId: context?.heartModeSessionId,
    sourceSeedId: context?.sourceSeedId,
    activeListenSeconds: 0,
    activeProgressSeconds: 0,
    playedAt: Date.now(),
    lastSampleAt: Date.now(),
    lastProgress: progress,
    maxProgress: progress,
    likedAtEnd: Boolean(store.isLiked),
    likedDuringPlayback: false
  }
  pendingEndReason = null
}

export const removePlaybackFeedbackForHeartModeSession = (sessionId: string): number => {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) return 0

  const before = playbackFeedback.value.length
  playbackFeedback.value = playbackFeedback.value.filter(
    (entry) => entry.heartModeSessionId !== normalizedSessionId
  )
  const removed = before - playbackFeedback.value.length
  if (removed > 0) persistFeedback()
  return removed
}

export const clearPlaybackFeedback = (): void => {
  playbackFeedback.value = []
  persistFeedback()
}

export const initializePlaybackFeedback = (playerStore: PlayerStore): (() => void) => {
  activePlayerStore = playerStore
  playbackFeedback.value = readStoredFeedback()

  if (playerStore.currentTrack?.id) startActivePlayback()

  stopTrackWatch?.()
  stopTrackWatch = watch(
    () => playerStore.currentTrack?.id,
    (trackID, previousTrackID) => {
      if (trackID === previousTrackID) return

      if (activePlayback) {
        finalizeActivePlayback(resolveEndReason())
      }

      if (trackID !== undefined && trackID !== null) {
        startActivePlayback()
      }
    },
    { flush: 'sync' }
  )

  stopLikedWatch?.()
  stopLikedWatch = watch(
    () => [playerStore.currentTrack?.id, playerStore.isLiked] as const,
    ([trackID, liked]) => {
      if (!activePlayback || normalizeID(trackID) !== activePlayback.trackId) return
      const nextLiked = Boolean(liked)
      if (nextLiked && !activePlayback.likedAtEnd) {
        activePlayback.likedDuringPlayback = true
      }
      activePlayback.likedAtEnd = nextLiked
    },
    { flush: 'sync' }
  )

  unsubscribeActions?.()
  unsubscribeActions = playerStore.$onAction(({ name, args, after, onError }) => {
    const reason = actionEndReason(name, args, playerStore)
    if (!reason || !activePlayback) return

    const trackedID = activePlayback.trackId
    if (normalizeID(playerStore.currentTrack?.id) === trackedID) {
      activePlayback.likedAtEnd = Boolean(playerStore.isLiked)
    }
    setPendingEndReason(reason, false)

    const clearStaleReason = () => {
      window.setTimeout(() => {
        const currentTrackID = normalizeID(playerStore.currentTrack?.id)
        if (
          pendingEndReason?.trackId === trackedID &&
          activePlayback?.trackId === trackedID &&
          currentTrackID === trackedID
        ) {
          pendingEndReason = null
        }
      }, 0)
    }

    after(clearStaleReason)
    onError(clearStaleReason)
  })

  if (sampleTimer !== null) window.clearInterval(sampleTimer)
  sampleTimer = window.setInterval(sampleActivePlayback, 1000)

  if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler)
  beforeUnloadHandler = () => {
    if (activePlayback) finalizeActivePlayback('app-close')
  }
  window.addEventListener('beforeunload', beforeUnloadHandler)

  return () => {
    if (activePlayback) finalizeActivePlayback('app-close')
    stopTrackWatch?.()
    stopTrackWatch = null
    stopLikedWatch?.()
    stopLikedWatch = null
    unsubscribeActions?.()
    unsubscribeActions = null
    if (sampleTimer !== null) {
      window.clearInterval(sampleTimer)
      sampleTimer = null
    }
    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
      beforeUnloadHandler = null
    }
    activePlayerStore = null
  }
}
