import { computed, ref } from 'vue'
import { usePlayerStore } from '../store/player'
import type { JsonRecord } from './v327FeatureShared'

export type SleepTimerSelection = '15' | '30' | '60' | '90' | 'trackEnd'
export type SleepTimerMode = 'off' | 'minutes' | 'trackEnd'
export type SleepTimerNotice =
  | 'inactive'
  | 'countdown'
  | 'waitingTrack'
  | 'completed'
  | 'canceledByTrackChange'
  | 'noTrack'

const TIMER_INTERVAL_MS = 250
const END_OF_TRACK_THRESHOLD_SECONDS = 1.2
const TRACK_CHANGE_END_TOLERANCE_SECONDS = 2.5

export const sleepTimerModalVisible = ref(false)
export const sleepTimerMode = ref<SleepTimerMode>('off')
export const sleepTimerEndAt = ref(0)
export const sleepTimerTrackId = ref<number | string | null>(null)
export const sleepTimerNotice = ref<SleepTimerNotice>('inactive')
export const sleepTimerRemainingSeconds = ref(0)

let timer: number | null = null
let lastTrackProgress = 0
let lastTrackDuration = 0

export const sleepTimerActive = computed(() => sleepTimerMode.value !== 'off')

const resolveTrackDuration = (track: JsonRecord): number => {
  const rawDuration = Number(track?.dt ?? track?.duration ?? 0)
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) return 0
  return rawDuration > 10000 ? rawDuration / 1000 : rawDuration
}

const clearTimerInterval = (): void => {
  if (timer === null) return
  window.clearInterval(timer)
  timer = null
}

const resetRuntimeState = (): void => {
  sleepTimerMode.value = 'off'
  sleepTimerEndAt.value = 0
  sleepTimerTrackId.value = null
  sleepTimerRemainingSeconds.value = 0
  lastTrackProgress = 0
  lastTrackDuration = 0
  clearTimerInterval()
}

export const cancelSleepTimer = (notice: SleepTimerNotice = 'inactive'): void => {
  resetRuntimeState()
  sleepTimerNotice.value = notice
}

const pausePlayback = async (): Promise<void> => {
  const playerStore = usePlayerStore()
  if (playerStore.playing) {
    await playerStore.playOrPause()
  }
  cancelSleepTimer('completed')
}

const tickSleepTimer = (): void => {
  if (sleepTimerMode.value === 'off') return

  if (sleepTimerMode.value === 'minutes') {
    const remaining = Math.max(0, (sleepTimerEndAt.value - Date.now()) / 1000)
    sleepTimerRemainingSeconds.value = remaining
    sleepTimerNotice.value = 'countdown'

    if (remaining <= 0) {
      void pausePlayback()
    }
    return
  }

  const track = (window.vutronmusic?.currentTrack || {}) as JsonRecord
  const currentTrackId = track.id ?? null
  const progress = Number(window.vutronmusic?.progress || 0)
  const duration = resolveTrackDuration(track)

  if (currentTrackId !== sleepTimerTrackId.value) {
    const previousTrackEndedNormally =
      lastTrackDuration > 0 &&
      lastTrackDuration - lastTrackProgress <= TRACK_CHANGE_END_TOLERANCE_SECONDS

    if (previousTrackEndedNormally) {
      void pausePlayback()
    } else {
      cancelSleepTimer('canceledByTrackChange')
    }
    return
  }

  lastTrackProgress = progress
  lastTrackDuration = duration
  sleepTimerNotice.value = 'waitingTrack'

  if (duration > 0 && duration - progress <= END_OF_TRACK_THRESHOLD_SECONDS) {
    void pausePlayback()
  }
}

const ensureTimerInterval = (): void => {
  clearTimerInterval()
  timer = window.setInterval(tickSleepTimer, TIMER_INTERVAL_MS)
  tickSleepTimer()
}

export const startSleepTimer = (selection: SleepTimerSelection): boolean => {
  const track = (window.vutronmusic?.currentTrack || {}) as JsonRecord

  if (selection === 'trackEnd') {
    if (track.id === undefined || track.id === null) {
      cancelSleepTimer('noTrack')
      return false
    }

    sleepTimerMode.value = 'trackEnd'
    sleepTimerTrackId.value = track.id
    sleepTimerEndAt.value = 0
    sleepTimerRemainingSeconds.value = 0
    sleepTimerNotice.value = 'waitingTrack'
    lastTrackProgress = Number(window.vutronmusic?.progress || 0)
    lastTrackDuration = resolveTrackDuration(track)
  } else {
    const minutes = Number(selection)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      cancelSleepTimer()
      return false
    }

    sleepTimerMode.value = 'minutes'
    sleepTimerTrackId.value = null
    sleepTimerEndAt.value = Date.now() + minutes * 60 * 1000
    sleepTimerRemainingSeconds.value = minutes * 60
    sleepTimerNotice.value = 'countdown'
    lastTrackProgress = 0
    lastTrackDuration = 0
  }

  ensureTimerInterval()
  return true
}

window.addEventListener(
  'beforeunload',
  () => {
    clearTimerInterval()
  },
  { once: true }
)
