import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  clearAcceptedNeteaseListenEntries,
  claimPendingNeteaseListenEntries,
  getNeteaseListenLedgerTotals,
  flushNeteaseListenLedger,
  recoverNeteaseListenLedgerBackup,
  getNeteaseHistoricalReplayPreview,
  getNeteaseHistoricalReplayDiagnostics,
  getNeteaseListenSyncDiagnostics,
  getNeteaseListenReportStatus,
  hasNeteaseListenReportBaseline,
  localDateKey,
  markNeteaseListenEntryAccepted,
  markNeteaseListenEntryFailed,
  neteaseListenEntries,
  reconcileNeteaseListenReport,
  recordNeteaseListenSegment,
  stageNeteaseHistoricalReplay,
  setProvisionalNeteaseListen,
  splitNeteaseListenSegmentByLocalDay
} from '../src/renderer/utils/neteaseListenLedger'
import { splitNeteaseSyncStatusByDay } from '../src/renderer/utils/neteaseSyncStatus'

const params = {
  id: 123,
  sourceid: 456,
  total: 240,
  name: 'Test Track',
  artist: 'Test Artist'
}

test.beforeEach(() => {
  neteaseListenEntries.value = []
  setProvisionalNeteaseListen()
})

test('attributes provisional playback by real spans instead of pause gaps', () => {
  const dayOneStart = new Date(2026, 8, 23, 0, 0, 0).getTime()
  const dayTwoStart = new Date(2026, 8, 24, 0, 0, 0).getTime()
  const dayTwoEnd = new Date(2026, 8, 24, 23, 59, 59, 999).getTime()
  setProvisionalNeteaseListen({
    accountId: 'account-a',
    startedAt: dayTwoStart - 20_000,
    endedAt: dayTwoStart + 10_000,
    seconds: 30,
    segments: [
      { startedAt: dayTwoStart - 20_000, endedAt: dayTwoStart, seconds: 20 },
      { startedAt: dayTwoStart, endedAt: dayTwoStart + 10_000, seconds: 10 }
    ]
  })

  expect(
    getNeteaseListenLedgerTotals('account-a', dayOneStart, dayTwoStart - 1).provisional
  ).toBeCloseTo(20)
  expect(getNeteaseListenLedgerTotals('account-a', dayTwoStart, dayTwoEnd).provisional).toBeCloseTo(
    10
  )
})

test('splits one playback interval across the local midnight boundary', () => {
  const startedAt = new Date(2026, 8, 23, 23, 59, 30).getTime()
  const endedAt = new Date(2026, 8, 24, 0, 0, 30).getTime()
  const slices = splitNeteaseListenSegmentByLocalDay({
    accountId: 'account-a',
    sessionId: 'session-a',
    startedAt,
    endedAt,
    seconds: 120,
    params
  })

  expect(slices).toHaveLength(2)
  expect(slices[0].seconds).toBeCloseTo(60)
  expect(slices[1].seconds).toBeCloseTo(60)
})

test('does not label an earlier day of accepted listening as newly accumulated today', () => {
  const yesterdayStart = new Date(2026, 8, 29, 20, 0, 0).getTime()
  const todayStart = new Date(2026, 8, 30, 0, 0, 0).getTime()
  const monthStart = new Date(2026, 8, 1, 0, 0, 0).getTime()
  const monthEnd = new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
  const previous = recordNeteaseListenSegment({
    accountId: 'account-a',
    sessionId: 'yesterday',
    startedAt: yesterdayStart,
    endedAt: yesterdayStart + 7_951_000,
    seconds: 7_951,
    params
  })
  markNeteaseListenEntryAccepted(previous[0].id)
  recordNeteaseListenSegment({
    accountId: 'account-a',
    sessionId: 'today',
    startedAt: todayStart + 10_000,
    endedAt: todayStart + 21_000,
    seconds: 11,
    params
  })

  const today = getNeteaseListenLedgerTotals('account-a', todayStart, monthEnd)
  const earlier = getNeteaseListenLedgerTotals('account-a', monthStart, todayStart - 1)
  expect(splitNeteaseSyncStatusByDay(today, earlier)).toEqual({
    todayPending: 11,
    todayAccepted: 0,
    earlierPending: 0,
    earlierAccepted: 7_951
  })
})

