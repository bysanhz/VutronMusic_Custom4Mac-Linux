import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildLocalListeningHours } from '../src/renderer/utils/neteaseListenHours'

const time = (value: string) => new Date(value).getTime()

test('splits a recorded real-time listening interval across hour boundaries', () => {
  const start = time('2026-10-18T09:30:00')
  const end = time('2026-10-18T10:30:00')
  const distribution = buildLocalListeningHours([
    { accountId: 'user-1', startedAt: start, endedAt: end, seconds: 3600 }
  ], 'user-1', time('2026-10-18T00:00:00'), time('2026-10-19T00:00:00'))
  expect(distribution[9]).toBeCloseTo(1800)
  expect(distribution[10]).toBeCloseTo(1800)
  expect(distribution.reduce((sum, seconds) => sum + seconds, 0)).toBeCloseTo(3600)
})

test('filters accounts and clips midnight-spanning intervals without inventing history', () => {
  const begin = time('2026-10-17T23:30:00')
  const end = time('2026-10-18T00:30:00')
  const records = [
    { accountId: 'primary', startedAt: begin, endedAt: end, seconds: 3600 },
    { accountId: 'other', startedAt: begin, endedAt: end, seconds: 3600 },
    { accountId: 'primary', startedAt: begin, endedAt: begin, seconds: 100 }
  ]
  const distribution = buildLocalListeningHours(records, 'primary',
    time('2026-10-18T00:00:00'), time('2026-10-19T00:00:00'))
  expect(distribution[23]).toBe(0)
  expect(distribution[0]).toBeCloseTo(1800)
  expect(distribution.reduce((sum, seconds) => sum + seconds, 0)).toBeCloseTo(1800)
})

test('hourly chart is placed after the daily trend and labeled local-only', () => {
  const view = readFileSync(resolve(process.cwd(), 'src/renderer/views/MusicInsightsStable.vue'), 'utf8')
  const component = readFileSync(resolve(process.cwd(), 'src/renderer/components/ListenHourDistribution.vue'), 'utf8')
  expect(view.indexOf('<ListenHourDistribution')).toBeGreaterThan(view.indexOf('<ListenDurationTrend'))
  expect(view).toContain('buildLocalListeningHours(')
  expect(component).toContain('hourDistributionLocalOnly')
  for (const language of ['zh-hans', 'zh-hant', 'en']) {
    const locale = JSON.parse(readFileSync(resolve(process.cwd(), `src/renderer/locales/${language}.json`), 'utf8'))
    expect(locale.insights.footprint.hourDistributionTitle).toBeTruthy()
    expect(locale.insights.footprint.hourDistributionLocalOnly).toBeTruthy()
  }
})
