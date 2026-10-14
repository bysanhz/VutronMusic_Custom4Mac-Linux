import { ref } from 'vue'
import type { ScrobbleParams } from '../api/track'

export type NeteaseListenEntryStatus = 'pending' | 'sending' | 'accepted'

export type NeteaseListenEntry = {
  id: string
  accountId: string
  sessionId: string
  dateKey: string
  startedAt: number
  endedAt: number
  seconds: number
  confirmedByPeriod: Record<string, number>
  /** @deprecated 兼容 v3 早期账本；新代码按报表周期分别确认。 */
  confirmedSeconds: number
  status: NeteaseListenEntryStatus
  params: ScrobbleParams
  createdAt: number
  updatedAt: number
  acceptedAt?: number
  attempts: number
  nextRetryAt: number
  lastError?: string
}

type ReportObservation = { seconds: number; observedAt: number }

type LedgerState = {
  entries: NeteaseListenEntry[]
  remoteBaselines: Record<string, number>
  remoteObservations: Record<string, ReportObservation>
}

export type RecordSegmentInput = {
  accountId: string
  sessionId: string
  startedAt: number
  endedAt: number
  seconds: number
  params: ScrobbleParams
}

const STORAGE_KEY = 'vutronmusic-netease-listen-ledger-v3'
const LEGACY_OUTBOX_KEY = 'vutronmusic-netease-scrobble-outbox-v1'
const MAX_ENTRIES = 2000
const CONFIRMED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const PERSIST_INTERVAL_MS = 5000
const MIN_RETRY_MS = 15_000
const MAX_RETRY_MS = 30 * 60_000

const canReadLocalStorage = (): boolean =>
  typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'

const canWriteLocalStorage = (): boolean =>
  canReadLocalStorage() && typeof localStorage.setItem === 'function'

const normalizeAccountId = (value: unknown): string => {
  const accountId = String(value ?? '').trim()
  return accountId && accountId !== '0' ? accountId : 'anonymous'
}

export const localDateKey = (value: number | Date): string => {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const nextLocalMidnight = (timestamp: number): number => {
  const date = new Date(timestamp)
  date.setHours(24, 0, 0, 0)
  return date.getTime()
}

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const sanitizeEntry = (value: any): NeteaseListenEntry | null => {
  const seconds = Math.max(0, Number(value?.seconds) || 0)
  const trackId = Number(value?.params?.id)
  if (!value?.id || !value?.sessionId || seconds <= 0 || !Number.isFinite(trackId)) return null

  const status: NeteaseListenEntryStatus =
    value.status === 'accepted' ? 'accepted' : value.status === 'sending' ? 'pending' : 'pending'
  const confirmedSeconds = Math.min(seconds, Math.max(0, Number(value.confirmedSeconds) || 0))
  const confirmedByPeriod =
    value.confirmedByPeriod && typeof value.confirmedByPeriod === 'object'
      ? Object.fromEntries(
          Object.entries(value.confirmedByPeriod).map(([key, amount]) => [
            key,
            Math.min(seconds, Math.max(0, Number(amount) || 0))
          ])
        )
      : {}
  const startedAt = Number(value.startedAt) || Number(value.createdAt) || Date.now()
  const endedAt = Math.max(startedAt, Number(value.endedAt) || startedAt)

  return {
    ...value,
    accountId: normalizeAccountId(value.accountId),
    dateKey: String(value.dateKey || localDateKey(startedAt)),
    startedAt,
    endedAt,
    seconds,
    confirmedByPeriod,
    confirmedSeconds,
    status,
    params: { ...value.params, time: seconds, segmentId: String(value.id) },
    createdAt: Number(value.createdAt) || startedAt,
    updatedAt: Number(value.updatedAt) || endedAt,
    attempts: Math.max(0, Number(value.attempts) || 0),
    nextRetryAt: Math.max(0, Number(value.nextRetryAt) || 0)
  }
}

const readState = (): LedgerState => {
  if (!canReadLocalStorage()) return { entries: [], remoteBaselines: {}, remoteObservations: {} }
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      entries: Array.isArray(stored.entries)
        ? stored.entries.map(sanitizeEntry).filter(Boolean).slice(-MAX_ENTRIES)
        : [],
      remoteBaselines:
        stored.remoteBaselines && typeof stored.remoteBaselines === 'object'
          ? stored.remoteBaselines
          : {},
      remoteObservations:
        stored.remoteObservations && typeof stored.remoteObservations === 'object'
          ? stored.remoteObservations
          : {}
    } as LedgerState
  } catch {
    return { entries: [], remoteBaselines: {}, remoteObservations: {} }
  }
}

