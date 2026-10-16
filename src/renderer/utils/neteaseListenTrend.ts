/**
 * Rolling seven-local-calendar-day NetEase listening trend.
 *
 * Uses only explicitly dated daily duration rows from the remote month/week
 * reports; never treats local pending/accepted ledger entries as cloud history.
 *
 * A validated current-month report may omit zero-listening dates, so those
 * dates are rendered as zero. Dates outside its coverage are unknown unless
 * the week report explicitly supplies their daily value.
 */
import {
  extractDailyListenSeconds,
  isRealtimeListenReportForMonth
} from '../services/neteaseModern'

export type NeteaseDailyListenPoint = {
  dateKey: string
  /** Null means unverified/unavailable, distinct from a reported zero. */
  seconds: number | null
}

const localDateKey = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')

export const buildNeteaseLastSevenDays = (
  now: Date,
  monthReport?: unknown,
  weekReport?: unknown
): NeteaseDailyListenPoint[] => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const currentMonthKey = localDateKey(today).slice(0, 7)
  const validMonth = isRealtimeListenReportForMonth(monthReport, currentMonthKey)
  const block = (monthReport as any)?.data?.listenTimeDistributionBlock
  const monthCoversEmptyDays =
    validMonth &&
    Array.isArray(block?.durationDetails) &&
    (block.durationDetails.length > 0 || Number(block.playDuration) === 0) &&
    Number.isFinite(Number(block?.playDuration)) &&
    Number(block.playDuration) >= 0

  const monthDays = new Map<string, number>()
  if (validMonth) {
    for (const day of extractDailyListenSeconds(monthReport, true)) {
      if (day.dateKey.startsWith(currentMonthKey)) {
        monthDays.set(day.dateKey, Math.max(monthDays.get(day.dateKey) ?? 0, day.seconds))
      }
    }
  }

  // Week boundary and month boundary are independent: only date-qualified
  // rows in the week report are used for days missing from the month report.
  const weekDays = new Map<string, number>()
  for (const day of extractDailyListenSeconds(weekReport, true)) {
    weekDays.set(day.dateKey, Math.max(weekDays.get(day.dateKey) ?? 0, day.seconds))
  }

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (6 - index))
    const dateKey = localDateKey(day)
    if (monthDays.has(dateKey)) return { dateKey, seconds: monthDays.get(dateKey)! }
    if (weekDays.has(dateKey)) return { dateKey, seconds: weekDays.get(dateKey)! }
    if (monthCoversEmptyDays && dateKey.startsWith(currentMonthKey)) {
      return { dateKey, seconds: 0 }
    }
    return { dateKey, seconds: null }
  })
}

/**
 * Mean of available cloud-reported dates in the displayed 7-day window.
 * Missing data (null) is excluded; a reported zero is included in the mean.
 * The UI explicitly labels partial coverage rather than presenting it as
 * a complete seven-day average.
 */
export const summarizeNeteaseSevenDayAverage = (
  points: readonly NeteaseDailyListenPoint[]
): { seconds: number; knownDays: number } | null => {
  const validSeconds = points
    .map((point) => point.seconds)
    .filter((seconds): seconds is number => seconds !== null && Number.isFinite(seconds) && seconds >= 0)
  if (!validSeconds.length) return null
  return {
    seconds: validSeconds.reduce((sum, seconds) => sum + seconds, 0) / validSeconds.length,
    knownDays: validSeconds.length
  }
}
