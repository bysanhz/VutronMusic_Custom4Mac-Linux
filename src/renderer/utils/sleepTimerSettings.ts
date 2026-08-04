import { computed, ref } from 'vue'

export type SleepTimerSelection = '15' | '30' | '60' | '90' | 'trackEnd'
export type SleepTimerMode = 'off' | 'minutes' | 'trackEnd'
export type SleepTimerNotice =
  | 'inactive'
  | 'countdown'
  | 'waitingTrack'
  | 'completed'
  | 'canceledByTrackChange'
  | 'noTrack'

export const sleepTimerModalVisible = ref(false)
export const sleepTimerMode = ref<SleepTimerMode>('off')
export const sleepTimerEndAt = ref(0)
export const sleepTimerTrackId = ref<number | string | null>(null)
export const sleepTimerNotice = ref<SleepTimerNotice>('inactive')
export const sleepTimerRemainingSeconds = ref(0)

let completionTimer: number | null = null
let displayTimer: number | null = null
let pauseHandler: (() => Promise<void> | void) | null = null

export const sleepTimerActive = computed(() => sleepTimerMode.value !== 'off')

const clearRuntimeTimers = (): void => {
  if (completionTimer !== null) {
    window.clearTimeout(completionTimer)
    completionTimer = null
  }
  if (displayTimer !== null) {
    window.clearInterval(displayTimer)
    displayTimer = null
  }
}

const resetRuntimeState = (): void => {
  clearRuntimeTimers()
  sleepTimerMode.value = 'off'
  sleepTimerEndAt.value = 0
  sleepTimerTrackId.value = null
  sleepTimerRemainingSeconds.value = 0
}

export const registerSleepTimerPauseHandler = (
  handler: (() => Promise<void> | void) | null
): void => {
  pauseHandler = handler
}

export const cancelSleepTimer = (notice: SleepTimerNotice = 'inactive'): void => {
  resetRuntimeState()
  sleepTimerNotice.value = notice
}

const completeSleepTimer = async (): Promise<void> => {
  const handler = pauseHandler
  resetRuntimeState()
  sleepTimerNotice.value = 'completed'
  if (handler) await handler()
}

const refreshRemainingTime = (): void => {
  if (sleepTimerMode.value !== 'minutes') return
  sleepTimerRemainingSeconds.value = Math.max(0, (sleepTimerEndAt.value - Date.now()) / 1000)
  sleepTimerNotice.value = 'countdown'
}

const startMinuteTimer = (minutes: number): void => {
  const delayMs = minutes * 60 * 1000
  sleepTimerMode.value = 'minutes'
  sleepTimerTrackId.value = null
  sleepTimerEndAt.value = Date.now() + delayMs
  sleepTimerRemainingSeconds.value = minutes * 60
  sleepTimerNotice.value = 'countdown'

  completionTimer = window.setTimeout(() => {
    void completeSleepTimer()
  }, delayMs)
  displayTimer = window.setInterval(refreshRemainingTime, 1000)
}

export const startSleepTimer = (selection: SleepTimerSelection): boolean => {
  clearRuntimeTimers()

  if (selection === 'trackEnd') {
    const trackId = window.vutronmusic?.currentTrack?.id
    if (trackId === undefined || trackId === null) {
      cancelSleepTimer('noTrack')
      return false
    }

    sleepTimerMode.value = 'trackEnd'
    sleepTimerTrackId.value = trackId
    sleepTimerEndAt.value = 0
    sleepTimerRemainingSeconds.value = 0
    sleepTimerNotice.value = 'waitingTrack'
    return true
  }

  const minutes = Number(selection)
  if (!Number.isFinite(minutes) || minutes <= 0) {
    cancelSleepTimer()
    return false
  }

  startMinuteTimer(minutes)
  return true
}

export const cancelSleepTimerForTrackChange = (nextTrackId: number | string): void => {
  if (
    sleepTimerMode.value === 'trackEnd' &&
    sleepTimerTrackId.value !== null &&
    String(nextTrackId) !== String(sleepTimerTrackId.value)
  ) {
    cancelSleepTimer('canceledByTrackChange')
  }
}

export const consumeSleepTimerAtTrackEnd = (trackId: number | string | undefined): boolean => {
  if (
    sleepTimerMode.value !== 'trackEnd' ||
    sleepTimerTrackId.value === null ||
    trackId === undefined ||
    String(trackId) !== String(sleepTimerTrackId.value)
  ) {
    return false
  }

  resetRuntimeState()
  sleepTimerNotice.value = 'completed'
  return true
}

window.addEventListener(
  'beforeunload',
  () => {
    clearRuntimeTimers()
    pauseHandler = null
  },
  { once: true }
)
