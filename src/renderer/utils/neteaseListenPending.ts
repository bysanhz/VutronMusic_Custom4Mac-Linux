import { computed, ref } from 'vue'

export type NeteaseListenScope = 'today' | 'week' | 'month' | 'total'

type ScopeState = {
  pendingSeconds: number
  lastRemoteSeconds?: number
}

type PendingListenState = Record<NeteaseListenScope, ScopeState>

const STORAGE_KEY = 'vutronmusic-netease-listen-pending-v2'
const LEGACY_STORAGE_KEY = 'vutronmusic-netease-listen-pending-v1'
const PERSIST_INTERVAL_MS = 5_000

const createEmptyState = (): PendingListenState => ({
  today: { pendingSeconds: 0 },
  week: { pendingSeconds: 0 },
  month: { pendingSeconds: 0 },
  total: { pendingSeconds: 0 }
})

const normalizeScopeState = (value: any): ScopeState => {
  const pendingSeconds = Math.max(0, Number(value?.pendingSeconds) || 0)
  const lastRemote = Number(value?.lastRemoteSeconds)
  return {
    pendingSeconds,
    lastRemoteSeconds:
      Number.isFinite(lastRemote) && lastRemote >= 0 ? lastRemote : undefined
  }
}

const readState = (): PendingListenState => {
  const empty = createEmptyState()
  if (typeof localStorage === 'undefined') return empty

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (stored?.today || stored?.week || stored?.month || stored?.total) {
      return {
        today: normalizeScopeState(stored.today),
        week: normalizeScopeState(stored.week),
        month: normalizeScopeState(stored.month),
        total: normalizeScopeState(stored.total)
      }
    }

    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '{}')
    const legacyPending = Math.max(0, Number(legacy?.pendingSeconds) || 0)
    const legacyRemoteTotal = Number(legacy?.lastRemoteTotalSeconds)
    if (legacyPending > 0 || Number.isFinite(legacyRemoteTotal)) {
      return {
        today: { pendingSeconds: legacyPending },
        week: { pendingSeconds: legacyPending },
        month: { pendingSeconds: legacyPending },
        total: {
          pendingSeconds: legacyPending,
          lastRemoteSeconds:
            Number.isFinite(legacyRemoteTotal) && legacyRemoteTotal >= 0
              ? legacyRemoteTotal
              : undefined
        }
      }
    }
  } catch (error) {
    console.warn('[NetEaseListenPending] 读取待同步听歌时长失败：', error)
  }

  return empty
}

const state = readState()

export const pendingNeteaseListenByScope = {
  today: ref(state.today.pendingSeconds),
  week: ref(state.week.pendingSeconds),
  month: ref(state.month.pendingSeconds),
  total: ref(state.total.pendingSeconds)
}

const lastRemoteSeconds: Record<NeteaseListenScope, number | undefined> = {
  today: state.today.lastRemoteSeconds,
  week: state.week.lastRemoteSeconds,
  month: state.month.lastRemoteSeconds,
  total: state.total.lastRemoteSeconds
}

export const pendingNeteaseListenSeconds = computed(() =>
  Math.max(
    pendingNeteaseListenByScope.today.value,
    pendingNeteaseListenByScope.week.value,
    pendingNeteaseListenByScope.month.value,
    pendingNeteaseListenByScope.total.value
  )
)

let lastPersistAt = 0

const persist = (force = false): void => {
  if (typeof localStorage === 'undefined') return
  const now = Date.now()
  if (!force && now - lastPersistAt < PERSIST_INTERVAL_MS) return

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        today: {
          pendingSeconds: Math.max(0, pendingNeteaseListenByScope.today.value),
          lastRemoteSeconds: lastRemoteSeconds.today
        },
        week: {
          pendingSeconds: Math.max(0, pendingNeteaseListenByScope.week.value),
          lastRemoteSeconds: lastRemoteSeconds.week
        },
        month: {
          pendingSeconds: Math.max(0, pendingNeteaseListenByScope.month.value),
          lastRemoteSeconds: lastRemoteSeconds.month
        },
        total: {
          pendingSeconds: Math.max(0, pendingNeteaseListenByScope.total.value),
          lastRemoteSeconds: lastRemoteSeconds.total
        }
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

  pendingNeteaseListenByScope.today.value += value
  pendingNeteaseListenByScope.week.value += value
  pendingNeteaseListenByScope.month.value += value
  pendingNeteaseListenByScope.total.value += value
  persist()
}

export const flushPendingNeteaseListenSeconds = (): void => {
  persist(true)
}

const reconcileScope = (scope: NeteaseListenScope, remoteSeconds?: number): void => {
  const next = Number(remoteSeconds)
  if (!Number.isFinite(next) || next < 0) return

  const previous = lastRemoteSeconds[scope]
  if (previous !== undefined) {
    if (next > previous) {
      const syncedSeconds = next - previous
      pendingNeteaseListenByScope[scope].value = Math.max(
        0,
        pendingNeteaseListenByScope[scope].value - syncedSeconds
      )
    } else if (next < previous && scope !== 'total') {
      pendingNeteaseListenByScope[scope].value = 0
    }
  }

  lastRemoteSeconds[scope] = next
}

/**
 * 分别使用今日/本周/本月/累计四个远端统计抵扣对应的本机补偿。
 *
 * 网易云不同统计端点的聚合时机并不一致。累计值可能先更新，而周/月实时报告
 * 仍是旧值；因此不能再用累计值一次性清空所有 pending。
 */
export const reconcileNeteaseRemoteDurations = (durations: {
  today?: number
  week?: number
  month?: number
  total?: number
}): void => {
  reconcileScope('today', durations.today)
  reconcileScope('week', durations.week)
  reconcileScope('month', durations.month)
  reconcileScope('total', durations.total)
  persist(true)
}
