import { expect, test } from '@playwright/test'
import {
  extractCalendarWeekListenSeconds,
  extractTodayListenSeconds,
  extractTodaySongCount
} from '../src/renderer/services/neteaseModern'

const makeReport = () => ({
  data: {
    startTime: new Date(2026, 8, 1).getTime(),
    endTime: new Date(2026, 8, 20, 23, 59, 59).getTime(),
    listenTimeDistributionBlock: {
      durationDetails: [
        { period: '2026-09-14', duration: 30 },
        { period: '2026-09-15', duration: 45 },
        { period: '2026-09-16', duration: 20 },
        { period: '2026-09-17', duration: 35 },
        { period: '2026-09-18', duration: 50 },
        { period: '2026-09-19', duration: 25 },
        { period: '2026-09-20', duration: 206 }
      ]
    }
  }
})

test.describe('NetEase listening duration extraction', () => {
  test('keeps Sunday today separate from Monday-based calendar week', () => {
    const report = makeReport()
    const sunday = new Date(2026, 8, 20, 12, 0, 0)

    expect(extractTodayListenSeconds(report, sunday)).toBe(206 * 60)
    expect(extractCalendarWeekListenSeconds(report, sunday)).toBe(
      (30 + 45 + 20 + 35 + 50 + 25 + 206) * 60
    )
  })

  test('reads period as the duration-detail date field', () => {
    const report = makeReport()
    const sunday = new Date(2026, 8, 20, 12, 0, 0)

    expect(extractTodayListenSeconds(report, sunday)).not.toBe(
      extractCalendarWeekListenSeconds(report, sunday)
    )
  })

  test('does not let a stale week report override an explicitly empty today response', () => {
    const today = { code: 200, data: { songDTOs: [] } }
    const week = { code: 200, data: { weekTodayListenBlock: { songCount: 5 } } }

    const count = extractTodaySongCount(today, week)
    expect(count).toBe(0)
  })

  test('falls back to the week count only when the today response is unavailable', () => {
    const week = { code: 200, data: { weekTodayListenBlock: { songCount: 5 } } }

    expect(extractTodaySongCount(undefined, week)).toBe(5)
  })
})
