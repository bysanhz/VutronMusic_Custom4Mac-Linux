type LyricTiming = {
  start: number
  end: number
}

type PlayerLyricState = {
  playing: boolean
  currentIndex: number
  lyrics: LyricTiming[]
  lyricOffset: number
}

const WATCHDOG_INTERVAL_MS = 250

let initialized = false

/**
 * 使用真实 HTMLAudioElement 播放进度为歌词索引增加兜底校正。
 *
 * 详细说明：
 * 播放器原有歌词推进使用链式 setTimeout。自动切歌时旧 timer 会被清理，而播放器
 * 的逻辑 `playing` 有可能保持 true，因此 `watch(playing)` 不一定产生 false -> true
 * 的变化去重新启动链式 timer。结果是音频正常播放，但 `currentIndex` 停在旧值。
 *
 * `window.vutronmusic.progress` 直接读取当前 audio.currentTime，是比逻辑 playing/timer
 * 更可靠的事实来源。本看门狗每 250 ms 用真实播放时间校正一次 currentIndex：正常
 * timer 工作时几乎不会产生写入；timer 失效时则立即接管当前行推进。这样主歌词、
 * 桌面歌词 MessagePort、macOS 菜单栏歌词等依赖 currentIndex 的链路都会恢复更新。
 *
 * Args:
 *   player: 已创建的 Pinia player store。
 *
 * Returns:
 *   清理函数。主 renderer 生命周期通常与应用一致，一般无需主动调用。
 */
export const initializePlayerLyricWatchdog = (
  player: PlayerLyricState
): (() => void) | undefined => {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const getExpectedIndex = (progress: number) => {
    if (!player.lyrics.length) return -1

    const target = progress + (Number(player.lyricOffset) || 0)
    let index = -1

    for (let i = 0; i < player.lyrics.length; i++) {
      const start = Number(player.lyrics[i]?.start)
      if (!Number.isFinite(start)) continue
      if (start > target) break
      index = i
    }

    const finalEnd = Number(player.lyrics.at(-1)?.end)
    if (Number.isFinite(finalEnd) && target > finalEnd) {
      return player.lyrics.length
    }

    return index
  }

  const timer = window.setInterval(() => {
    if (!player.playing || !player.lyrics.length) return

    const progress = Number(window.vutronmusic?.progress)
    if (!Number.isFinite(progress) || progress < 0) return

    const expectedIndex = getExpectedIndex(progress)
    if (expectedIndex !== player.currentIndex) {
      player.currentIndex = expectedIndex
    }
  }, WATCHDOG_INTERVAL_MS)

  return () => {
    window.clearInterval(timer)
    initialized = false
  }
}
