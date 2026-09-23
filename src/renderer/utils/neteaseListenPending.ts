import { ref } from 'vue'

type PendingListenState = {
  pendingSeconds: number
  submittedSeconds: number
  lastRemoteWeekSeconds?: number
}

const STORAGE_KEY = 'vutronmusic-netease-listen-pending-v2'
const LEGACY_STORAGE_KEY = 'vutronmusic-netease-listen-pending-v1'
// realtime/report 的时长只精确到分钟，秒级尾差不可能通过远端增量单独确认。
const REMOTE_DURATION_QUANTUM_SECONDS = 60

const settleUnconfirmableRemainder = (
  pendingSeconds: number,
  submittedSeconds: number
): Pick<PendingListenState, 'pendingSeconds' | 'submittedSeconds'> => {
  const remainder = submittedSeconds % REMOTE_DURATION_QUANTUM_SECONDS
  return {
    pendingSeconds: Math.max(0, pendingSeconds - remainder),
    submittedSeconds: Math.max(0, submittedSeconds - remainder)
  }
}

const readState = (): PendingListenState => {
  if (typeof localStorage === 'undefined') return { pendingSeconds: 0, submittedSeconds: 0 }
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    const stored = JSON.parse(current || localStorage.getItem(LEGACY_STORAGE_KEY) || '{}')
    const pendingSeconds = Math.max(0, Number(stored?.pendingSeconds) || 0)
    const submittedSeconds = Math.min(
      pendingSeconds,
      Math.max(0, Number(stored?.submittedSeconds) || 0)
    )
    const lastRemoteWeekSeconds = Number(stored?.lastRemoteWeekSeconds)
    const migratedPendingSeconds = current ? pendingSeconds : submittedSeconds
    const settled = settleUnconfirmableRemainder(migratedPendingSeconds, submittedSeconds)
    return {
      // v1 counted every short preview locally although those plays were deliberately never
      // submitted. It also lacked per-track metadata, so the unsubmitted remainder cannot be
      // retried safely. Preserve only records that v1 had actually accepted for remote delivery.
      pendingSeconds: settled.pendingSeconds,
      submittedSeconds: settled.submittedSeconds,
      lastRemoteWeekSeconds:
        Number.isFinite(lastRemoteWeekSeconds) && lastRemoteWeekSeconds >= 0
          ? lastRemoteWeekSeconds
          : undefined
    }
  } catch {
    return { pendingSeconds: 0, submittedSeconds: 0 }
  }
}

const state = readState()

export const pendingNeteaseListenSeconds = ref(state.pendingSeconds)
export const submittedNeteaseListenSeconds = ref(state.submittedSeconds)
// 当前歌曲尚未达到普通上报门槛的实时播放量。只用于平滑 UI，不持久化；
// 达到门槛或手动刷新后会原子地转入 pending，短试听切歌则直接清零。
export const provisionalNeteaseListenSeconds = ref(0)

export const setProvisionalNeteaseListenSeconds = (seconds: number): void => {
  const value = Number(seconds)
  provisionalNeteaseListenSeconds.value = Number.isFinite(value) ? Math.max(0, value) : 0
}

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
        submittedSeconds: Math.min(
          Math.max(0, pendingNeteaseListenSeconds.value),
          Math.max(0, submittedNeteaseListenSeconds.value)
        ),
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

export const markSubmittedNeteaseListenSeconds = (seconds: number): void => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return
  submittedNeteaseListenSeconds.value = Math.min(
    pendingNeteaseListenSeconds.value,
    submittedNeteaseListenSeconds.value + value
  )
  /*
   * NCBL 已明确接收上报后，只把整分钟部分留给 realtime/report 做二次确认。
   * 不足一分钟的尾差在报告里不会形成独立增量，如果继续等待就会永久显示
   * “已提交待确认 +14秒”之类的状态。
   */
  const settled = settleUnconfirmableRemainder(
    pendingNeteaseListenSeconds.value,
    submittedNeteaseListenSeconds.value
  )
  pendingNeteaseListenSeconds.value = settled.pendingSeconds
  submittedNeteaseListenSeconds.value = settled.submittedSeconds
  persist(true)
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
    /*
     * 新版本会区分“尚未提交”和“已经提交、等待网易云确认”。
     * 有明确 submitted 记录时，只用远端增长抵扣这一部分，避免另一台设备产生的
     * 远端增长误吃掉当前仍未提交的本机播放。旧版本迁移数据没有 submitted 信息时
     * 继续沿用原来的 pending 抵扣逻辑，保证历史状态仍能自然收敛。
     */
    const confirmableSeconds =
      submittedNeteaseListenSeconds.value > 0
        ? Math.min(syncedSeconds, submittedNeteaseListenSeconds.value)
        : Math.min(syncedSeconds, pendingNeteaseListenSeconds.value)

    pendingNeteaseListenSeconds.value = Math.max(
      0,
      pendingNeteaseListenSeconds.value - confirmableSeconds
    )
    submittedNeteaseListenSeconds.value = Math.max(
      0,
      submittedNeteaseListenSeconds.value - confirmableSeconds
    )
  }

  lastRemoteWeekSeconds = next
  persist(true)
}
