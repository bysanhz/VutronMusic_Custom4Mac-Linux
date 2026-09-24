import { expect, test } from '@playwright/test'
import {
  claimPendingNeteaseListenEntries,
  getNeteaseListenLedgerTotals,
  markNeteaseListenEntryAccepted,
  markNeteaseListenEntryFailed,
  neteaseListenEntries,
  reconcileNeteaseListenReport,
  recordNeteaseListenSegment,
  setProvisionalNeteaseListen,
  splitNeteaseListenSegmentByLocalDay
} from '../src/renderer/utils/neteaseListenLedger'

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