test('uses daily report confirmation for the month even when the month total drops', () => {
  const accountId = 'daily-confirmation-probe'
  const dayStart = new Date(2026, 9, 8).getTime()
  const monthStart = new Date(2026, 9, 1).getTime()
  const dayEnd = dayStart + 86_400_000 - 1
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId: 'today-session',
    startedAt: dayStart + 60_000,
    endedAt: dayStart + 180_000,
    seconds: 120,
    params
  })
  markNeteaseListenEntryAccepted(entry.id)

  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'month:2026-10',
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 2000
  })
  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'today:2026-10-08',
    rangeStart: dayStart,
    rangeEnd: dayEnd,
    remoteSeconds: 1000
  })
  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'today:2026-10-08',
    rangeStart: dayStart,
    rangeEnd: dayEnd,
    remoteSeconds: 1120
  })

  expect(
    getNeteaseListenLedgerTotals(accountId, dayStart, dayEnd, 'today:2026-10-08').accepted
  ).toBe(0)
  expect(
    getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, 'month:2026-10').accepted
  ).toBe(0)
  expect(getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, 'total').accepted).toBe(0)

  // Existing local ledgers can have daily confirmation without the month/total fields.
  neteaseListenEntries.value = neteaseListenEntries.value.map((item) =>
    item.id === entry.id ? { ...item, confirmedByPeriod: { 'today:2026-10-08': 120 } } : item
  )
  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'month:2026-10',
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 1500
  })
  expect(
    getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, 'month:2026-10').accepted
  ).toBe(0)
})

test('uses a month-report confirmation for the same segment when todays details lag', () => {
  const accountId = 'month-ahead-of-today'
  const dayStart = new Date(2026, 9, 13).getTime()
  const dayEnd = new Date(2026, 9, 14).getTime() - 1
  const monthStart = new Date(2026, 9, 1).getTime()
  const periodKey = 'month:2026-10'
  const dayKey = 'today:2026-10-13'

  // Sample the remote baseline BEFORE the upload.
  reconcileNeteaseListenReport({
    accountId,
    periodKey,
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 3600
  })
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId: 'month-report-ahead',
    startedAt: dayStart + 60_000,
    endedAt: dayStart + 180_000,
    seconds: 120,
    params
  })
  markNeteaseListenEntryAccepted(entry.id)

  // Today's durationDetails has not advanced; only the month total has.
  reconcileNeteaseListenReport({
    accountId,
    periodKey: dayKey,
    rangeStart: dayStart,
    rangeEnd: dayEnd,
    remoteSeconds: 600
  })
  reconcileNeteaseListenReport({
    accountId,
    periodKey,
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 3720
  })

  expect(getNeteaseListenLedgerTotals(accountId, dayStart, dayEnd, dayKey).accepted).toBe(0)
  expect(getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, periodKey).accepted).toBe(0)
  expect(getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, 'total').accepted).toBe(0)
})

test('repairs legacy month-confirmed ledger entries without creating new confirmation', () => {
  const accountId = 'legacy-month-confirmed'
  const dayStart = new Date(2026, 9, 13).getTime()
  const dayEnd = new Date(2026, 9, 14).getTime() - 1
  const monthStart = new Date(2026, 9, 1).getTime()
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId: 'old-record',
    startedAt: dayStart + 60_000,
    endedAt: dayStart + 150_000,
    seconds: 90,
    params
  })
  markNeteaseListenEntryAccepted(entry.id)
  neteaseListenEntries.value = neteaseListenEntries.value.map((item) =>
    item.id === entry.id
      ? { ...item, confirmedByPeriod: { 'month:2026-10': 90 } }
      : item
  )

  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'month:2026-10',
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 4000
  })

  expect(
    getNeteaseListenLedgerTotals(accountId, dayStart, dayEnd, 'today:2026-10-13').accepted
  ).toBe(0)
  expect(getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, 'total').accepted).toBe(0)

  const unconfirmed = recordNeteaseListenSegment({
    accountId: 'no-growth-should-not-confirm',
    sessionId: 'no-growth',
    startedAt: dayStart + 180_000,
    endedAt: dayStart + 270_000,
    seconds: 90,
    params
  })[0]
  markNeteaseListenEntryAccepted(unconfirmed.id)
  reconcileNeteaseListenReport({
    accountId: 'no-growth-should-not-confirm',
    periodKey: 'month:2026-10',
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 5000
  })
  expect(
    getNeteaseListenLedgerTotals(
      'no-growth-should-not-confirm',
      dayStart,
      dayEnd,
      'today:2026-10-13'
    ).accepted
  ).toBe(90)
})

test('diagnoses aged upload receipts without pretending the remote report confirmed them', () => {
  const accountId = 'aged-accepted-receipt'
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 1, 0, 0)
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId: 'unconfirmed-receipt',
    startedAt: start.getTime(),
    endedAt: start.getTime() + 90_000,
    seconds: 90,
    params
  })
  markNeteaseListenEntryAccepted(entry.id)
  neteaseListenEntries.value = neteaseListenEntries.value.map((item) =>
    item.id === entry.id ? { ...item, acceptedAt: Date.now() - 15 * 60_000 } : item
  )
  const diagnostic = getNeteaseListenSyncDiagnostics(accountId)
  expect(diagnostic.acceptedSeconds).toBe(90)
  expect(diagnostic.acceptedEntries).toBe(1)
  expect(diagnostic.oldestAcceptedAgeMinutes).toBeGreaterThanOrEqual(14)
  expect(JSON.stringify(diagnostic)).not.toContain(accountId)
  expect(JSON.stringify(diagnostic)).not.toContain('Test Track')
})

