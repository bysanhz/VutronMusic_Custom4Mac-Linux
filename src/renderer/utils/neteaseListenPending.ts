import { ref } from 'vue'

type PendingListenState = {
  pendingSeconds: number
  lastRemoteTotalSeconds?: number
}

const STORAGE_KEY = 'vutronmusic-netease-listen-pending-v1'

const readState = (): PendingListenState => {
  if (typeof localStorage === 'undefined') return { pendingSeconds: 0 }
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const pendingSeconds = Math.max(0, Number(stored?.pendingSeconds) || 0)
    const lastRemoteTotalSeconds = Number(stored?.lastRemoteTotalSeconds)
    return {
      pendingSeconds,
      lastRemoteTotalSeconds:
        Number.isFinite(lastRemoteTotalSeconds) && lastRemoteTotalSeconds >= 0
          ? lastRemoteTotalSeconds
          : undefined
    }
  } catch {
    return { pendingSeconds: 0 }
  }
}

const state = readState()

export const pendingNeteaseListenSeconds = ref(state.pendingSeconds)

const PERSIST_INTERVAL_MS = 5_000
let lastRemoteTotalSeconds = state.lastRemoteTotalSeconds
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
        lastRemoteTotalSeconds
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
  persist(true)
}

export const flushPendingNeteaseListenSeconds = (): void => {
  persist(true)
}

/**
 * 用网易云累计时长的增长量抵扣本机已经临时叠加的时长。
 *
 * 网易云听歌统计并非实时刷新。播放器成功 scrobble 后先把本机有效收听时长加入
 * pending；洞察页每次读取累计时长时再用服务端新增量抵扣，避免服务端追上后重复计算。
 */
export const reconcileNeteaseRemoteTotal = (remoteTotalSeconds?: number): void => {
  const next = Number(remoteTotalSeconds)
  if (!Number.isFinite(next) || next < 0) return

  if (lastRemoteTotalSeconds !== undefined && next > lastRemoteTotalSeconds) {
    const syncedSeconds = next - lastRemoteTotalSeconds
    pendingNeteaseListenSeconds.value = Math.max(
      0,
      pendingNeteaseListenSeconds.value - syncedSeconds
    )
  }

  lastRemoteTotalSeconds = next
  persist()
}
