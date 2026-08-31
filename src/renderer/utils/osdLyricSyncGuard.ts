import type { lyricLine } from '@/types/music.d'

type OsdStatus = {
  lyrics?: lyricLine[]
  playing?: boolean
  lyricOffset?: [number, number]
  line?: [number, number]
  rate?: number
  seek?: number
}

const LOCAL_TICK_MS = 250
const AUTHORITATIVE_SYNC_MS = 1500
const SYNTHETIC_MESSAGE_FLAG = '__vutronOsdSyncGuard'

let initialized = false

/**
 * 为桌面歌词增加独立的播放时钟看门狗。
 *
 * 背景：
 * 主播放器通过 MessagePort 把当前歌词行同步到独立的 OSD renderer。自动切歌时，
 * 主播放器原有歌词定时器可能短暂被清除，而 `playing` 状态又可能保持 true，导致
 * 没有新的状态跃迁去重新启动定时器。此时音频继续播放，但 OSD 会停在最后一行。
 *
 * 该看门狗不取代主播放器，只做两层容错：
 * 1. 根据最近一次服务端/主播放器同步的 seek、播放速率和本地 monotonic clock，
 *    每 250 ms 推算当前歌词行，保证 OSD 在主定时器短暂失效时仍能前进；
 * 2. 每 1.5 s 向主播放器请求一次真实 seek，用真实音频时间校正本地推算，避免漂移。
 *
 * 主播放器后续任何正常 `update-osd-status` 都会立即覆盖本地锚点，因此不会与正常
 * 同步争夺状态。
 *
 * Returns:
 *   一个可选的清理函数。当前 OSD 生命周期与页面一致，通常无需显式调用。
 */
export const initializeOsdLyricSyncGuard = (): (() => void) | undefined => {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  let lyrics: lyricLine[] = []
  let playing = false
  let lyricOffset = 0
  let playbackRate = 1
  let anchorSeek = 0
  let anchorTime = performance.now()
  let lastAuthoritativeSync = 0

  const estimateSeek = (now = performance.now()) => {
    if (!playing) return anchorSeek
    const elapsed = Math.max(0, now - anchorTime) / 1000
    return Math.max(0, anchorSeek + elapsed * playbackRate)
  }

  const setSeekAnchor = (seek: unknown) => {
    const value = Number(seek)
    if (!Number.isFinite(value) || value < 0) return
    anchorSeek = value
    anchorTime = performance.now()
  }

  const findLyricIndex = (seek: number) => {
    if (!lyrics.length) return -1

    const target = seek + lyricOffset
    let index = -1

    for (let i = 0; i < lyrics.length; i++) {
      const start = Number(lyrics[i]?.start)
      if (!Number.isFinite(start)) continue
      if (start > target) break
      index = i
    }

    const finalEnd = Number(lyrics.at(-1)?.end)
    if (Number.isFinite(finalEnd) && target > finalEnd) {
      return lyrics.length
    }

    return index
  }

  const postSyntheticLine = () => {
    if (!playing || !lyrics.length) return

    const seek = estimateSeek()
    const line = findLyricIndex(seek)

    window.postMessage(
      {
        type: 'update-osd-status',
        data: {
          line: [line, seek],
          [SYNTHETIC_MESSAGE_FLAG]: true
        }
      },
      '*'
    )
  }

  const handleStatusMessage = (event: MessageEvent) => {
    if (event.data?.type !== 'update-osd-status') return

    const data = (event.data.data ?? {}) as OsdStatus & Record<string, unknown>
    if (data[SYNTHETIC_MESSAGE_FLAG]) return

    lastAuthoritativeSync = performance.now()

    const currentEstimatedSeek = estimateSeek()

    if (Array.isArray(data.lyrics)) {
      lyrics = data.lyrics
    }

    if (data.rate !== undefined) {
      setSeekAnchor(currentEstimatedSeek)
      const nextRate = Number(data.rate)
      if (Number.isFinite(nextRate) && nextRate > 0) {
        playbackRate = nextRate
      }
    }

    if (data.lyricOffset !== undefined) {
      const [offset, seek] = data.lyricOffset
      const nextOffset = Number(offset)
      if (Number.isFinite(nextOffset)) lyricOffset = nextOffset
      setSeekAnchor(seek)
    }

    if (data.line !== undefined) {
      setSeekAnchor(data.line[1])
    } else if (data.seek !== undefined) {
      setSeekAnchor(data.seek)
    }

    if (data.playing !== undefined && data.playing !== playing) {
      const seekBeforeTransition = estimateSeek()
      playing = Boolean(data.playing)
      setSeekAnchor(seekBeforeTransition)
    }
  }

  const tickTimer = window.setInterval(postSyntheticLine, LOCAL_TICK_MS)

  const syncTimer = window.setInterval(() => {
    if (!playing) return

    try {
      window.mainApi?.sendMessage({ type: 'get-seek' })
    } catch (error) {
      console.warn('[OSD Sync] 请求播放器进度失败：', error)
    }

    // 正常情况下请求后会很快收到真实 seek。这里只记录诊断信息，不强制 reload，
    // 避免在主窗口启动/退出阶段造成 OSD 重载循环。
    if (
      lastAuthoritativeSync > 0 &&
      performance.now() - lastAuthoritativeSync > AUTHORITATIVE_SYNC_MS * 4
    ) {
      console.warn('[OSD Sync] 长时间未收到主播放器状态，继续使用本地播放时钟容错')
    }
  }, AUTHORITATIVE_SYNC_MS)

  window.addEventListener('message', handleStatusMessage)

  return () => {
    window.clearInterval(tickTimer)
    window.clearInterval(syncTimer)
    window.removeEventListener('message', handleStatusMessage)
    initialized = false
  }
}