test('includes daily report context for each unverified day without exposing account or track', () => {
  const accountId = 'diagnostic-per-day-audit'
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const dateKey = localDateKey(start)
  const rangeStart = start.getTime()
  const rangeEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime() - 1

  reconcileNeteaseListenReport({
    accountId,
    periodKey: `today:${dateKey}`,
    rangeStart,
    rangeEnd,
    remoteSeconds: 3600
  })

  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId: 'audit-one-day',
    startedAt: rangeStart + 60_000,
    endedAt: rangeStart + 150_000,
    seconds: 90,
    params
  })
  markNeteaseListenEntryAccepted(entry.id)

  const diagnostic = getNeteaseListenSyncDiagnostics(accountId)
  expect(diagnostic.acceptedDayReports).toHaveLength(1)
  expect(diagnostic.acceptedDayReports[0]).toMatchObject({
    date: dateKey,
    acceptedEntries: 1,
    acceptedSeconds: 90,
    dayReportBaselineSeconds: 3600,
    dayReportLatestSeconds: 3600,
    dayReportRegressionSeconds: 0
  })
  expect(JSON.stringify(diagnostic)).not.toContain(accountId)
  expect(JSON.stringify(diagnostic)).not.toContain('Test Track')
  expect(JSON.stringify(diagnostic)).not.toContain('Test Artist')
})

test('reports a falling monthly read without falsely confirming uploaded listening', () => {
  const accountId = 'monthly-rollback-observation'
  const month = 'month:2026-10'
  const monthStart = new Date(2026, 9, 1).getTime()
  const dayStart = new Date(2026, 9, 13).getTime()
  const dayEnd = new Date(2026, 9, 14).getTime() - 1
  const record = recordNeteaseListenSegment({
    accountId,
    sessionId: 'unverifiable-month',
    startedAt: dayStart + 60_000,
    endedAt: dayStart + 1_640_000,
    seconds: 1580,
    params
  })[0]
  markNeteaseListenEntryAccepted(record.id)

  reconcileNeteaseListenReport({
    accountId,
    periodKey: month,
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 185_520
  })
  reconcileNeteaseListenReport({
    accountId,
    periodKey: month,
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 181_320
  })

  expect(getNeteaseListenReportStatus(accountId, month)).toMatchObject({
    highWaterSeconds: 185_520,
    latestReportedSeconds: 181_320,
    regressionSeconds: 4200
  })
  expect(getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, month).accepted).toBe(1580)
  // Rebounding to the old high-water is not positive evidence.
  reconcileNeteaseListenReport({
    accountId,
    periodKey: month,
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 185_520
  })
  expect(getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, month).accepted).toBe(1580)
  const diagnosis = getNeteaseListenReportStatus(accountId, month)
  expect(diagnosis.regressionSeconds).toBe(0)
  expect(JSON.stringify(diagnosis)).not.toContain(accountId)
})

test('confirms a closed day from a near-equal daily total when the month baseline fell', () => {
  const accountId = 'closed-day-probe'
  const dayStart = new Date(2026, 9, 9).getTime()
  const dayEnd = new Date(2026, 9, 10).getTime() - 1
  const monthStart = new Date(2026, 9, 1).getTime()
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId: 'oct-9-session',
    startedAt: dayStart + 60_000,
    endedAt: dayStart + 16_252_000,
    seconds: 16_252,
    params
  })
  markNeteaseListenEntryAccepted(entry.id)

  // The old month baseline can exceed a subsequently recalculated report.
  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'month:2026-10',
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 185_520
  })
  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'today:2026-10-09',
    rangeStart: dayStart,
    rangeEnd: dayEnd,
    remoteSeconds: 12_900,
    finalizedDay: true
  })
  expect(
    getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, 'month:2026-10').accepted
  ).toBeGreaterThan(0)

  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'month:2026-10',
    rangeStart: monthStart,
    rangeEnd: dayEnd,
    remoteSeconds: 137_220
  })
  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'today:2026-10-09',
    rangeStart: dayStart,
    rangeEnd: dayEnd,
    remoteSeconds: 16_140,
    finalizedDay: true
  })

  expect(
    getNeteaseListenLedgerTotals(accountId, dayStart, dayEnd, 'today:2026-10-09').accepted
  ).toBe(0)
  expect(
    getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, 'month:2026-10').accepted
  ).toBe(0)
  expect(getNeteaseListenLedgerTotals(accountId, monthStart, dayEnd, 'total').accepted).toBe(0)
})

