import { expect, test } from '@playwright/test'
import { normalizeNeteaseScrobbleTiming } from '../src/shared/scrobbleTiming'

test('uses integer listening seconds and the actual start and end of a completed song', () => {
  const startedAt = new Date(2026, 9, 8, 15, 30, 0).getTime()
  const endedAt = startedAt + 322_400

  expect(
    normalizeNeteaseScrobbleTiming({
      playedSeconds: 322.4,
      totalSeconds: 360,
      startedAt,
      endedAt,
      now: endedAt + 5_000
    })
  ).toEqual({
    playedSeconds: 322,
    totalSeconds: 360,
    startedAtSeconds: Math.floor(startedAt / 1000),
    endedAtSeconds: Math.floor(endedAt / 1000)
  })
})

test('keeps an older retry on its original day and preserves a pause between playback events', () => {
  const startedAt = new Date(2026, 9, 7, 23, 50, 0).getTime()
  const endedAt = new Date(2026, 9, 8, 0, 1, 0).getTime()
  const timing = normalizeNeteaseScrobbleTiming({
    playedSeconds: 300.2,
    totalSeconds: 400,
    startedAt,
    endedAt,
    now: endedAt + 3_600_000
  })

  expect(timing.playedSeconds).toBe(300)
  expect(timing.startedAtSeconds).toBe(Math.floor(startedAt / 1000))
  expect(timing.endedAtSeconds).toBe(Math.floor(endedAt / 1000))
  expect(timing.endedAtSeconds - timing.startedAtSeconds).toBeGreaterThan(timing.playedSeconds)
})
