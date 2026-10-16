import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createNeteasePlaybackClock } from '../src/renderer/utils/neteasePlaybackClock'
import { uploadScrobbleStages } from '../src/shared/neteaseScrobbleStages'
import { normalizeNeteaseScrobbleTiming } from '../src/shared/scrobbleTiming'
import { createNeteasePauseUploadScheduler } from '../src/shared/neteasePauseUpload'
import {
  getMinimumNeteaseListenSeconds,
  MIN_NETEASE_LISTEN_SECONDS,
  MAX_NETEASE_LISTEN_SECONDS,
  getConfiguredNeteaseListenSeconds,
  setConfiguredNeteaseListenSeconds
} from '../src/shared/neteaseListenThreshold'
import {
  claimPendingNeteaseListenEntries,
  markNeteaseListenEntryAccepted,
  neteaseListenEntries,
  recordNeteaseListenSegment
} from '../src/renderer/utils/neteaseListenLedger'

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

test('fault injection: PLD failure does not cause PLV to be re-uploaded', async () => {
  const acknowledged = new Set<string>()
  let plvCalls = 0
  let pldCalls = 0
  const send = async () =>
    uploadScrobbleStages({
      segmentId: 'test-segment-a',
      hasPlvReceipt: () => acknowledged.has('test-segment-a'),
      recordPlvReceipt: () => {
        acknowledged.add('test-segment-a')
      },
      uploadPlv: async () => {
        plvCalls += 1
        return { success: true }
      },
      uploadPld: async () => {
        pldCalls += 1
        return { success: pldCalls > 1 }
      }
    })

  const first = await send()
  expect(first.failedStage).toBe('pld')
  expect(acknowledged.has('test-segment-a')).toBe(true)
  const second = await send()
  expect(second.failedStage).toBeUndefined()
  expect(second.plvPreviouslyAcknowledged).toBe(true)
  expect(plvCalls).toBe(1)
  expect(pldCalls).toBe(2)
})

test('fault injection: rejected PLV prevents PLD and no receipt is recorded', async () => {
  let pldCalls = 0
  let persisted = false
  const result = await uploadScrobbleStages({
    segmentId: 'test-segment-b',
    hasPlvReceipt: () => false,
    recordPlvReceipt: () => {
      persisted = true
    },
    uploadPlv: async () => ({ success: false }),
    uploadPld: async () => {
      pldCalls += 1
      return { success: true }
    }
  })
  expect(result.failedStage).toBe('plv')
  expect(pldCalls).toBe(0)
  expect(persisted).toBe(false)
})

test('fault injection: PLD transport exception preserves journal for later retry', async () => {
  const acknowledged = new Set<string>()
  let plvCalls = 0
  const options = {
    segmentId: 'test-segment-c',
    hasPlvReceipt: () => acknowledged.has('test-segment-c'),
    recordPlvReceipt: () => {
      acknowledged.add('test-segment-c')
    },
    uploadPlv: async () => {
      plvCalls += 1
      return { success: true }
    }
  }
  await expect(
    uploadScrobbleStages({
      ...options,
      uploadPld: async () => {
        throw new Error('synthetic timeout')
      }
    })
  ).rejects.toThrow('synthetic timeout')

  expect(acknowledged.has('test-segment-c')).toBe(true)
  const recovered = await uploadScrobbleStages({
    ...options,
    uploadPld: async () => ({ success: true })
  })
  expect(recovered.plvPreviouslyAcknowledged).toBe(true)
  expect(plvCalls).toBe(1)
})

