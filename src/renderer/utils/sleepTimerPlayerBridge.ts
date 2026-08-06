import { watch, type WatchStopHandle } from 'vue'
import type { usePlayerStore } from '../store/player'
import {
  completeSleepTimerAtQueueEnd,
  prepareSleepTimerTrackFade,
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

  const quitApplication = async (): Promise<void> => {
    window.mainApi?.send('quit-application')
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
        if (mode !== 'trackEnd') return
        const remaining = Number(duration) - Number(position)
        if (Number.isFinite(remaining)) prepareSleepTimerTrackFade(remaining)
      },
      { flush: 'post' }
    )
  )

  const unsubscribeActions = playerStore.$onAction(({ name, after }) => {
    if (name !== 'playNext') return

    after((result) => {
      if (result === false && sleepTimerMode.value === 'queueEnd') {
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
