import { expect, test } from '@playwright/test'
import {
  clearAcceptedNeteaseListenEntries,
  claimPendingNeteaseListenEntries,
  getNeteaseListenLedgerTotals,
  hasNeteaseListenReportBaseline,
  markNeteaseListenEntryAccepted,
  markNeteaseListenEntryFailed,
  neteaseListenEntries,
  reconcileNeteaseListenReport,
  recordNeteaseListenSegment,
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