const state = readState()
export const neteaseListenEntries = ref<NeteaseListenEntry[]>(state.entries)
export const activeNeteaseListenAccountId = ref('anonymous')
export const provisionalNeteaseListen = ref({
  accountId: 'anonymous',
  startedAt: 0,
  endedAt: 0,
  seconds: 0,
  segments: [] as Array<{ startedAt: number; endedAt: number; seconds: number }>
})

let remoteBaselines = state.remoteBaselines
let remoteObservations = state.remoteObservations
let lastPersistAt = 0
let legacyMigrationAttempted = false

export const hasNeteaseListenReportBaseline = (accountId: unknown, periodKey: string): boolean =>
  Number.isFinite(Number(remoteBaselines[`${normalizeAccountId(accountId)}:${periodKey}`]))

const pruneEntries = (entries: NeteaseListenEntry[]): NeteaseListenEntry[] => {
  const cutoff = Date.now() - CONFIRMED_RETENTION_MS
  return entries
    .filter((entry) => entry.status !== 'accepted' || entry.updatedAt >= cutoff)
    .slice(-MAX_ENTRIES)
}

export const flushNeteaseListenLedger = (force = false): void => {
  if (!canWriteLocalStorage()) return
  const now = Date.now()
  if (!force && now - lastPersistAt < PERSIST_INTERVAL_MS) return
  neteaseListenEntries.value = pruneEntries(neteaseListenEntries.value)
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ entries: neteaseListenEntries.value, remoteBaselines, remoteObservations })
    )
    lastPersistAt = now
  } catch (error) {
    console.warn('[NetEaseListenLedger] 保存本机听歌账本失败：', error)
  }
}

const migrateLegacyOutbox = (accountId: string): void => {
  if (legacyMigrationAttempted || accountId === 'anonymous' || !canReadLocalStorage()) {
    return
  }
  legacyMigrationAttempted = true
  try {
    const legacyJobs = JSON.parse(localStorage.getItem(LEGACY_OUTBOX_KEY) || '[]')
    if (!Array.isArray(legacyJobs) || !legacyJobs.length) return
    const entries = [...neteaseListenEntries.value]
    for (const job of legacyJobs) {
      const seconds = Math.max(0, Number(job?.params?.time) || 0)
      const trackId = Number(job?.params?.id)
      if (!job?.id || seconds <= 0 || !Number.isFinite(trackId)) continue
      if (entries.some((entry) => entry.id === String(job.id))) continue
      const createdAt = Number(job.createdAt) || Date.now()
      entries.push({
        id: String(job.id),
        accountId,
        sessionId: `legacy:${job.id}`,
        dateKey: localDateKey(createdAt),
        startedAt: createdAt,
        endedAt: createdAt,
        seconds,
        confirmedByPeriod: {},
        confirmedSeconds: 0,
        status: 'pending',
        params: {
          ...job.params,
          time: seconds,
          playedAt: job.params?.playedAt ?? createdAt,
          segmentId: String(job.id)
        },
        createdAt,
        updatedAt: createdAt,
        attempts: 0,
        nextRetryAt: 0
      })
    }
    neteaseListenEntries.value = entries
    flushNeteaseListenLedger(true)
    if (typeof localStorage.removeItem === 'function') localStorage.removeItem(LEGACY_OUTBOX_KEY)
  } catch (error) {
    console.warn('[NetEaseListenLedger] 迁移旧重试队列失败：', error)
  }
}

