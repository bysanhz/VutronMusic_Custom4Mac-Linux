import { expect, test } from '@playwright/test'
import {
  resolveTrendDisplayDate,
  toggleTrendPinnedDate
} from '../src/renderer/utils/listenTrendSelection'

const dates = [
  '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
  '2026-10-24', '2026-10-25', '2026-10-26'
]
const today = dates.at(-1)!

test('default shows today and mouse hover previews without modifying the pin', () => {
  let pinned: string | null = null
  const hover = '2026-10-23'
  expect(resolveTrendDisplayDate(dates, null, null, pinned)).toBe(today)
  expect(resolveTrendDisplayDate(dates, hover, null, pinned)).toBe(hover)
  // Clearing hover on SVG mouseleave automatically returns to today.
  expect(resolveTrendDisplayDate(dates, null, null, pinned)).toBe(today)
  expect(pinned).toBeNull()
})

test('click locks a day; another hover is temporary and mouseleave restores the pin', () => {
  const pinned = toggleTrendPinnedDate(null, '2026-10-23')
  expect(pinned).toBe('2026-10-23')
  expect(resolveTrendDisplayDate(dates, null, null, pinned)).toBe(pinned)
  expect(resolveTrendDisplayDate(dates, '2026-10-21', null, pinned)).toBe('2026-10-21')
  expect(resolveTrendDisplayDate(dates, null, null, pinned)).toBe(pinned)
})

test('clicking the pinned day again unpins and returns to today', () => {
  const pinned = toggleTrendPinnedDate('2026-10-23', '2026-10-23')
  expect(pinned).toBeNull()
  // The component also clears hover/focus and suppresses the pointer over the
  // clicked day, so it does not re-preview while the pointer remains there.
  expect(resolveTrendDisplayDate(dates, null, null, pinned)).toBe(today)
})

test('keyboard focus previews and blur restores the last pinned day', () => {
  const pinned = '2026-10-23'
  expect(resolveTrendDisplayDate(dates, null, '2026-10-21', pinned)).toBe('2026-10-21')
  expect(resolveTrendDisplayDate(dates, null, null, pinned)).toBe(pinned)
  expect(toggleTrendPinnedDate(pinned, '2026-10-21')).toBe('2026-10-21')
})

test('pointer preview takes precedence over focus, then returns to keyboard focus', () => {
  expect(resolveTrendDisplayDate(dates, '2026-10-24', '2026-10-21', null)).toBe('2026-10-24')
  expect(resolveTrendDisplayDate(dates, null, '2026-10-21', null)).toBe('2026-10-21')
})

test('expired pinned/preview dates fall back to the current rolling window', () => {
  const newDates = [
    '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24',
    '2026-10-25', '2026-10-26', '2026-10-27'
  ]
  expect(resolveTrendDisplayDate(newDates, '2026-10-20', null, '2026-10-20'))
    .toBe('2026-10-27')
  expect(resolveTrendDisplayDate([], null, null, null)).toBeNull()
})
