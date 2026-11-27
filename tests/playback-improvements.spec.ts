import { test, expect } from '@playwright/test'
import { audioQualityFromResponse, playbackInfo } from '../src/shared/playbackInfo'
import {
  classifyPlaybackFailure,
  classifyRendererDelay,
  shouldRecoverPlayback,
  shouldRetryTrackLookup
} from '../src/shared/playbackRecovery'
import { playbackDiagnosis } from '../src/shared/playbackDiagnosis'
import { findLyricIndex } from '../src/renderer/utils/lyricTimeline'

test('quality is established by the returned level, never the preference or bitrate', () => {
  const info = playbackInfo({
    source: 'netease',
    audioQuality: audioQualityFromResponse('hires', { level: 'lossless', type: 'flac', br: 832585 })
  })
  expect(info).toMatchObject({
    actual: 'lossless',
    requested: 'hires',
    substituted: true,
    format: 'FLAC'
  })
  expect(
    playbackInfo({
      source: 'qq',
      br: 999000,
      audioQuality: { requested: 'jymaster', bitrate: 3000000 }
    })
  ).toMatchObject({ actual: undefined, source: 'alternative' })
  expect(
    playbackInfo({ cache: true, source: 'netease', audioQuality: { actual: 'lossless' } })
  ).toMatchObject({ source: 'cache', actual: 'lossless' })
  expect(playbackInfo({ source: 'https://secret/?token=private' }).provider).toBe('')
  expect(
    audioQualityFromResponse('lossless', {
      level: 'invented',
      br: -1,
      sr: Infinity,
      type: 'private;token=secret'
    })
  ).toMatchObject({
    actual: undefined,
    bitrate: undefined,
    sampleRate: undefined,
    format: undefined
  })
})

test('cancellation and account errors never enter transient transport retries', () => {
  for (const error of [
    { status: 400, body: { code: -460 } },
    { status: 401 },
    { status: 403 },
    { status: 404 },
    { status: 429 },
    { name: 'AbortError', status: 503 },
    { code: 'ERR_CANCELED', status: 503 }
  ])
    expect(shouldRetryTrackLookup(error, 0)).toBe(false)
  expect(shouldRetryTrackLookup({ status: 503 }, 0)).toBe(true)
  expect(shouldRetryTrackLookup({ code: 'ETIMEDOUT' }, 0)).toBe(true)
  expect(shouldRetryTrackLookup({ status: 503 }, 1)).toBe(false)
  expect(classifyPlaybackFailure({ response: { status: 400, data: { code: -460 } } })).toBe(
    'risk-control'
  )
})

test('background timers and sleep gaps do not masquerade as foreground blocking or playback stalls', () => {
  expect(classifyRendererDelay(true, true)).toBe('background-timer-delay')
  expect(classifyRendererDelay(true, false)).toBe('background-playback-delay')
  expect(classifyRendererDelay(false, true)).toBe('renderer-delay')
  expect(shouldRecoverPlayback(32000, 32000, 12000)).toBe(false)
  expect(shouldRecoverPlayback(13000, 2000, 12000)).toBe(true)
  expect(shouldRecoverPlayback(2000, 2000, 12000)).toBe(false)
})

test('diagnosis follows the current track and distinguishes an unavailable source from a successful fallback', () => {
  const records = [
    {
      kind: 'source',
      trackId: '1',
      phase: 'unavailable',
      failure: 'risk-control',
      upstreamCode: -460,
      cookie: 'private'
    },
    { kind: 'source', trackId: '2', phase: 'resolved', source: 'netease' }
  ]
  expect(playbackDiagnosis(1, { phase: 'failed', attempt: 0 }, records).issue).toBe('risk-control')
  expect(playbackDiagnosis(2, { phase: 'ready', attempt: 0 }, records).issue).toBe('healthy')
  records.push({
    kind: 'source',
    trackId: '1',
    phase: 'resolved',
    source: 'kuwo',
    failure: 'risk-control'
  } as any)
  const recovered = playbackDiagnosis(1, { phase: 'ready', attempt: 1 }, records)
  expect(recovered.issue).toBe('alternative')
  expect(JSON.stringify(recovered)).not.toContain('private')
  expect(playbackDiagnosis(1, { phase: 'retrying', attempt: 1 }, records).issue).toBe('retrying')
  expect(playbackDiagnosis(1, { phase: 'ready', attempt: 0 }, records, false).issue).toBe('offline')
})

test('lyric lookup handles forward play, backward seeks, offsets, repeated starts and the final end', () => {
  const lyrics = [
    { start: 1, end: 2 },
    { start: 2, end: 4 },
    { start: 2, end: 4 },
    { start: 4, end: 8 }
  ]
  expect(findLyricIndex(lyrics, 0)).toBe(-1)
  expect(findLyricIndex(lyrics, 2)).toBe(2)
  expect(findLyricIndex(lyrics, 4)).toBe(3)
  expect(findLyricIndex(lyrics, 1)).toBe(0)
  expect(findLyricIndex(lyrics, 1, 1)).toBe(2)
  expect(findLyricIndex(lyrics, 8.1)).toBe(4)
  expect(findLyricIndex([], 2)).toBe(-1)
})

test('a long word-timed lyric needs logarithmic timestamp reads', () => {
  let reads = 0
  const lyrics = Array.from({ length: 65536 }, (_, i) => ({
    get start() {
      reads++
      return i / 10
    },
    end: (i + 1) / 10
  }))
  expect(findLyricIndex(lyrics, 1234.5)).toBe(12345)
  expect(reads).toBeLessThan(25)
})
