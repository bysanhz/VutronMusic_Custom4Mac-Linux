import { expect, test } from '@playwright/test'
import { uploadScrobbleStages } from '../src/shared/neteaseScrobbleStages'
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
