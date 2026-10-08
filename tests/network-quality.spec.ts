import { expect, test } from '@playwright/test'
import {
  isNeteaseResponseHealthy,
  recordNeteaseFailure,
  summarizeNetworkQuality
} from '../src/renderer/utils/networkQuality'

const now = 1_000_000

test('uses recent successful NetEase requests to estimate quality', () => {
  const samples = [100, 140, 180].map((elapsedMs) => ({ elapsedMs, ok: true, at: now }))
  expect(summarizeNetworkQuality(samples, now)).toEqual({
    tier: 'excellent',
    medianMs: 140,
    failedCount: 0,
    sampleCount: 3
  })
  expect(summarizeNetworkQuality([{ elapsedMs: 900, ok: true, at: now }], now).tier).toBe('unknown')
})

test('does not declare excellent quality from a single request', () => {
  expect(summarizeNetworkQuality([{ elapsedMs: 90, ok: true, at: now }], now)).toEqual({
    tier: 'unknown',
    medianMs: 90,
    failedCount: 0,
    sampleCount: 1
  })
  expect(
    summarizeNetworkQuality(
      [100, 200, 300, 400].map((elapsedMs) => ({ elapsedMs, ok: true, at: now })),
      now
    ).medianMs
  ).toBe(250)
})

test('treats upstream error bodies inside HTTP 200 as failed requests', () => {
  expect(isNeteaseResponseHealthy(200, { code: 200 })).toBe(true)
  expect(isNeteaseResponseHealthy(200, { code: 502 })).toBe(false)
  expect(isNeteaseResponseHealthy(200, { code: 'ETIMEDOUT' })).toBe(false)
  expect(isNeteaseResponseHealthy(502, { code: 200 })).toBe(false)
  expect(isNeteaseResponseHealthy(401, { code: 301 })).toBe(true)
})

test('downgrades failed requests and expires stale measurements', () => {
  const samples = [
    { elapsedMs: 100, ok: true, at: now },
    { elapsedMs: 250, ok: false, at: now },
    { elapsedMs: 300, ok: false, at: now }
  ]
  expect(summarizeNetworkQuality(samples, now).tier).toBe('poor')
  expect(summarizeNetworkQuality(samples, now + 120_001)).toEqual({
    tier: 'unknown',
    medianMs: null,
    failedCount: 0,
    sampleCount: 0
  })
})

test('does not turn one failed request into a service outage', () => {
  const first = recordNeteaseFailure({ startedAt: 0, count: 0 }, now)
  expect(first.count).toBe(1)
  expect(recordNeteaseFailure(first, now + 31_000).count).toBe(1)
  const second = recordNeteaseFailure(first, now + 1_000)
  expect(recordNeteaseFailure(second, now + 2_000).count).toBe(3)

  const mostlySuccessful = [
    ...Array.from({ length: 11 }, () => ({ elapsedMs: 587, ok: true, at: now })),
    { elapsedMs: 587, ok: false, at: now }
  ]
  expect(summarizeNetworkQuality(mostlySuccessful, now).tier).toBe('fair')
})