test('does not infer confirmation from a substantially different closed-day total', () => {
  const accountId = 'unmatched-day-probe'
  const dayStart = new Date(2026, 9, 9).getTime()
  const dayEnd = new Date(2026, 9, 10).getTime() - 1
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId: 'unmatched-session',
    startedAt: dayStart + 60_000,
    endedAt: dayStart + 3_600_000,
    seconds: 3_600,
    params
  })
  markNeteaseListenEntryAccepted(entry.id)
  reconcileNeteaseListenReport({
    accountId,
    periodKey: 'today:2026-10-09',
    rangeStart: dayStart,
    rangeEnd: dayEnd,
    remoteSeconds: 1_800,
    finalizedDay: true
  })
  expect(
    getNeteaseListenLedgerTotals(accountId, dayStart, dayEnd, 'today:2026-10-09').accepted
  ).toBe(3_600)
})

test('clears only this account’s accepted backlog and records fresh listening afterward', () => {
  const monthStart = new Date(2026, 8, 1, 0, 0, 0).getTime()
  const todayStart = new Date(2026, 8, 30, 0, 0, 0).getTime()
  const todayEnd = new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
  const add = (accountId: string, sessionId: string, startedAt: number, seconds: number) =>
    recordNeteaseListenSegment({
      accountId,
      sessionId,
      startedAt,
      endedAt: startedAt + seconds * 1000,
      seconds,
      params
    })[0]

  const oldAccepted = add('account-a', 'old', monthStart + 60_000, 240)
  const todayAccepted = add('account-a', 'today', todayStart + 60_000, 120)
  const alreadyConfirmed = add('account-a', 'confirmed', monthStart + 900_000, 90)
  const otherAccount = add('account-b', 'other-account', monthStart + 60_000, 60)
  const unsent = add('account-a', 'unsent', todayStart + 600_000, 45)
  markNeteaseListenEntryAccepted(oldAccepted.id)
  markNeteaseListenEntryAccepted(todayAccepted.id)
  markNeteaseListenEntryAccepted(alreadyConfirmed.id)
  markNeteaseListenEntryAccepted(otherAccount.id)
  neteaseListenEntries.value = neteaseListenEntries.value.map((entry) =>
    entry.id === alreadyConfirmed.id
      ? { ...entry, confirmedByPeriod: { 'month:2026-09': 90 } }
      : entry
  )

  expect(
    clearAcceptedNeteaseListenEntries({
      accountId: 'account-a',
      rangeStart: monthStart,
      rangeEnd: todayEnd,
      periodKey: 'month:2026-09'
    })
  ).toBe(2)
  expect(getNeteaseListenLedgerTotals('account-a', monthStart, todayEnd, 'month:2026-09')).toEqual({
    pending: 45,
    accepted: 0,
    provisional: 0
  })
  expect(neteaseListenEntries.value.find((entry) => entry.id === unsent.id)?.status).toBe('pending')
  expect(neteaseListenEntries.value.some((entry) => entry.id === alreadyConfirmed.id)).toBe(true)
  expect(
    getNeteaseListenLedgerTotals('account-b', monthStart, todayEnd, 'month:2026-09').accepted
  ).toBe(60)

  const fresh = add('account-a', 'new-after-clear', todayStart + 900_000, 30)
  expect(
    getNeteaseListenLedgerTotals('account-a', monthStart, todayEnd, 'month:2026-09').pending
  ).toBe(75)
  markNeteaseListenEntryAccepted(fresh.id)
  expect(
    getNeteaseListenLedgerTotals('account-a', monthStart, todayEnd, 'month:2026-09').accepted
  ).toBe(30)
})

test('clears the displayed today and earlier backlog using their own confirmation periods', () => {
  const monthStart = new Date(2026, 8, 1).getTime()
  const todayStart = new Date(2026, 8, 30).getTime()
  const todayEnd = new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
  const record = (sessionId: string, startedAt: number) =>
    recordNeteaseListenSegment({
      accountId: 'account-a',
      sessionId,
      startedAt,
      endedAt: startedAt + 90_000,
      seconds: 90,
      params
    })[0]
  const earlier = record('earlier', monthStart + 60_000)
  const today = record('today', todayStart + 60_000)
  markNeteaseListenEntryAccepted(earlier.id)
  markNeteaseListenEntryAccepted(today.id)
  neteaseListenEntries.value = neteaseListenEntries.value.map((entry) =>
    entry.id === today.id
      ? { ...entry, confirmedByPeriod: { 'month:2026-09': entry.seconds } }
      : entry
  )

  expect(
    getNeteaseListenLedgerTotals('account-a', todayStart, todayEnd, 'today:2026-09-30').accepted
  ).toBe(90)
  expect(
    getNeteaseListenLedgerTotals('account-a', monthStart, todayStart - 1, 'month:2026-09').accepted
  ).toBe(90)
  expect(
    clearAcceptedNeteaseListenEntries({
      accountId: 'account-a',
      rangeStart: todayStart,
      rangeEnd: todayEnd,
      periodKey: 'today:2026-09-30'
    })
  ).toBe(1)
  expect(
    clearAcceptedNeteaseListenEntries({
      accountId: 'account-a',
      rangeStart: monthStart,
      rangeEnd: todayStart - 1,
      periodKey: 'month:2026-09'
    })
  ).toBe(1)
  expect(neteaseListenEntries.value).toHaveLength(0)
})