export const setActiveNeteaseListenAccount = (accountId: unknown): void => {
  const normalized = normalizeAccountId(accountId)
  activeNeteaseListenAccountId.value = normalized
  migrateLegacyOutbox(normalized)
}

export const setProvisionalNeteaseListen = (input?: {
  accountId: unknown
  startedAt: number
  endedAt: number
  seconds: number
  segments?: Array<{ startedAt: number; endedAt: number; seconds: number }>
}): void => {
  if (!input || !Number.isFinite(input.seconds) || input.seconds <= 0) {
    provisionalNeteaseListen.value = {
      accountId: activeNeteaseListenAccountId.value,
      startedAt: 0,
      endedAt: 0,
      seconds: 0,
      segments: []
    }
    return
  }
  provisionalNeteaseListen.value = {
    accountId: normalizeAccountId(input.accountId),
    startedAt: input.startedAt,
    endedAt: Math.max(input.startedAt, input.endedAt),
    seconds: Math.max(0, input.seconds),
    segments: Array.isArray(input.segments) ? input.segments : []
  }
}

export const splitNeteaseListenSegmentByLocalDay = (
  input: RecordSegmentInput
): RecordSegmentInput[] => {
  const startedAt = Math.min(input.startedAt, input.endedAt)
  const endedAt = Math.max(input.startedAt, input.endedAt)
  const wallDuration = Math.max(1, endedAt - startedAt)
  const result: RecordSegmentInput[] = []
  let cursor = startedAt
  let allocatedSeconds = 0

  while (cursor < endedAt) {
    const sliceEnd = Math.min(endedAt, nextLocalMidnight(cursor))
    const isLast = sliceEnd >= endedAt
    const seconds = isLast
      ? Math.max(0, input.seconds - allocatedSeconds)
      : input.seconds * ((sliceEnd - cursor) / wallDuration)
    allocatedSeconds += seconds
    result.push({ ...input, startedAt: cursor, endedAt: sliceEnd, seconds })
    cursor = sliceEnd
  }

  if (!result.length) result.push({ ...input, startedAt, endedAt, seconds: input.seconds })
  return result
}

export const recordNeteaseListenSegment = (input: RecordSegmentInput): NeteaseListenEntry[] => {
  if (!Number.isFinite(input.seconds) || input.seconds <= 0) return []
  const accountId = normalizeAccountId(input.accountId)
  const recorded: NeteaseListenEntry[] = []
  const entries = [...neteaseListenEntries.value]

  for (const slice of splitNeteaseListenSegmentByLocalDay(input)) {
    if (slice.seconds <= 0) continue
    const dateKey = localDateKey(slice.startedAt)
    let entry = entries.find(
      (item) =>
        item.accountId === accountId &&
        item.sessionId === slice.sessionId &&
        item.dateKey === dateKey &&
        item.status === 'pending'
    )

    if (entry) {
      const nextSeconds = entry.seconds + slice.seconds
      entry = {
        ...entry,
        endedAt: Math.max(entry.endedAt, slice.endedAt),
        seconds: nextSeconds,
        updatedAt: Date.now(),
        params: { ...entry.params, time: nextSeconds }
      }
      entries.splice(
        entries.findIndex((item) => item.id === entry!.id),
        1,
        entry
      )
    } else {
      const id = createId()
      const now = Date.now()
      entry = {
        id,
        accountId,
        sessionId: slice.sessionId,
        dateKey,
        startedAt: slice.startedAt,
        endedAt: slice.endedAt,
        seconds: slice.seconds,
        confirmedByPeriod: {},
        confirmedSeconds: 0,
        status: 'pending',
        params: {
          ...slice.params,
          time: slice.seconds,
          playedAt: slice.startedAt,
          segmentId: id
        },
        createdAt: now,
        updatedAt: now,
        attempts: 0,
        nextRetryAt: 0
      }
      entries.push(entry)
    }
    recorded.push(entry)
  }

  neteaseListenEntries.value = entries
  flushNeteaseListenLedger()
  return recorded
}

