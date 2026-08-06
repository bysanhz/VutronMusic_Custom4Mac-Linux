import { computed, ref } from 'vue'

export type SleepTimerSelection =
  | '15'
  | '30'
  | '60'
  | '90'
  | 'trackEnd'
  | 'queueEnd'
  | number
export type SleepTimerMode = 'off' | 'minutes' | 'trackEnd' | 'queueEnd'
export type SleepTimerAction = 'pause' | 'quit'
export type SleepTimerNotice =
  | 'inactive'
  | 'countdown'
  | 'waitingTrack'
  | 'waitingQueue'
  | 'completed'
  | 'canceledByTrackChange'
  | 'noTrack'

export type SleepTimerRuntimeHandlers = {
  fade?: (seconds: number) => Promise<void> | void
  pause?: () => Promise<void> | void
  quit?: () => Promise<void> | void
  cancelFade?: () => Promise<void> | void
}

const PREFERENCES_STORAGE_KEY = 'vutronmusic-sleep-timer-preferences-v2'
const ALLOWED_FADE_SECONDS = [0, 5, 15, 30] as const

export const sleepTimerModalVisible = ref(false)
export const sleepTimerMode = ref<SleepTimerMode>('off')
export const sleepTimerEndAt = ref(0)
export const sleepTimerTrackId = ref<number | string | null>(null)
export const sleepTimerNotice = ref<SleepTimerNotice>('inactive')
export const sleepTimerRemainingSeconds = ref(0)
export const sleepTimerAction = ref<SleepTimerAction>('pause')
export const sleepTimerFadeSeconds = ref<number>(5)

let completionTimer: number | null = null
let fadeStartTimer: number | null = null
let displayTimer: number | null = null
let runtimeHandlers: SleepTimerRuntimeHandlers = {}
let legacyPauseHandler: (() => Promise<void> | void) | null = null
let fadeStarted = false

export const sleepTimerActive = computed(() => sleepTimerMode.value !== 'off')

const normalizeFadeSeconds = (value: number): number =>
  ALLOWED_FADE_SECONDS.includes(value as (typeof ALLOWED_FADE_SECONDS)[number]) ? value : 5

const loadPreferences = (): void => {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || '{}')
    sleepTimerAction.value = value?.action === 'quit' ? 'quit' : 'pause'
    sleepTimerFadeSeconds.value = normalizeFadeSeconds(Number(value?.fadeSeconds))
  } catch {
    sleepTimerAction.value = 'pause'
    sleepTimerFadeSeconds.value = 5
  }
}

export const saveSleepTimerPreferences = (
  action: SleepTimerAction,
  fadeSeconds: number
): void => {
  sleepTimerAction.value = action === 'quit' ? 'quit' : 'pause'
  sleepTimerFadeSeconds.value = normalizeFadeSeconds(fadeSeconds)

  try {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        action: sleepTimerAction.value,
        fadeSeconds: sleepTimerFadeSeconds.value
      })
    )
  } catch (error) {
    console.warn('[SleepTimer] 保存结束动作设置失败：', error)
  }
}

loadPreferences()

const clearTimer = (timer: number | null, kind: 'timeout' | 'interval' = 'timeout'): null => {
  if (timer === null) return null
  if (kind === 'interval') window.clearInterval(timer)
  else window.clearTimeout(timer)
  return null
}

const clearRuntimeTimers = (restoreFade = true): void => {
  completionTimer = clearTimer(completionTimer)
  fadeStartTimer = clearTimer(fadeStartTimer)
  displayTimer = clearTimer(displayTimer, 'interval')

  if (restoreFade && fadeStarted) {
    void runtimeHandlers.cancelFade?.()
  }
  fadeStarted = false
}

const resetRuntimeState = (restoreFade = true): void => {
  clearRuntimeTimers(restoreFade)
  sleepTimerMode.value = 'off'
  sleepTimerEndAt.value = 0
  sleepTimerTrackId.value = null
  sleepTimerRemainingSeconds.value = 0
}

export const registerSleepTimerRuntimeHandlers = (
  handlers: SleepTimerRuntimeHandlers | null
): void => {
  runtimeHandlers = handlers || {}
}

/** 保留旧播放器注册接口，供未迁移的暂停逻辑继续工作。 */
export const registerSleepTimerPauseHandler = (
  handler: (() => Promise<void> | void) | null
): void => {
  legacyPauseHandler = handler
}