test('isolates accounts and date ranges while preserving retry state', () => {
  const startedAt = new Date(2026, 8, 23, 23, 59, 30).getTime()
  const endedAt = new Date(2026, 8, 24, 0, 0, 30).getTime()
  recordNeteaseListenSegment({
    accountId: 'account-a',
    sessionId: 'session-a',
    startedAt,
    endedAt,
    seconds: 120,
    params
  })
  recordNeteaseListenSegment({
    accountId: 'account-b',
    sessionId: 'session-b',
    startedAt: endedAt,
    endedAt: endedAt + 30_000,
    seconds: 30,
    params: { ...params, id: 789 }
  })

  const dayTwoStart = new Date(2026, 8, 24, 0, 0, 0).getTime()
  const dayTwoEnd = new Date(2026, 8, 24, 23, 59, 59, 999).getTime()
  expect(getNeteaseListenLedgerTotals('account-a', dayTwoStart, dayTwoEnd).pending).toBeCloseTo(60)
  expect(getNeteaseListenLedgerTotals('account-b', dayTwoStart, dayTwoEnd).pending).toBe(30)

  const claimed = claimPendingNeteaseListenEntries({
    accountId: 'account-a',
    sessionId: 'session-a',
    force: true
  })
  expect(claimed).toHaveLength(2)
  markNeteaseListenEntryFailed(claimed[0].id, 'offline')
  markNeteaseListenEntryAccepted(claimed[1].id)

  const failed = neteaseListenEntries.value.find((entry) => entry.id === claimed[0].id)!
  expect(failed.status).toBe('pending')
  expect(failed.attempts).toBe(1)
  expect(failed.nextRetryAt).toBeGreaterThan(Date.now())

  reconcileNeteaseListenReport({
    accountId: 'account-a',
    periodKey: 'week:2026-09-21',
    rangeStart: dayTwoStart,
    rangeEnd: dayTwoEnd,
    remoteSeconds: 1000
  })
  reconcileNeteaseListenReport({
    accountId: 'account-a',
    periodKey: 'week:2026-09-21',
    rangeStart: dayTwoStart,
    rangeEnd: dayTwoEnd,
    remoteSeconds: 1060
  })
  expect(
    getNeteaseListenLedgerTotals('account-a', dayTwoStart, dayTwoEnd, 'week:2026-09-21').accepted
  ).toBe(0)
  expect(
    getNeteaseListenLedgerTotals('account-a', dayTwoStart, dayTwoEnd, 'month:2026-09').accepted
  ).toBe(60)
})

test('does not let background retries claim the currently playing session', () => {
  const now = Date.now()
  for (const sessionId of ['active-session', 'older-session']) {
    recordNeteaseListenSegment({
      accountId: 'account-a',
      sessionId,
      startedAt: now - 60_000,
      endedAt: now,
      seconds: 60,
      params
    })
  }

  const claimed = claimPendingNeteaseListenEntries({
    accountId: 'account-a',
    excludeSessionId: 'active-session',
    force: true
  })

  expect(claimed.map((entry) => entry.sessionId)).toEqual(['older-session'])
  expect(
    neteaseListenEntries.value.find((entry) => entry.sessionId === 'active-session')?.status
  ).toBe('pending')
})

test('retains a month report baseline for uploads made after the first report', () => {
  const accountId = 'baseline-probe-2026-10'
  const periodKey = 'month:2026-10'
  expect(hasNeteaseListenReportBaseline(accountId, periodKey)).toBe(false)

  reconcileNeteaseListenReport({
    accountId,
    periodKey,
    rangeStart: new Date(2026, 9, 1).getTime(),
    rangeEnd: new Date(2026, 9, 31, 23, 59, 59, 999).getTime(),
    remoteSeconds: 1200
  })

  expect(hasNeteaseListenReportBaseline(accountId, periodKey)).toBe(true)
})