export const claimPendingNeteaseListenEntries = (options: {
  accountId: unknown
  sessionId?: string
  excludeSessionId?: string
  force?: boolean
}): NeteaseListenEntry[] => {
  const accountId = normalizeAccountId(options.accountId)
  const now = Date.now()
  const claimed: NeteaseListenEntry[] = []
  neteaseListenEntries.value = neteaseListenEntries.value.map((entry) => {
    const eligible =
      entry.accountId === accountId &&
      entry.status === 'pending' &&
      (!options.sessionId || entry.sessionId === options.sessionId) &&
      (!options.excludeSessionId || entry.sessionId !== options.excludeSessionId) &&
      (options.force || entry.nextRetryAt <= now)
    if (!eligible) return entry
    const next = { ...entry, status: 'sending' as const, updatedAt: now }
    claimed.push(next)
    return next
  })
  if (claimed.length) flushNeteaseListenLedger(true)
  return claimed
}

export const markNeteaseListenEntryAccepted = (entryId: string): void => {
  const now = Date.now()
  neteaseListenEntries.value = neteaseListenEntries.value.map((entry) =>
    entry.id === entryId
      ? { ...entry, status: 'accepted', acceptedAt: now, updatedAt: now, lastError: undefined }
      : entry
  )
  flushNeteaseListenLedger(true)
}

export const markNeteaseListenEntryFailed = (entryId: string, error: unknown): void => {
  const now = Date.now()
  neteaseListenEntries.value = neteaseListenEntries.value.map((entry) => {
    if (entry.id !== entryId) return entry
    const attempts = entry.attempts + 1
    const retryDelay = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** Math.min(attempts - 1, 7))
    return {
      ...entry,
      status: 'pending',
      attempts,
      nextRetryAt: now + retryDelay,
      updatedAt: now,
      lastError: error instanceof Error ? error.message : String(error || 'unknown error')
    }
  })
  flushNeteaseListenLedger(true)
}

const overlapsRange = (entry: { startedAt: number; endedAt: number }, start: number, end: number) =>
  Math.max(entry.endedAt, entry.startedAt + 1) > start && entry.startedAt <= end

/** Discard accepted local backlog without touching unsent, provisional or other-account listens. */
export const clearAcceptedNeteaseListenEntries = (options: {
  accountId: unknown
  rangeStart: number
  rangeEnd: number
  periodKey: string
}): number => {
  const accountId = normalizeAccountId(options.accountId)
  let cleared = 0
  neteaseListenEntries.value = neteaseListenEntries.value.filter((entry) => {
    const selected =
      entry.accountId === accountId &&
      entry.status === 'accepted' &&
      overlapsRange(entry, options.rangeStart, options.rangeEnd) &&
      entry.seconds > (Number(entry.confirmedByPeriod?.[options.periodKey]) || 0)
    if (selected) cleared += 1
    return !selected
  })
  if (cleared > 0) flushNeteaseListenLedger(true)
  return cleared
}

const secondsInsideRange = (
  segment: { startedAt: number; endedAt: number; seconds: number },
  start: number,
  end: number
): number => {
  if (!overlapsRange(segment, start, end)) return 0
  const duration = Math.max(1, segment.endedAt - segment.startedAt)
  const overlap = Math.max(
    0,
    Math.min(segment.endedAt, end + 1) - Math.max(segment.startedAt, start)
  )
  return Math.max(0, segment.seconds) * Math.min(1, overlap / duration)
}

export const getNeteaseListenLedgerTotals = (
  accountIdValue: unknown,
  start = Number.NEGATIVE_INFINITY,
  end = Number.POSITIVE_INFINITY,
  periodKey = ''
): { pending: number; accepted: number; provisional: number } => {
  const accountId = normalizeAccountId(accountIdValue)
  let pending = 0
  let accepted = 0
  for (const entry of neteaseListenEntries.value) {
    if (entry.accountId !== accountId || !overlapsRange(entry, start, end)) continue
    const confirmed = periodKey
      ? Number(entry.confirmedByPeriod?.[periodKey]) || 0
      : entry.confirmedSeconds
    const remaining = Math.max(0, entry.seconds - confirmed)
    if (entry.status === 'accepted') accepted += remaining
    else pending += remaining
  }

  const provisionalValue = provisionalNeteaseListen.value
  const provisional =
    provisionalValue.accountId !== accountId
      ? 0
      : provisionalValue.segments.length
        ? provisionalValue.segments.reduce(
            (total, segment) => total + secondsInsideRange(segment, start, end),
            0
          )
        : overlapsRange(provisionalValue, start, end)
          ? provisionalValue.seconds
          : 0
  return { pending, accepted, provisional }
}