export const cancelSleepTimer = (notice: SleepTimerNotice = 'inactive'): void => {
  resetRuntimeState(true)
  sleepTimerNotice.value = notice
}

const beginFade = async (): Promise<void> => {
  const seconds = normalizeFadeSeconds(sleepTimerFadeSeconds.value)
  if (seconds <= 0 || fadeStarted) return
  fadeStarted = true
  await runtimeHandlers.fade?.(seconds)
}

const pausePlayback = async (): Promise<void> => {
  if (runtimeHandlers.pause) await runtimeHandlers.pause()
  else if (legacyPauseHandler) await legacyPauseHandler()
}

const finishAction = async (pauseAlreadyHandled = false): Promise<void> => {
  if (!pauseAlreadyHandled) await pausePlayback()
  if (sleepTimerAction.value === 'quit') await runtimeHandlers.quit?.()
}

const completeSleepTimer = async (pauseAlreadyHandled = false): Promise<void> => {
  const shouldQuit = sleepTimerAction.value === 'quit'
  resetRuntimeState(false)
  sleepTimerNotice.value = 'completed'

  await finishAction(pauseAlreadyHandled)
  if (!shouldQuit) await runtimeHandlers.cancelFade?.()
  fadeStarted = false
}

const refreshRemainingTime = (): void => {
  if (sleepTimerMode.value !== 'minutes') return
  sleepTimerRemainingSeconds.value = Math.max(0, (sleepTimerEndAt.value - Date.now()) / 1000)
  sleepTimerNotice.value = 'countdown'
}

const startMinuteTimer = (minutes: number): void => {
  const delayMs = minutes * 60 * 1000
  const fadeMs = normalizeFadeSeconds(sleepTimerFadeSeconds.value) * 1000

  sleepTimerMode.value = 'minutes'
  sleepTimerTrackId.value = null
  sleepTimerEndAt.value = Date.now() + delayMs
  sleepTimerRemainingSeconds.value = minutes * 60
  sleepTimerNotice.value = 'countdown'

  if (fadeMs > 0 && delayMs > fadeMs) {
    fadeStartTimer = window.setTimeout(() => {
      void beginFade()
    }, delayMs - fadeMs)
  }

  completionTimer = window.setTimeout(() => {
    void completeSleepTimer()
  }, delayMs)
  displayTimer = window.setInterval(refreshRemainingTime, 1000)
}

export const startSleepTimer = (selection: SleepTimerSelection): boolean => {
  clearRuntimeTimers(true)

  if (selection === 'trackEnd' || selection === 'queueEnd') {
    const trackId = window.vutronmusic?.currentTrack?.id
    if (trackId === undefined || trackId === null) {
      cancelSleepTimer('noTrack')
      return false
    }

    sleepTimerMode.value = selection
    sleepTimerTrackId.value = trackId
    sleepTimerEndAt.value = 0
    sleepTimerRemainingSeconds.value = 0
    sleepTimerNotice.value = selection === 'trackEnd' ? 'waitingTrack' : 'waitingQueue'
    return true
  }

  const minutes = Number(selection)
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
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

export const prepareSleepTimerTrackFade = (remainingSeconds: number): void => {
  if (sleepTimerMode.value !== 'trackEnd' || fadeStarted) return
  const fadeSeconds = normalizeFadeSeconds(sleepTimerFadeSeconds.value)
  if (fadeSeconds > 0 && remainingSeconds <= fadeSeconds && remainingSeconds > 0) {
    void beginFade()
  }
}

export const consumeSleepTimerAtTrackEnd = (
  trackId: number | string | undefined
): boolean => {
  if (
    sleepTimerMode.value !== 'trackEnd' ||
    sleepTimerTrackId.value === null ||
    trackId === undefined ||
    String(trackId) !== String(sleepTimerTrackId.value)
  ) {
    return false
  }

  // Player Store 会在返回 true 后执行原有暂停；这里负责状态收尾和可选退出应用。
  void completeSleepTimer(true)
  return true
}

export const completeSleepTimerAtQueueEnd = async (): Promise<boolean> => {
  if (sleepTimerMode.value !== 'queueEnd') return false
  await beginFade()
  await completeSleepTimer(false)
  return true
}

window.addEventListener(
  'beforeunload',
  () => {
    clearRuntimeTimers(false)
    runtimeHandlers = {}
    legacyPauseHandler = null
  },
  { once: true }
)