test('historical manual replay is explicit, account-isolated and at most once', () => {
  const now = new Date(2026, 9, 14, 12, 0, 0).getTime()
  const yesterday = new Date(2026, 9, 13, 10, 0, 0).getTime()
  const add = (accountId: string, sessionId: string, startedAt: number) => {
    const [entry] = recordNeteaseListenSegment({
      accountId,
      sessionId,
      startedAt,
      endedAt: startedAt + 120_000,
      seconds: 120,
      params
    })
    markNeteaseListenEntryAccepted(entry.id)
    return entry.id
  }
  const historicalId = add('account-a', 'old-accepted', yesterday)
  add('account-a', 'today-accepted', now - 120_000)
  add('account-b', 'other-account', yesterday)
  const alreadyConfirmedId = add('account-a', 'already-confirmed', yesterday + 300_000)
  const partiallyConfirmedId = add('account-a', 'partially-confirmed', yesterday + 600_000)
  const totalOnlyId = add('account-a', 'total-only', yesterday + 900_000)

  neteaseListenEntries.value = neteaseListenEntries.value.map((entry) => ({
    ...entry,
    acceptedAt: now - 2 * 60 * 60_000,
    confirmedByPeriod:
      entry.id === alreadyConfirmedId
        ? { 'today:2026-10-13': 120 }
        : entry.id === partiallyConfirmedId
          ? { 'today:2026-10-13': 30 }
          : entry.id === totalOnlyId
            ? { total: 60 }
            : entry.confirmedByPeriod
  }))

  expect(getNeteaseHistoricalReplayPreview('account-a', now)).toEqual({
    count: 2,
    seconds: 240
  })
  expect(getNeteaseHistoricalReplayDiagnostics('account-a', now).aggregateOnlyEntries).toBe(1)
  const stagedIds = stageNeteaseHistoricalReplay('account-a', now)
  expect(stagedIds).toEqual([historicalId, totalOnlyId])
  const staged = neteaseListenEntries.value.find((entry) => entry.id === historicalId)!
  expect(staged.status).toBe('pending')
  expect(staged.manualReplayCount).toBe(1)
  expect(staged.params.segmentId).toMatch(new RegExp(`^replay:${historicalId}:`))
  expect(staged.params.segmentId).not.toBe(historicalId)

  expect(stageNeteaseHistoricalReplay('account-a', now)).toEqual([])
  expect(getNeteaseHistoricalReplayPreview('account-a', now).count).toBe(0)
  expect(
    claimPendingNeteaseListenEntries({ accountId: 'account-a', entryIds: [historicalId] }).map(
      (entry) => entry.id
    )
  ).toEqual([historicalId])
  expect(neteaseListenEntries.value.find((entry) => entry.id === alreadyConfirmedId)?.status).toBe(
    'accepted'
  )
})

test('diagnoses hidden replay action without changing the unverified month backlog', () => {
  const now = new Date(2026, 9, 14, 12, 0, 0).getTime()
  const yesterday = new Date(2026, 9, 13, 10, 0, 0).getTime()
  const record = (sessionId: string, start: number) => {
    const [entry] = recordNeteaseListenSegment({
      accountId: 'diagnosis-account',
      sessionId,
      startedAt: start,
      endedAt: start + 120_000,
      seconds: 120,
      params
    })
    markNeteaseListenEntryAccepted(entry.id)
    return entry.id
  }
  const eligible = record('eligible', yesterday)
  const partiallyCredited = record('partial', yesterday + 180_000)
  const aggregateOnly = record('total-only', yesterday + 270_000)
  const previouslyReplayed = record('replayed', yesterday + 360_000)
  const tooRecent = record('recent', yesterday + 540_000)
  record('excluded-current-day', now - 120_000)

  neteaseListenEntries.value = neteaseListenEntries.value.map((entry) => ({
    ...entry,
    acceptedAt: entry.id === tooRecent ? now - 10 * 60_000 : now - 2 * 60 * 60_000,
    manualReplayCount: entry.id === previouslyReplayed ? 1 : undefined,
    confirmedByPeriod:
      entry.id === partiallyCredited
        ? { 'today:2026-10-13': 30 }
        : entry.id === aggregateOnly
          ? { total: 30 }
          : entry.confirmedByPeriod
  }))

  expect(getNeteaseHistoricalReplayDiagnostics('diagnosis-account', now)).toEqual({
    awaitingEntries: 5,
    awaitingSeconds: 600,
    eligibleEntries: 2,
    eligibleSeconds: 240,
    partiallyConfirmedEntries: 1,
    aggregateOnlyEntries: 1,
    aggregateOnlySeconds: 120,
    alreadyReplayedEntries: 1,
    tooRecentEntries: 1
  })
  expect(getNeteaseHistoricalReplayPreview('diagnosis-account', now)).toEqual({
    count: 2,
    seconds: 240
  })
  expect(neteaseListenEntries.value.find((entry) => entry.id === eligible)?.status).toBe('accepted')
  expect(
    getNeteaseListenLedgerTotals(
      'diagnosis-account',
      new Date(2026, 9, 1).getTime(),
      new Date(2026, 9, 14).getTime() - 1,
      'month:2026-10'
    ).accepted
  ).toBe(600)
})