export const reconcileNeteaseListenReport = (options: {
  accountId: unknown
  periodKey: string
  rangeStart: number
  rangeEnd: number
  remoteSeconds?: number
  /** Only set for a day that has ended in the local time zone. */
  finalizedDay?: boolean
}): void => {
  const remoteSeconds = Number(options.remoteSeconds)
  if (!Number.isFinite(remoteSeconds) || remoteSeconds < 0) return
  const accountId = normalizeAccountId(options.accountId)
  const baselineKey = `${accountId}:${options.periodKey}`
  const previous = Number(remoteBaselines[baselineKey])
  let growth = Number.isFinite(previous) ? Math.max(0, remoteSeconds - previous) : 0
  const entries = [...neteaseListenEntries.value]
  let changed = false

  if (growth > 0) {
    for (let index = 0; index < entries.length && growth > 0; index += 1) {
      const entry = entries[index]
      if (
        entry.accountId !== accountId ||
        entry.status !== 'accepted' ||
        !overlapsRange(entry, options.rangeStart, options.rangeEnd)
      ) {
        continue
      }
      const periodConfirmed = Number(entry.confirmedByPeriod?.[options.periodKey]) || 0
      const remaining = Math.max(0, entry.seconds - periodConfirmed)
      if (remaining <= 0) continue
      const confirmed = Math.min(remaining, growth)
      const nextConfirmed = periodConfirmed + confirmed
      growth -= confirmed
      entries[index] = {
        ...entry,
        // 报表只有分钟精度；同一条记录只剩不足一分钟时，保留原始秒数但结束 UI 补偿。
        confirmedByPeriod: {
          ...entry.confirmedByPeriod,
          [options.periodKey]:
            remaining - confirmed < 60 && confirmed > 0 ? entry.seconds : nextConfirmed
        },
        updatedAt: Date.now()
      }
      changed = true
    }
  }

  const dayKey = options.periodKey.startsWith('today:') ? options.periodKey.slice(6) : ''
  if (options.finalizedDay && /^\d{4}-\d{2}-\d{2}$/.test(dayKey) && remoteSeconds > 0) {
    const acceptedForDay = entries.filter(
      (entry) =>
        entry.accountId === accountId && entry.status === 'accepted' && entry.dateKey === dayKey
    )
    const acceptedIds = new Set(acceptedForDay.map((entry) => entry.id))
    const localSeconds = acceptedForDay.reduce((total, entry) => total + entry.seconds, 0)
    // A first successful read may arrive after the uploads and therefore have no usable
    // growth baseline. For a closed day, a near-equal absolute daily total is additional
    // evidence that those uploads reached the report. Allow at most two minutes for the
    // report's minute precision; never infer a match from a substantially different day.
    const roundingAllowance = Math.min(120, localSeconds * 0.02)
    if (localSeconds > 0 && Math.abs(remoteSeconds - localSeconds) <= roundingAllowance) {
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]
        if (!acceptedIds.has(entry.id)) continue
        if ((Number(entry.confirmedByPeriod[options.periodKey]) || 0) >= entry.seconds) continue
        entries[index] = {
          ...entry,
          confirmedByPeriod: { ...entry.confirmedByPeriod, [options.periodKey]: entry.seconds },
          updatedAt: Date.now()
        }
        changed = true
      }
    }
  }

  // The day and month cards describe the same uploaded segments. Previously,
  // confirmation flowed only day -> month. If the month report advanced while
  // durationDetails for today remained stale, an accepted segment would stay
  // amber forever in the UI despite a month-period confirmation.
  //
  // Only propagate evidence for the same segment between its OWN day and month
  // (and the total view); never use an unrelated aggregate or a receipt alone
  // to mark an upload confirmed. This also repairs older persisted ledgers.
  const month = options.periodKey.startsWith('month:')
    ? options.periodKey.slice(6)
    : /^\d{4}-\d{2}-\d{2}$/.test(dayKey)
      ? dayKey.slice(0, 7)
      : ''
  if (/^\d{4}-\d{2}$/.test(month)) {
    const monthKey = `month:${month}`
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      if (
        entry.accountId !== accountId ||
        entry.status !== 'accepted' ||
        !entry.dateKey.startsWith(month)
      ) {
        continue
      }

      const todayKey = `today:${entry.dateKey}`
      const dailyConfirmed = Number(entry.confirmedByPeriod[todayKey]) || 0
      const monthConfirmed = Number(entry.confirmedByPeriod[monthKey]) || 0
      const totalConfirmed = Number(entry.confirmedByPeriod.total) || 0
      const corroborated = Math.min(entry.seconds, Math.max(dailyConfirmed, monthConfirmed))
      if (
        corroborated <= dailyConfirmed &&
        corroborated <= monthConfirmed &&
        corroborated <= totalConfirmed
      ) {
        continue
      }

      entries[index] = {
        ...entry,
        confirmedByPeriod: {
          ...entry.confirmedByPeriod,
          [todayKey]: Math.max(dailyConfirmed, corroborated),
          [monthKey]: Math.max(monthConfirmed, corroborated),
          total: Math.max(totalConfirmed, corroborated)
        },
        updatedAt: Date.now()
      }
      changed = true
    }
  }
  // 同一周期内的报表应当单调增长。接口偶发返回 0 或旧缓存时不回退基线，
  // 否则下一次恢复正常会被误判为一大段“新增远端时长”。
  const nextBaseline = Number.isFinite(previous) ? Math.max(previous, remoteSeconds) : remoteSeconds
  if (changed) neteaseListenEntries.value = entries
  if (changed || nextBaseline !== previous) {
    remoteBaselines = { ...remoteBaselines, [baselineKey]: nextBaseline }
  }
  // Record the latest VALID server reading independently of the historical
  // high-water mark. A stale/corrected report can move backwards: that is a
  // reconciliation warning, not evidence to mark local listens as confirmed.
  const observed = remoteObservations[baselineKey]
  const now = Date.now()
  const observationChanged =
    !observed || observed.seconds !== remoteSeconds || now - observed.observedAt >= 5 * 60_000
  if (observationChanged) {
    remoteObservations = {
      ...remoteObservations,
      [baselineKey]: { seconds: remoteSeconds, observedAt: now }
    }
  }
  if (changed || nextBaseline !== previous || observationChanged) {
    flushNeteaseListenLedger(true)
  }
}

