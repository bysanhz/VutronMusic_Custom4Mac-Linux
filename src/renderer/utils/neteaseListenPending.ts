import { ref } from 'vue'

type PendingListenState = {
  pendingSeconds: number
  lastRemoteWeekSeconds?: number
}

const STORAGE_KEY = 'vutronmusic-netease-listen-pending-v1'

const readState = (): PendingListenState => {
  if (typeof localStorage === 'undefined') return { pendingSeconds: 0 }
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const pendingSeconds = Math.max(0, Number(stored?.pendingSeconds) || 0)
    const lastRemoteWeekSeconds = Number(stored?.lastRemoteWeekSeconds)
    return {
      pendingSeconds,
      lastRemoteWeekSeconds:
        Number.isFinite(lastRemoteWeekSeconds) && lastRemoteWeekSeconds >= 0
          ? lastRemoteWeekSeconds
          : undefined
    }
  } catch {
    return { pendingSeconds: 0 }
  }
}

const state = readState()

export const pendingNeteaseListenSeconds = ref(state.pendingSeconds)

const PERSIST_INTERVAL_MS = 5_000
let lastRemoteWeekSeconds = state.lastRemoteWeekSeconds
let lastPersistAt = 0

const persist = (force = false): void => {
  if (typeof localStorage === 'undefined') return
  const now = Date.now()
  if (!force && now - lastPersistAt < PERSIST_INTERVAL_MS) return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pendingSeconds: Math.max(0, pendingNeteaseListenSeconds.value),
        lastRemoteWeekSeconds
      })
    )
    lastPersistAt = now
  } catch (error) {
    console.warn('[NetEaseListenPending] 保存待同步听歌时长失败：', error)
  }
}

export const addPendingNeteaseListenSeconds = (seconds: number): void => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return
  pendingNeteaseListenSeconds.value += value
  persist()
}

export const flushPendingNeteaseListenSeconds = (): void => {
  persist(true)
}

/**
 * 用网易云“本周收听时长”的增长量抵扣本机待同步时长。
 *
 * 不能再用 /listen/data/total 的 totalDuration 来抵扣：该累计字段与实时周/月报告
 * 的更新节奏并不一致，可能在“首数已经同步、周时长尚未同步”时提前吃掉 pending，
 * 结果就是页面看起来首数会变、时长却始终不变。
 *
 * 当前播放发生在本周，因此以 realtime/report(type=week) 的 playDuration 作为
 * 是否真正同步了“时长”的唯一确认信号。只有周时长实际增长时才抵扣本机 pending。
 */
export const reconcileNeteaseRemoteWeekDuration = (remoteWeekSeconds?: number): void => {
  const next = Number(remoteWeekSeconds)
  if (!Number.isFinite(next) || next < 0) return

  if (lastRemoteWeekSeconds !== undefined && next > lastRemoteWeekSeconds) {
    const syncedSeconds = next - lastRemoteWeekSeconds
    pendingNeteaseListenSeconds.value = Math.max(
      0,
      pendingNeteaseListenSeconds.value - syncedSeconds
    )
  }

  lastRemoteWeekSeconds = next
  persist(true)
}