test('global total report growth is not evidence of song-level remote credit', () => {
  const accountId = 'aggregate-is-not-song-confirmation'
  const dayStart = new Date(2026, 9, 13).getTime()
  const dayEnd = new Date(2026, 9, 14).getTime() - 1
  const now = new Date(2026, 9, 14, 12, 0, 0).getTime()
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId: 'historic-session',
    startedAt: dayStart + 60_000,
    endedAt: dayStart + 180_000,
    seconds: 120,
    params
  })
  markNeteaseListenEntryAccepted(entry.id)
  neteaseListenEntries.value = neteaseListenEntries.value.map((item) =>
    item.id === entry.id ? { ...item, acceptedAt: now - 2 * 60 * 60_000 } : item
  )

  const reconcileTotal = (remoteSeconds: number) =>
    reconcileNeteaseListenReport({
      accountId,
      periodKey: 'total',
      rangeStart: Number.NEGATIVE_INFINITY,
      rangeEnd: Number.POSITIVE_INFINITY,
      remoteSeconds
    })
  reconcileTotal(100_000)
  reconcileTotal(101_000)

  const stored = neteaseListenEntries.value.find((item) => item.id === entry.id)!
  expect(stored.confirmedByPeriod.total).toBeUndefined()
  expect(
    getNeteaseListenLedgerTotals(accountId, dayStart, dayEnd, 'month:2026-10').accepted
  ).toBe(120)
  expect(getNeteaseHistoricalReplayPreview(accountId, now)).toEqual({ count: 1, seconds: 120 })

  // Historical ledgers may already contain invalid per-segment 'total' credits.
  // Preserve them for audit; do not mistake them for day/month verification.
  neteaseListenEntries.value = neteaseListenEntries.value.map((item) =>
    item.id === entry.id ? { ...item, confirmedByPeriod: { total: 60 } } : item
  )
  const diagnosis = getNeteaseHistoricalReplayDiagnostics(accountId, now)
  expect(diagnosis.aggregateOnlyEntries).toBe(1)
  expect(diagnosis.eligibleEntries).toBe(1)
  expect(diagnosis.partiallyConfirmedEntries).toBe(0)
  expect(neteaseListenEntries.value.find((item) => item.id === entry.id)?.status).toBe('accepted')
})

test('historical replay UI requires extra consent for ambiguous total-only history', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer/views/MusicInsightsStable.vue'), 'utf8')
  expect(source).toContain('historicalReplayAggregateWarning')
  expect(source).toContain('aggregateOnly > 0')
  expect(source).toContain('@click="replayHistoricalAccepted"')
})

test('old unverified receipts and oversized pending outboxes are never silently pruned', () => {
  const oldStart = new Date(2026, 7, 1, 10, 0, 0).getTime()
  const [created] = recordNeteaseListenSegment({
    accountId: 'retain-account',
    sessionId: 'historical',
    startedAt: oldStart,
    endedAt: oldStart + 120_000,
    seconds: 120,
    params
  })
  markNeteaseListenEntryAccepted(created.id)
  const accepted = neteaseListenEntries.value.find((entry) => entry.id === created.id)!
  neteaseListenEntries.value = Array.from({ length: 2105 }, (_, index) => ({
    ...accepted,
    id: `old-receipt-${index}`,
    params: { ...accepted.params, segmentId: `old-receipt-${index}` },
    updatedAt: oldStart,
    acceptedAt: oldStart,
    confirmedByPeriod: {}
  }))
  flushNeteaseListenLedger(true)
  expect(neteaseListenEntries.value).toHaveLength(2105)
  expect(neteaseListenEntries.value.every((entry) => entry.status === 'accepted')).toBe(true)
})

test('merges the disk mirror with local entries without losing either or replaying uploads', async () => {
  const now = Date.now()
  const [local] = recordNeteaseListenSegment({
    accountId: 'recovery-account',
    sessionId: 'local',
    startedAt: now - 360_000,
    endedAt: now - 240_000,
    seconds: 120,
    params
  })
  const backup = {
    entries: [
      {
        ...local,
        id: 'disk-only-segment',
        sessionId: 'disk',
        params: { ...local.params, segmentId: 'disk-only-segment' },
        status: 'accepted',
        acceptedAt: now - 60_000,
        updatedAt: now - 60_000
      },
      {
        ...local,
        status: 'accepted',
        acceptedAt: now + 30_000,
        updatedAt: now + 30_000
      }
    ],
    remoteBaselines: {},
    remoteObservations: {}
  }
  const originalWindow = (globalThis as any).window
  const sent: any[] = []
  ;(globalThis as any).window = {
    mainApi: {
      invoke: async (channel: string) =>
        channel === 'get-listen-ledger-backup' ? backup : null,
      send: (channel: string, payload: unknown) => sent.push({ channel, payload })
    }
  }

  try {
    await recoverNeteaseListenLedgerBackup()
    const recovered = neteaseListenEntries.value
    expect(recovered).toHaveLength(2)
    expect(recovered.find((entry) => entry.id === 'disk-only-segment')?.status).toBe('accepted')
    expect(recovered.find((entry) => entry.id === local.id)?.status).toBe('accepted')
    expect(sent.some((item) => item.channel === 'listen-ledger-snapshot')).toBe(true)
  } finally {
    ;(globalThis as any).window = originalWindow
  }
})

