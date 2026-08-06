import { watch, type WatchStopHandle } from 'vue'
import type { usePlayerStore } from '../store/player'
import {
  completeSleepTimerAtQueueEnd,
  prepareSleepTimerEndFade,
  registerSleepTimerRuntimeHandlers,
  sleepTimerMode
} from './sleepTimerSettings'

type PlayerStore = ReturnType<typeof usePlayerStore>

const FADE_STEP_MS = 100

export const initializeSleepTimerPlayerBridge = (playerStore: PlayerStore): (() => void) => {
  let fadeGeneration = 0
  let originalVolume: number | null = null
  const stopHandles: WatchStopHandle[] = []

  const cancelFade = async (): Promise<void> => {
    fadeGeneration += 1
    if (originalVolume !== null) {
      playerStore.volume = originalVolume
      originalVolume = null
    }
  }

  const fadeToSilence = async (seconds: number): Promise<void> => {
    await cancelFade()
    if (seconds <= 0) return

    const generation = fadeGeneration
    const startVolume = Math.max(0, Math.min(1, Number(playerStore.volume) || 0))
    originalVolume = startVolume
    const durationMs = seconds * 1000
    const startedAt = performance.now()

    await new Promise<void>((resolve) => {
      const step = () => {
        if (generation !== fadeGeneration) {
          resolve()
          return
        }

        const progress = Math.min(1, (performance.now() - startedAt) / durationMs)
        playerStore.volume = Math.max(0, startVolume * (1 - progress))
        if (progress >= 1) {
          resolve()
          return
        }
        window.setTimeout(step, FADE_STEP_MS)
      }
      step()
    })
  }

  const pausePlayback = async (): Promise<void> => {
    if (playerStore.playing) await playerStore.playOrPause()
    if (originalVolume !== null) {
      playerStore.volume = originalVolume
      originalVolume = null
    }
  }

  const quitApplication = (): void => {
    window.mainApi?.send('quit-application')
  }

  const queueWillContinue = (): boolean => {
    const hasQueuedTrack = playerStore._playNextList.length > 0
    const hasNaturalNext = playerStore.currentTrackIndex + 1 < playerStore.list.length
    const loopsQueue = playerStore.repeatMode === 'on'
    return playerStore.isPersonalFM || hasQueuedTrack || hasNaturalNext || loopsQueue
  }

  registerSleepTimerRuntimeHandlers({
    fade: fadeToSilence,
    pause: pausePlayback,
    quit: quitApplication,
    cancelFade
  })

  stopHandles.push(
    watch(
      () => [sleepTimerMode.value, Number(playerStore.seek), playerStore.currentTrackDuration],
      ([mode, position, duration]) => {
        const isTrackEnd = mode === 'trackEnd'
        const isFinalQueueTrack = mode === 'queueEnd' && !queueWillContinue()
        if (!isTrackEnd && !isFinalQueueTrack) return

        const remaining = Number(duration) - Number(position)
        if (Number.isFinite(remaining)) prepareSleepTimerEndFade(remaining)
      },
      { flush: 'post' }
    )
  )

  const unsubscribeActions = playerStore.$onAction(({ name, args, after }) => {
    if (name !== '_playNextTrack' || sleepTimerMode.value !== 'queueEnd') return

    const isPersonalFm = args[0] === true
    const willContinue = isPersonalFm || queueWillContinue()

    after(() => {
      if (!willContinue && sleepTimerMode.value === 'queueEnd') {
        void completeSleepTimerAtQueueEnd()
      }
    })
  })

  const cleanup = (): void => {
    stopHandles.forEach((stop) => stop())
    unsubscribeActions()
    registerSleepTimerRuntimeHandlers(null)
    void cancelFade()
  }

  window.addEventListener('beforeunload', cleanup, { once: true })
  return cleanup
}
