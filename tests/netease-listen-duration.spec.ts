import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildNeteaseLastSevenDays,
  summarizeNeteaseSevenDayAverage
} from '../src/renderer/utils/neteaseListenTrend'
import {
  extractCalendarWeekListenSeconds,
  extractDailyListenSeconds,
  extractTodayListenSeconds,
  extractTodaySongCount,
  isRealtimeListenReportForMonth
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

  test('retains dated daily totals for confirmation after midnight', () => {
    expect(extractDailyListenSeconds(makeReport())).toContainEqual({
      dateKey: '2026-09-19',
      seconds: 25 * 60
    })
  })

  test('refuses inferred dates when confirming NetEase daily reports', () => {
    const report = {
      data: {
        startTime: new Date(2026, 9, 1).getTime(),
        listenTimeDistributionBlock: {
          durationDetails: [
            { period: '2026-10-13', duration: 84 },
            { duration: 166 },
            { date: '2026-10-14', duration: 12 }
          ]
        }
      }
    }

    // The legacy display fallback may use startTime + row index.
    // It must never turn an undated row into confirmation for October 2.
    expect(extractDailyListenSeconds(report)).toContainEqual({
      dateKey: '2026-10-02',
      seconds: 166 * 60
    })
    expect(extractDailyListenSeconds(report, true)).toEqual([
      { dateKey: '2026-10-13', seconds: 84 * 60 },
      { dateKey: '2026-10-14', seconds: 12 * 60 }
    ])
    expect(extractTodayListenSeconds(report, new Date(2026, 9, 2))).toBe(166 * 60)
    expect(extractTodayListenSeconds(report, new Date(2026, 9, 2), true)).toBeUndefined()
    expect(extractTodayListenSeconds(report, new Date(2026, 9, 13), true)).toBe(84 * 60)
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

  test('rejects a previous-month report during month rollover', () => {
    expect(isRealtimeListenReportForMonth(makeReport(), '2026-09')).toBe(true)
    expect(isRealtimeListenReportForMonth(makeReport(), '2026-10')).toBe(false)
    expect(isRealtimeListenReportForMonth({ data: {} }, '2026-09')).toBe(false)
  })
})

test.describe('Rolling seven-day NetEase duration trend', () => {
  type DailyRow = [string, number]
  const month = (year: number, month: number, days: DailyRow[]) => ({
    data: {
      startTime: new Date(year, month - 1, 1).getTime(),
      endTime: new Date(year, month, 0, 23, 59, 59).getTime(),
      listenTimeDistributionBlock: {
        playDuration: days.reduce((total, [, duration]) => total + duration, 0),
        durationDetails: days.map(([period, duration]) => ({ period, duration }))
      }
    }
  })

  test('uses rolling seven local dates instead of calendar weeks', () => {
    const now = new Date(2026, 9, 16, 12, 0, 0)
    const currentMonth = month(2026, 10, [
      ['2026-10-10', 30],
      ['2026-10-12', 75],
      ['2026-10-16', 45]
    ])
    const week = {
      data: {
        listenTimeDistributionBlock: {
          durationDetails: [{ period: '2026-10-16', duration: 999 }]
        }
      }
    }
    const series = buildNeteaseLastSevenDays(now, currentMonth, week)
    expect(series.map(({ dateKey }) => dateKey)).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16'
    ])
    // Explicitly dated month data takes precedence; sparse dates covered by a
    // valid current-month report have zero listening time.
    expect(series.map(({ seconds }) => seconds)).toEqual([1800, 0, 4500, 0, 0, 0, 2700])
  })

  test('joins month and week reports without inventing older days', () => {
    const series = buildNeteaseLastSevenDays(
      new Date(2026, 10, 3, 9, 0),
      month(2026, 11, [
        ['2026-11-01', 20],
        ['2026-11-03', 10]
      ]),
      {
        data: {
          listenTimeDistributionBlock: {
            durationDetails: [
              { period: '2026-10-30', duration: 40 },
              { period: '2026-10-31', duration: 70 },
              { period: '2026-11-01', duration: 99 }
            ]
          }
        }
      }
    )
    expect(series.map(({ dateKey }) => dateKey)).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03'
    ])
    expect(series.map(({ seconds }) => seconds)).toEqual([null, null, 2400, 4200, 1200, 0, 600])
  })

  test('never fabricates zeros from missing or stale reports', () => {
    const now = new Date(2026, 10, 3, 9, 0)
    expect(buildNeteaseLastSevenDays(now).map(({ seconds }) => seconds)).toEqual(
      Array(7).fill(null)
    )
    const stale = month(2026, 10, [['2026-10-31', 88]])
    expect(buildNeteaseLastSevenDays(now, stale).map(({ seconds }) => seconds)).toEqual(
      Array(7).fill(null)
    )
  })

  test('shows zero days from a valid zero-duration month report', () => {
    const series = buildNeteaseLastSevenDays(new Date(2026, 10, 3, 10), month(2026, 11, []))
    expect(series.map(({ seconds }) => seconds)).toEqual([null, null, null, null, 0, 0, 0])
  })

  test('averages all seven known dates including reported zero minutes', () => {
    const points = [
      0, 1800, 3600, 7200, 1800, 3600, 0
    ].map((seconds, index) => ({
      dateKey: `2026-10-${String(index + 10).padStart(2, '0')}`,
      seconds
    }))
    expect(summarizeNeteaseSevenDayAverage(points)).toEqual({
      knownDays: 7,
      seconds: 18000 / 7
    })
  })

  test('labels partial averaging honestly and never includes missing dates as zero', () => {
    const points = [
      { dateKey: '2026-10-10', seconds: null },
      { dateKey: '2026-10-11', seconds: 0 },
      { dateKey: '2026-10-12', seconds: 3600 },
      { dateKey: '2026-10-13', seconds: null }
    ]
    expect(summarizeNeteaseSevenDayAverage(points)).toEqual({
      knownDays: 2,
      seconds: 1800
    })
    expect(summarizeNeteaseSevenDayAverage(points.slice(0, 1))).toBeNull()
  })

  test('renders bars, a daily line and an average guide in hours with a full date', () => {
    const component = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/ListenDurationTrend.vue'),
      'utf8'
    )
    expect(component).toContain('class="trend-bar"')
    expect(component).toContain('class="trend-line"')
    expect(component).toContain('class="trend-average"')
    expect(component).toContain('summarizeNeteaseSevenDayAverage(props.points)')
    expect(component).toContain('point.seconds / 3600')
    expect(component).toContain('{{ formatHours(tick) }}')
    expect(component).toContain('formatFullDate(selectedPoint.dateKey)')
    expect(component).toContain("year: 'numeric'")
    expect(component).toContain("month: 'long'")
    expect(component).toContain("day: 'numeric'")
    expect(component).not.toContain('sevenDayTrendHelp')
    expect(component).not.toContain('sevenDayTrendNote')
  })

  test('keeps today highlighted separately from selection and emphasizes the average', () => {
    const component = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/ListenDurationTrend.vue'),
      'utf8'
    )
    expect(component).toContain('today: index === points.length - 1')
    expect(component).toContain('class="trend-today-halo"')
    expect(component).toContain('class="trend-dot"')
    expect(component).toContain('class="trend-date"')
    expect(component).toContain('.trend-bar.today.selected')
    expect(component).toContain('.trend-dot.today')
    expect(component).toContain('.trend-date.today')
    expect(component).toContain('stroke-width: 2.8')
    expect(component).toContain('.trend-average-label')
    expect(component).toContain('font-weight: 800')
  })

  test('wires the chart to full and lightweight remote refreshes', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'src/renderer/views/MusicInsightsStable.vue'),
      'utf8'
    )
    const component = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/ListenDurationTrend.vue'),
      'utf8'
    )
    expect(view).toContain(
      '<ListenDurationTrend :points="recentSevenDayTrend" />'
    )
    expect(view).toContain('trendMonthReport.value = currentMonth')
    expect(view).toContain('trendWeekReport.value = week')
    expect(view).toContain('sevenDaySpansLastMonth.value')
    expect(component).toContain('var(--color-primary)')
    expect(component).toContain('point.seconds === null')
    expect(component).toContain('sevenDayTrendTitle')
  })
})