test('captured transport evidence never masquerades as a confirmed day report', () => {
  const startedAt = new Date(2026, 9, 13, 10, 0, 0).getTime()
  const [entry] = recordNeteaseListenSegment({
    accountId: 'receipt-not-credit',
    sessionId: 'receipt-only',
    startedAt,
    endedAt: startedAt + 120_000,
    seconds: 120,
    params
  })
  markNeteaseListenEntryAccepted(entry.id, {
    transport: 'ncbl-plv-pld',
    acknowledgedAt: Date.now(),
    plvReceived: true,
    pldReceived: true,
    deduplicated: false
  })
  const persisted = neteaseListenEntries.value.find((item) => item.id === entry.id)!
  expect(persisted.status).toBe('accepted')
  expect(persisted.uploadEvidence?.pldReceived).toBe(true)
  expect(persisted.confirmedByPeriod).toEqual({})
  expect(getNeteaseListenSyncDiagnostics('receipt-not-credit').receiptEvidenceEntries).toBe(1)
})

test('flushes Vue reactive entries through a structured-clone-safe Electron IPC snapshot', async () => {
  const originalWindow = (globalThis as any).window
  const delivered: unknown[] = []
  ;(globalThis as any).window = {
    mainApi: {
      on: () => undefined,
      invoke: async () => ({ entries: [], remoteBaselines: {}, remoteObservations: {} }),
      send: (channel: string, snapshot: unknown) => {
        if (channel !== 'listen-ledger-snapshot') return
        // Electron IPC uses structured cloning. Vue's original proxy array
        // cannot be cloned; this mock fails identically if a proxy leaks.
        delivered.push(structuredClone(snapshot))
      }
    }
  }

  try {
    await recoverNeteaseListenLedgerBackup()
    const startedAt = Date.now() - 120_000
    const [entry] = recordNeteaseListenSegment({
      accountId: 'ipc-clone-account',
      sessionId: 'ipc-clone-session',
      startedAt,
      endedAt: startedAt + 90_000,
      seconds: 90,
      params
    })
    expect(() => structuredClone(neteaseListenEntries.value)).toThrow()
    flushNeteaseListenLedger(true)

    const latest = delivered.at(-1) as {
      entries: Array<{ id: string; status: string; seconds: number }>
      remoteBaselines: Record<string, number>
      remoteObservations: Record<string, unknown>
    }
    expect(latest.entries.find((item) => item.id === entry.id)).toMatchObject({
      id: entry.id,
      status: 'pending',
      seconds: 90
    })
    expect(Array.isArray(latest.entries)).toBe(true)
  } finally {
    ;(globalThis as any).window = originalWindow
  }
})

test('resumed playback never mutates a partially attempted PLV/PLD upload', () => {
  const accountId = 'pause-resume-immutable'
  const sessionId = 'pause-resume-session'
  const startedAt = new Date(2026, 9, 14, 22, 0, 0).getTime()
  const old = recordNeteaseListenSegment({
    accountId,
    sessionId,
    startedAt,
    endedAt: startedAt + 53_000,
    seconds: 53,
    params
  })
  expect(old).toHaveLength(1)
  const [claimed] = claimPendingNeteaseListenEntries({ accountId, sessionId, force: true })
  expect(claimed.id).toBe(old[0].id)
  // PLV can be acknowledged even if PLD fails. A later playback must not
  // change the original request under the same segment ID.
  markNeteaseListenEntryFailed(claimed.id, 'test PLD upload failure')
  const extra = recordNeteaseListenSegment({
    accountId,
    sessionId,
    startedAt: startedAt + 120_000,
    endedAt: startedAt + 155_000,
    seconds: 35,
    params
  })
  expect(extra).toHaveLength(1)
  expect(extra[0].id).not.toBe(claimed.id)

  const historical = neteaseListenEntries.value.find((item) => item.id === claimed.id)!
  expect(historical.seconds).toBe(53)
  expect(historical.startedAt).toBe(startedAt)
  expect(historical.endedAt).toBe(startedAt + 53_000)
  expect(historical.params.segmentId).toBe(claimed.id)
  expect(historical.attempts).toBe(1)

  const subsequent = neteaseListenEntries.value.find((item) => item.id === extra[0].id)!
  expect(subsequent.seconds).toBe(35)
  expect(subsequent.dateKey).toBe('2026-10-14')
  expect(subsequent.params.segmentId).toBe(extra[0].id)
})