test('53 seconds paused yesterday is sent while paused, retaining its original day', async () => {
  const startedAt = new Date(2026, 9, 14, 23, 40, 0).getTime()
  const endedAt = startedAt + 53_000
  const accountId = 'pause-crossday-account'
  const sessionId = 'session-yesterday'
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId,
    startedAt,
    endedAt,
    seconds: 53,
    params: { id: 111, sourceid: 111, total: 200 }
  })
  let paused = true
  let activeSession = sessionId
  let submissions = 0
  const scheduler = createNeteasePauseUploadScheduler({
    delayMs: 10,
    isStillPaused: (s) => paused && s.sessionId === activeSession,
    submit: (s) => {
      submissions += 1
      for (const item of claimPendingNeteaseListenEntries({
        accountId: s.accountId,
        sessionId: s.sessionId,
        force: true
      })) {
        markNeteaseListenEntryAccepted(item.id)
      }
    }
  })

  scheduler.schedule({ accountId, sessionId, trackId: '111' })
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(submissions).toBe(1)
  const saved = neteaseListenEntries.value.find((item) => item.id === entry.id)!
  expect(saved.dateKey).toBe('2026-10-14')
  expect(saved.startedAt).toBe(startedAt)
  expect(saved.endedAt).toBe(endedAt)
  expect(saved.status).toBe('accepted')

  // A new pause/resume of another song must not resurrect the old segment.
  paused = false
  activeSession = 'session-today'
  scheduler.schedule({ accountId, sessionId, trackId: '111' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(submissions).toBe(1)
  scheduler.cancel()
})

test('brief pause and resume cancels delayed upload without losing durable time', async () => {
  const time = new Date(2026, 9, 14, 20, 0, 0).getTime()
  const accountId = 'quick-pause-account'
  const sessionId = 'quick-pause-session'
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId,
    startedAt: time,
    endedAt: time + 53_000,
    seconds: 53,
    params: { id: 222, sourceid: 222, total: 240 }
  })
  let submissions = 0
  const scheduler = createNeteasePauseUploadScheduler({
    delayMs: 20,
    isStillPaused: () => true,
    submit: () => {
      submissions += 1
    }
  })

  scheduler.schedule({ accountId, sessionId, trackId: '222' })
  scheduler.cancel() // media play / playing
  await new Promise((resolve) => setTimeout(resolve, 45))
  expect(submissions).toBe(0)
  expect(neteaseListenEntries.value.find((item) => item.id === entry.id)?.status).toBe('pending')
})

test('offline pause leaves a retriable original-day segment without a new segment ID', async () => {
  const at = new Date(2026, 9, 14, 23, 50, 0).getTime()
  const accountId = 'offline-pause-account'
  const sessionId = 'offline-session'
  const [entry] = recordNeteaseListenSegment({
    accountId,
    sessionId,
    startedAt: at,
    endedAt: at + 53_000,
    seconds: 53,
    params: { id: 333, sourceid: 333, total: 240 }
  })
  let online = false
  const scheduler = createNeteasePauseUploadScheduler({
    delayMs: 10,
    isStillPaused: () => true,
    submit: ({ accountId, sessionId }) => {
      if (!online) return
      for (const item of claimPendingNeteaseListenEntries({
        accountId,
        sessionId,
        force: true
      })) {
        markNeteaseListenEntryAccepted(item.id)
      }
    }
  })

  scheduler.schedule({ accountId, sessionId, trackId: '333' })
  await new Promise((resolve) => setTimeout(resolve, 35))
  expect(neteaseListenEntries.value.find((item) => item.id === entry.id)?.status).toBe('pending')
  online = true
  scheduler.schedule({ accountId, sessionId, trackId: '333' })
  await new Promise((resolve) => setTimeout(resolve, 35))
  const saved = neteaseListenEntries.value.find((item) => item.id === entry.id)!
  expect(saved.status).toBe('accepted')
  expect(saved.dateKey).toBe('2026-10-14')
  expect(saved.params.segmentId).toBe(entry.id)
  scheduler.cancel()
})

test('a continuous segment crossing midnight retains two actual calendar dates', () => {
  const startedAt = new Date(2026, 9, 14, 23, 59, 45).getTime()
  const recorded = recordNeteaseListenSegment({
    accountId: 'midnight-play-account',
    sessionId: 'midnight-play-session',
    startedAt,
    endedAt: startedAt + 53_000,
    seconds: 53,
    params: { id: 444, sourceid: 444, total: 180 }
  })
  expect(recorded.map((entry) => entry.dateKey)).toEqual(['2026-10-14', '2026-10-15'])
  expect(recorded[0].seconds).toBeCloseTo(15)
  expect(recorded[1].seconds).toBeCloseTo(38)
})