/**
 * Report readings and optimistic confirmation baselines are intentionally
 * separate. Never decrement the high-water mark on a transient server rollback,
 * since its rebound could otherwise falsely clear accepted upload receipts.
 */
export const getNeteaseListenReportStatus = (accountIdValue: unknown, periodKey: string) => {
  const key = `${normalizeAccountId(accountIdValue)}:${periodKey}`
  const observed = remoteObservations[key]
  const highWater = Number(remoteBaselines[key])
  const latest = Number(observed?.seconds)
  return {
    highWaterSeconds: Number.isFinite(highWater) ? highWater : null,
    latestReportedSeconds: observed && Number.isFinite(latest) ? latest : null,
    lastObservedAt: observed?.observedAt || null,
    regressionSeconds:
      observed && Number.isFinite(highWater) && Number.isFinite(latest)
        ? Math.max(0, highWater - latest)
        : 0
  }
}

/**
 * Diagnostic-only summary for the current month. Avoids account IDs, song
 * titles, source URLs, auth headers and locally stored error strings.
 *
 * The API receipt ("accepted") is distinct from a verified remote report.
 * Do not infer remote confirmation from the age of an accepted entry.
 */
export const getNeteaseListenSyncDiagnostics = (accountIdValue: unknown) => {
  const accountId = normalizeAccountId(accountIdValue)
  const now = Date.now()
  const today = localDateKey(now)
  const month = today.slice(0, 7)
  let pendingSeconds = 0
  let acceptedSeconds = 0
  let pendingEntries = 0
  let acceptedEntries = 0
  let failedEntries = 0
  let oldestAcceptedAt = now
  const acceptedByDay = new Map<
    string,
    { entries: number; seconds: number; oldestAcceptedAt: number }
  >()

  for (const entry of neteaseListenEntries.value) {
    if (entry.accountId !== accountId || !entry.dateKey.startsWith(month)) continue
    const periodKey =
      entry.dateKey === today ? `today:${today}` : `month:${month}`
    const confirmed = Number(entry.confirmedByPeriod?.[periodKey]) || 0
    const remaining = Math.max(0, entry.seconds - confirmed)
    if (remaining <= 0) continue
    if (entry.status === 'accepted') {
      acceptedSeconds += remaining
      acceptedEntries += 1
      const acceptedAt = entry.acceptedAt || entry.endedAt
      oldestAcceptedAt = Math.min(oldestAcceptedAt, acceptedAt)
      const day = acceptedByDay.get(entry.dateKey) || {
        entries: 0,
        seconds: 0,
        oldestAcceptedAt: now
      }
      day.entries += 1
      day.seconds += remaining
      day.oldestAcceptedAt = Math.min(day.oldestAcceptedAt, acceptedAt)
      acceptedByDay.set(entry.dateKey, day)
    } else {
      pendingSeconds += remaining
      pendingEntries += 1
      if (entry.attempts > 0) failedEntries += 1
    }
  }

  const monthReport = getNeteaseListenReportStatus(accountId, `month:${month}`)
  const todayReport = getNeteaseListenReportStatus(accountId, `today:${today}`)
  // Daily report evidence is much more informative than a fluctuating monthly
  // aggregate. Export only bounded per-day totals, not individual song details
  // or account identifiers.
  const acceptedDayReports = Array.from(acceptedByDay.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 14)
    .map(([dateKey, day]) => {
      const report = getNeteaseListenReportStatus(accountId, `today:${dateKey}`)
      return {
        date: dateKey,
        acceptedEntries: day.entries,
        acceptedSeconds: Math.round(day.seconds),
        oldestAcceptedAgeMinutes: Math.floor(
          Math.max(0, now - day.oldestAcceptedAt) / 60_000
        ),
        dayReportBaselineSeconds: report.highWaterSeconds,
        dayReportLatestSeconds: report.latestReportedSeconds,
        dayReportRegressionSeconds: report.regressionSeconds,
        dayReportObservedAt: report.lastObservedAt
      }
    })
  const provisional =
    provisionalNeteaseListen.value.accountId === accountId
      ? provisionalNeteaseListen.value.seconds
      : 0
  return {
    pendingEntries,
    pendingSeconds: Math.round(pendingSeconds + provisional),
    acceptedEntries,
    acceptedSeconds: Math.round(acceptedSeconds),
    failedPendingEntries: failedEntries,
    oldestAcceptedAgeMinutes:
      acceptedEntries > 0 ? Math.floor(Math.max(0, now - oldestAcceptedAt) / 60_000) : 0,
    monthBaselineSeconds: monthReport.highWaterSeconds,
    todayBaselineSeconds: todayReport.highWaterSeconds,
    monthLatestReportedSeconds: monthReport.latestReportedSeconds,
    monthReportRegressionSeconds: monthReport.regressionSeconds,
    monthReportObservedAt: monthReport.lastObservedAt,
    todayLatestReportedSeconds: todayReport.latestReportedSeconds,
    acceptedDayReports
  }
}

export const hasPendingNeteaseListenEntries = (accountId: unknown): boolean => {
  const normalized = normalizeAccountId(accountId)
  return neteaseListenEntries.value.some(
    (entry) => entry.accountId === normalized && entry.status === 'pending'
  )
}