test('original PLV/PLD referral timestamps are passed through without rewriting upload time', () => {
  const ncbl = readFileSync(
    resolve(process.cwd(), 'src/main/appServer/vendor/ncbl.js'),
    'utf8'
  )
  const handler = readFileSync(
    resolve(process.cwd(), 'src/main/appServer/vendor/scrobbleV1.js'),
    'utf8'
  )
  expect(ncbl).toContain('buildPlv = (ctx, song, source, eventTimeMs = Date.now())')
  expect(ncbl).toContain('buildPld = (ctx, song, source, played, eventTimeMs = Date.now())')
  expect(handler).toContain('buildPlv(ctx, song, source, timing.startedAtSeconds * 1000)')
  expect(handler).toContain('buildPld(ctx, song, source, timing.playedSeconds, timing.endedAtSeconds * 1000)')
})

test('VutronMusic requires 15 seconds for ordinary tracks and a full short track', () => {
  expect(MIN_NETEASE_LISTEN_SECONDS).toBe(15)
  expect(getMinimumNeteaseListenSeconds(240)).toBe(15)
  expect(getMinimumNeteaseListenSeconds(10)).toBe(10)
  expect(getMinimumNeteaseListenSeconds(undefined)).toBe(15)

  const source = readFileSync(resolve(process.cwd(), 'src/renderer/store/player.ts'), 'utf8')
  const api = readFileSync(resolve(process.cwd(), 'src/renderer/api/track.ts'), 'utf8')
  expect(source).toContain('getMinimumNeteaseListenSeconds(trackDuration)')
  expect(source).toContain('if (listenedSeconds < minimumSeconds) return 0')
  // A manual refresh or natural end must not force a ten-second preview into
  // the durable outbox when a regular track requires fifteen seconds.
  expect(source).not.toContain('force: completed || checkpoint')
  expect(source).not.toContain('MIN_NETEASE_CHECKPOINT_SECONDS = 30')
  expect(api).toContain('getMinimumNeteaseListenSeconds(params.total)')
  expect(api).not.toContain('MIN_NETEASE_SCROBBLE_SECONDS = 30')
})

test('short listens remain internal and never appear as an upload-ready UI status', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/renderer/views/MusicInsightsStable.vue'), 'utf8')
  const status = readFileSync(resolve(process.cwd(), 'src/renderer/utils/neteaseSyncStatus.ts'), 'utf8')
  expect(page).not.toContain('provisionalListenLabel')
  expect(page).not.toContain('provisionalListenHelp')
  expect(page).not.toContain('sync-provisional-info')
  expect(page).toContain('value.pending + value.accepted')
  expect(page).toContain('provisionalNeteaseListen.value.eligible')
  expect(page).toContain('status.todayPending += status.todayProvisional')
  expect(page).toContain('status.earlierPending += status.earlierProvisional')
  expect(status).toContain('todayPending: today.pending')
  // Internal cross-day attribution and threshold computation remain intact.
  expect(status).toContain('todayProvisional: today.provisional')
})

test('monthly report discrepancy details are not rendered in listening insights', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/renderer/views/MusicInsightsStable.vue'), 'utf8')
  expect(page).not.toContain('sync-report-diagnostics')
  expect(page).not.toContain('monthReportReadings')
  expect(page).not.toContain('monthReportRegressionSeconds.value')
  expect(page).not.toContain('reportDiagnosticLabel')
  expect(page).toContain("t('insights.footprint.reportUnavailable')")
})

test('the configured threshold is validated, stored and shared by playback and scrobble', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) }
    }
  })
  try {
    expect(MAX_NETEASE_LISTEN_SECONDS).toBe(120)
    expect(getConfiguredNeteaseListenSeconds()).toBe(15)
    expect(setConfiguredNeteaseListenSeconds(8)).toBe(8)
    expect(getMinimumNeteaseListenSeconds(240)).toBe(8)
    expect(getMinimumNeteaseListenSeconds(3)).toBe(3)
    expect(setConfiguredNeteaseListenSeconds(0)).toBe(0)
    expect(getConfiguredNeteaseListenSeconds()).toBe(0)
    expect(getMinimumNeteaseListenSeconds(240)).toBe(0)
    expect(getMinimumNeteaseListenSeconds(3)).toBe(0)
    expect(getMinimumNeteaseListenSeconds(undefined)).toBe(0)
    expect(setConfiguredNeteaseListenSeconds(121)).toBe(15)
    expect(getConfiguredNeteaseListenSeconds()).toBe(15)
    expect(setConfiguredNeteaseListenSeconds(-1)).toBe(15)
    expect(setConfiguredNeteaseListenSeconds(2.5)).toBe(15)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test.describe('Real-time listening clock: monotonic wall time, not media progress', () => {
  test('counts one real second at 0.5x, 1x, 1.5x and 2x playback speeds', () => {
    for (const speed of [0.5, 1, 1.5, 2]) {
      const clock = createNeteasePlaybackClock()
      clock.start(0, 1_000, speed)
      const credited = clock.sample(speed, 2_000, 1729000002000)
      expect(credited?.seconds).toBeCloseTo(1, 6)
      expect(credited?.endedAt - credited!.startedAt).toBeCloseTo(1000, 6)
    }
  })

  test('does not treat fast seek as listening, even when it skips far ahead', () => {
    const clock = createNeteasePlaybackClock()
    clock.start(5, 0, 2)
    expect(clock.sample(6, 500, 500)?.seconds).toBeCloseTo(0.5)
    expect(clock.sample(125, 1000, 1000)).toBeNull()
    expect(clock.sample(127, 2000, 2000)?.seconds).toBeCloseTo(1)
  })

  test('pauses and buffering gaps do not count as active listening time', () => {
    const clock = createNeteasePlaybackClock()
    clock.start(0, 0, 1)
    const first = clock.sample(1, 1000, 1000)
    expect(first?.seconds).toBe(1)
    clock.suspend()
    expect(clock.sample(1, 20000, 20000)).toBeNull()
    clock.start(1, 20000, 1)
    const second = clock.sample(2, 21000, 21000)
    expect(second?.seconds).toBe(1)
    expect(second?.continuous).toBe(false)
  })

  test('does not count time stuck on the same media position', () => {
    const clock = createNeteasePlaybackClock()
    clock.start(4, 0, 1)
    expect(clock.sample(4, 10_000, 10_000)).toBeNull()
    expect(clock.sample(5, 11_000, 11_000)?.seconds).toBe(1)
  })

  test('caps suspicious motion while tolerating delayed background events', () => {
    const clock = createNeteasePlaybackClock()
    clock.start(0, 0, 2)
    const delayed = clock.sample(60, 30_000, 30_000)
    expect(delayed?.seconds).toBe(30)
    clock.suspend()
    clock.start(60, 30_000, 2)
    expect(clock.sample(300, 30_500, 30_500)).toBeNull()
  })

  test('re-bases when rate changes, keeping the total in real seconds', () => {
    const clock = createNeteasePlaybackClock()
    clock.start(0, 0, 1)
    const normal = clock.sample(1, 1000, 1000)
    clock.suspend()
    clock.start(1, 1000, 2)
    const fast = clock.sample(3, 2000, 2000)
    expect(normal!.seconds + fast!.seconds).toBeCloseTo(2)
    expect(fast?.continuous).toBe(false)
  })

  test('player lifecycle gates playback on pause, seeking, waiting and rate changes', () => {
    const player = readFileSync(resolve(process.cwd(), 'src/renderer/store/player.ts'), 'utf8')
    expect(player).toContain('createNeteasePlaybackClock()')
    expect(player).toContain('neteaseSessionListenedSeconds += slice.seconds')
    expect(player).toContain("addEventListener('seeking', _handleMediaSeeking)")
    expect(player).toContain("addEventListener('ratechange', _handleMediaRateChange)")
    expect(player).toContain('const _handleMediaWaiting = () => {')
    expect(player).not.toContain('netaeasePlaybackClock')
    expect(player).not.toContain('const delta = currentTime - lastUpdateTime')
    expect(player).toContain('collectCurrentNeteasePlayback()')
  })
})
