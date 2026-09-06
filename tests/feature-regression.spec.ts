import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isPointInsideRectangle } from '../src/main/osdHitRegion'
import {
  shouldResetPlaybackPosition,
  type PlaybackStartReason
} from '../src/renderer/utils/playbackStartGuard'
import { normalizeTrackLyricOffset } from '../src/renderer/utils/trackLyricOffset'
import {
  calculateHeartModeRepeatPenalty,
  migrateHeartModeHistoryEntries,
  selectHeartModeSeedIDs
} from '../src/renderer/utils/heartModeHistory'
import {
  aggregateTrackFeedbackScore,
  rankHeartModeCandidatesByScore,
  rankHeartModeCandidatesWithScores
} from '../src/renderer/utils/heartModeScorer'
import { interleaveHeartModeSeedCandidates } from '../src/renderer/utils/heartModeSeedSelector'
import {
  rerankHeartModeCandidatesForDiversity,
  rerankHeartModeCandidatesWithDecisions,
  type HeartModeTrackMetadata
} from '../src/renderer/utils/heartModeReranker'
import {
  calculateActiveListenIncrement,
  scorePlaybackFeedback,
  type PlaybackFeedback
} from '../src/renderer/utils/playbackFeedback'
import { getHeartModePresetProfile } from '../src/renderer/utils/heartModeProfile'
import {
  calculateNextHeartModeBranchState,
  type HeartModeBranchState
} from '../src/renderer/utils/heartModeSession'
import {
  HEART_MODE_INITIAL_QUEUE_SIZE,
  HEART_MODE_REFILL_COUNT,
  HEART_MODE_REFILL_THRESHOLD,
  getHeartModeRemainingQueueCount,
  getHeartModeSpacingContext,
  shouldReplenishHeartModeQueue
} from '../src/renderer/utils/heartModeEngine'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('playback start policy', () => {
  const resetCases: Array<{
    previous: number | null
    next: number
    reason: PlaybackStartReason
    expected: boolean
  }> = [
    { previous: 1, next: 2, reason: 'manual-playlist', expected: true },
    { previous: 1, next: 1, reason: 'heart-mode', expected: true },
    { previous: 1, next: 2, reason: 'previous', expected: true },
    { previous: 1, next: 2, reason: 'next', expected: true },
    { previous: 1, next: 2, reason: 'session-restore', expected: false },
    { previous: 1, next: 1, reason: 'automatic-track-change', expected: false }
  ]

  for (const item of resetCases) {
    test(`${item.reason}: ${item.previous} -> ${item.next}`, () => {
      expect(shouldResetPlaybackPosition(item.previous, item.next, item.reason)).toBe(item.expected)
    })
  }

  test('does not clamp legitimate first-playback progress while media buffers', () => {
    const guard = readSource('src/renderer/utils/playbackStartGuard.ts')
    const player = readSource('src/renderer/store/player.ts')

    expect(guard).not.toContain('() => Number(playerStore.seek)')
    expect(guard).not.toContain('requestAnimationFrame(resetToTrackStart)')
    expect(guard).not.toContain('[0, 50, 180, 500, 1200, 2500]')
    expect(player).not.toContain('seek.value = playing.value ? 0 : progress.value')
    expect(player).toContain('const resumePosition =')
    expect(player).toContain('seek.value = resumePosition')
  })
})

test.describe('track lyric timing', () => {
  test('rounds to one decimal place and clamps to the supported range', () => {
    expect(normalizeTrackLyricOffset(1.26)).toBe(1.3)
    expect(normalizeTrackLyricOffset(-1.24)).toBe(-1.2)
    expect(normalizeTrackLyricOffset(99)).toBe(30)
    expect(normalizeTrackLyricOffset(-99)).toBe(-30)
    expect(normalizeTrackLyricOffset(Number.NaN)).toBe(0)
  })

  test('keeps offset controls responsive instead of squeezing five numeric controls', () => {
    const modal = readSource('src/renderer/components/ModalTrackLyricOffset.vue')

    expect(modal).toContain('<div class="step-controls">')
    expect(modal).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));')
    expect(modal).not.toContain('minmax(78px, 1.2fr)')
    expect(modal).toContain('font-variant-numeric: tabular-nums;')
    expect(modal).toContain('white-space: nowrap;')
  })
})

test.describe('heart mode history-aware recommendations', () => {
  test('combines NetEase rank, behavior, familiarity, and decaying repeat history', () => {
    const now = 100 * 24 * 60 * 60 * 1000
    const makeFeedback = (trackId: number, patch: Partial<PlaybackFeedback>): PlaybackFeedback => ({
      trackId,
      source: 'intelligence',
      durationSeconds: 200,
      activeListenSeconds: 10,
      completionRatio: 0.05,
      endReason: 'manual-next',
      likedAtEnd: false,
      likedDuringPlayback: false,
      playedAt: now,
      ...patch
    })

    const ranked = rankHeartModeCandidatesByScore({
      seedTrackID: 1,
      candidateTrackIDs: [10, 11, 12],
      likedTrackIDs: [1, 11],
      recentPlayedTrackIDs: [12],
      historyEntries: [
        {
          id: 12,
          recommendedAt: now - 60 * 60 * 1000,
          legacy: false
        }
      ],
      feedbackEntries: [
        makeFeedback(10, {
          activeListenSeconds: 200,
          completionRatio: 1,
          endReason: 'natural-end'
        }),
        makeFeedback(11, {})
      ],
      profile: getHeartModePresetProfile('diverse'),
      targetCount: 4,
      now
    })

    expect(ranked).toEqual([1, 10, 11, 12])
  })

  test('decays repeat penalty across short, medium, and long cooldown windows', () => {
    const now = 60 * 24 * 60 * 60 * 1000
    const penaltyAt12Hours = calculateHeartModeRepeatPenalty({
      recommendedAt: now - 12 * 60 * 60 * 1000,
      now
    })
    const penaltyAt3Days = calculateHeartModeRepeatPenalty({
      recommendedAt: now - 3 * 24 * 60 * 60 * 1000,
      now
    })
    const penaltyAt15Days = calculateHeartModeRepeatPenalty({
      recommendedAt: now - 15 * 24 * 60 * 60 * 1000,
      now
    })
    const penaltyAt31Days = calculateHeartModeRepeatPenalty({
      recommendedAt: now - 31 * 24 * 60 * 60 * 1000,
      now
    })

    expect(penaltyAt12Hours).toBeGreaterThan(penaltyAt3Days)
    expect(penaltyAt3Days).toBeGreaterThan(penaltyAt15Days)
    expect(penaltyAt15Days).toBeGreaterThan(0)
    expect(penaltyAt31Days).toBe(0)
  })

  test('migrates v1 history conservatively without inventing preference labels', () => {
    const migrated = migrateHeartModeHistoryEntries([
      { id: 10, recommendedAt: 200 },
      { id: 10, recommendedAt: 100 },
      { id: 11, recommendedAt: 150 },
      { id: 'bad', recommendedAt: 300 }
    ])

    expect(migrated).toEqual([
      { id: 10, recommendedAt: 200, legacy: true },
      { id: 11, recommendedAt: 150, legacy: true }
    ])
  })

  test('aggregates only behavior events that carry a real preference signal', () => {
    const now = 20 * 24 * 60 * 60 * 1000
    const base: PlaybackFeedback = {
      trackId: 10,
      source: 'intelligence',
      durationSeconds: 200,
      activeListenSeconds: 10,
      completionRatio: 0.05,
      endReason: 'manual-next',
      likedAtEnd: false,
      likedDuringPlayback: false,
      playedAt: now
    }

    expect(aggregateTrackFeedbackScore(10, [base], now)).toBe(-1)
    expect(aggregateTrackFeedbackScore(10, [{ ...base, endReason: 'playback-error' }], now)).toBe(0)
    expect(
      aggregateTrackFeedbackScore(
        10,
        [
          {
            ...base,
            endReason: 'playback-error',
            likedAtEnd: true,
            likedDuringPlayback: false
          }
        ],
        now
      )
    ).toBe(0)
    expect(aggregateTrackFeedbackScore(11, [base], now)).toBe(0)
  })

  test('prefers unseen liked tracks when choosing heart-mode seeds', () => {
    const seeds = selectHeartModeSeedIDs([1, 2, 3, 4], [1, 2, 3], 3, () => 0.5)

    expect(seeds[0]).toBe(4)
    expect(new Set(seeds).size).toBe(seeds.length)
    expect(seeds).toHaveLength(3)
  })

  test('interleaves every successful seed branch by its internal NetEase rank', () => {
    const recommendationsBySeed = new Map<number, number[]>([
      [1, [10, 11, 12]],
      [2, [20, 11, 22]],
      [3, [30, 31]]
    ])

    const pool = interleaveHeartModeSeedCandidates([1, 2, 3], recommendationsBySeed)

    expect(pool.candidateTrackIDs).toEqual([10, 20, 30, 11, 31, 12, 22])
    expect(pool.candidateSeedByTrackID.get(10)).toBe(1)
    expect(pool.candidateSeedByTrackID.get(20)).toBe(2)
    expect(pool.candidateSeedByTrackID.get(30)).toBe(3)
    expect(pool.candidateSeedByTrackID.get(11)).toBe(1)
  })

  test('reranks high-scoring candidates to satisfy artist and seed spacing when feasible', () => {
    const metadataByTrackID = new Map<number, HeartModeTrackMetadata>([
      [1, { artistIds: [10] }],
      [2, { artistIds: [10] }],
      [3, { artistIds: [20] }],
      [4, { artistIds: [30] }],
      [5, { artistIds: [40] }]
    ])
    const sourceSeedByTrackID = new Map<number, number>([
      [1, 100],
      [2, 100],
      [3, 200],
      [4, 100],
      [5, 200]
    ])
    const profile = {
      ...getHeartModePresetProfile('balanced'),
      maxSameArtistDistance: 2,
      maxSameSeedDistance: 1
    }

    const reranked = rerankHeartModeCandidatesForDiversity({
      rankedTrackIDs: [1, 2, 3, 4, 5],
      metadataByTrackID,
      sourceSeedByTrackID,
      likedTrackIDs: [],
      profile,
      targetCount: 5
    })

    expect(reranked).toEqual([1, 3, 4, 5, 2])
  })

  test('caps liked tracks according to familiarity when fresh candidates are available', () => {
    const rankedTrackIDs = Array.from({ length: 60 }, (_, index) => index + 1)
    const likedTrackIDs = rankedTrackIDs.slice(0, 30)
    const metadataByTrackID = new Map<number, HeartModeTrackMetadata>(
      rankedTrackIDs.map((id) => [id, { artistIds: [1000 + id] }])
    )
    const sourceSeedByTrackID = new Map<number, number>(
      rankedTrackIDs.map((id, index) => [id, 100 + (index % 4)])
    )
    const profile = {
      ...getHeartModePresetProfile('diverse'),
      familiarity: 35,
      maxSameArtistDistance: 0,
      maxSameSeedDistance: 0
    }

    const reranked = rerankHeartModeCandidatesForDiversity({
      rankedTrackIDs,
      metadataByTrackID,
      sourceSeedByTrackID,
      likedTrackIDs,
      profile,
      targetCount: 30
    })

    expect(reranked).toHaveLength(30)
    expect(reranked.filter((id) => likedTrackIDs.includes(id))).toHaveLength(11)
  })

  test('relaxes familiarity cap only when there are not enough fresh candidates', () => {
    const rankedTrackIDs = [1, 2, 3, 4, 5]
    const likedTrackIDs = [1, 2, 3, 4]
    const profile = {
      ...getHeartModePresetProfile('explore'),
      familiarity: 15,
      maxSameArtistDistance: 0,
      maxSameSeedDistance: 0
    }

    const reranked = rerankHeartModeCandidatesForDiversity({
      rankedTrackIDs,
      metadataByTrackID: new Map(),
      sourceSeedByTrackID: new Map(),
      likedTrackIDs,
      profile,
      targetCount: 5
    })

    expect(reranked).toHaveLength(5)
    expect(new Set(reranked)).toEqual(new Set(rankedTrackIDs))
  })

  test('relaxes impossible spacing constraints instead of dropping the queue', () => {
    const metadataByTrackID = new Map<number, HeartModeTrackMetadata>([
      [1, { artistIds: [10] }],
      [2, { artistIds: [10] }],
      [3, { artistIds: [10] }]
    ])
    const sourceSeedByTrackID = new Map<number, number>([
      [1, 100],
      [2, 100],
      [3, 100]
    ])
    const profile = {
      ...getHeartModePresetProfile('explore'),
      maxSameArtistDistance: 5,
      maxSameSeedDistance: 3
    }

    const reranked = rerankHeartModeCandidatesForDiversity({
      rankedTrackIDs: [1, 2, 3],
      metadataByTrackID,
      sourceSeedByTrackID,
      likedTrackIDs: [],
      profile,
      targetCount: 3
    })

    expect(reranked).toEqual([1, 2, 3])
  })

  test('lowers branch score on consecutive quick skips and lets positive playback recover it', () => {
    const initial: HeartModeBranchState = {
      seedId: 100,
      playedCount: 0,
      quickSkipCount: 0,
      consecutiveQuickSkips: 0,
      completionAverage: 0,
      positiveCount: 0,
      explicitBoostCount: 0,
      branchScore: 0
    }

    const firstSkip = calculateNextHeartModeBranchState(initial, {
      score: -4,
      completionRatio: 0.05,
      quickSkip: true,
      positive: false
    })
    const secondSkip = calculateNextHeartModeBranchState(firstSkip, {
      score: -4,
      completionRatio: 0.04,
      quickSkip: true,
      positive: false
    })
    const recovered = calculateNextHeartModeBranchState(secondSkip, {
      score: 2,
      completionRatio: 1,
      quickSkip: false,
      positive: true
    })

    expect(firstSkip.branchScore).toBeLessThan(0)
    expect(secondSkip.branchScore).toBeLessThan(firstSkip.branchScore)
    expect(secondSkip.consecutiveQuickSkips).toBe(2)
    expect(secondSkip.quickSkipCount).toBe(2)
    expect(recovered.branchScore).toBeGreaterThan(secondSkip.branchScore)
    expect(recovered.consecutiveQuickSkips).toBe(0)
    expect(recovered.positiveCount).toBe(1)
  })

  test('ignores neutral lifecycle feedback when updating branch state', () => {
    const previous: HeartModeBranchState = {
      seedId: 100,
      playedCount: 2,
      quickSkipCount: 1,
      consecutiveQuickSkips: 0,
      completionAverage: 0.6,
      positiveCount: 1,
      explicitBoostCount: 0,
      branchScore: 0.2
    }

    expect(
      calculateNextHeartModeBranchState(previous, {
        score: null,
        completionRatio: 0.1,
        quickSkip: false,
        positive: false
      })
    ).toEqual(previous)
  })

  test('exposes immutable-style score snapshots for recommendation explanations', () => {
    const scored = rankHeartModeCandidatesWithScores({
      seedTrackID: 1,
      candidateTrackIDs: [10, 20],
      likedTrackIDs: [1],
      recentPlayedTrackIDs: [],
      historyEntries: [],
      feedbackEntries: [],
      profile: getHeartModePresetProfile('diverse'),
      candidateSeedByTrackID: new Map([
        [10, 100],
        [20, 200]
      ]),
      branchScoreBySeedID: new Map([
        [100, 0.5],
        [200, -0.5]
      ]),
      pinSeedFirst: false,
      targetCount: 2,
      now: 1000
    })

    expect(scored).toHaveLength(2)
    expect(scored[0].id).toBe(10)
    expect(scored[0].sourceSeedId).toBe(100)
    expect(scored[0].breakdown.branchPreference).toBe(0.5)
    expect(Number.isFinite(scored[0].breakdown.total)).toBe(true)
  })

  test('records rerank decisions that explain seed-spacing moves', () => {
    const result = rerankHeartModeCandidatesWithDecisions({
      rankedTrackIDs: [1, 2, 3],
      metadataByTrackID: new Map(),
      sourceSeedByTrackID: new Map([
        [1, 100],
        [2, 100],
        [3, 200]
      ]),
      likedTrackIDs: [],
      profile: {
        ...getHeartModePresetProfile('balanced'),
        maxSameArtistDistance: 0,
        maxSameSeedDistance: 1
      },
      targetCount: 3
    })

    expect(result.trackIDs).toEqual([1, 3, 2])
    expect(result.decisions['3'].finalRank).toBe(1)
    expect(result.decisions['3'].movedForSeedSpacing).toBe(true)
  })

  test('wires explainability, steering, and safe session-learning reset into the player', () => {
    const session = readSource('src/renderer/utils/heartModeSession.ts')
    const feedback = readSource('src/renderer/utils/playbackFeedback.ts')
    const assistant = readSource('src/renderer/components/HeartModeAssistant.vue')
    const playPage = readSource('src/renderer/views/PlayPage.vue')
    const main = readSource('src/renderer/main.ts')

    expect(session).toContain('recommendationReasons')
    expect(session).toContain('boostHeartModeCurrentBranch')
    expect(session).toContain('steerHeartModeFurther')
    expect(session).toContain('resetCurrentHeartModeLearning')
    expect(session).toContain('explicitBoostCount')
    expect(feedback).toContain('removePlaybackFeedbackForHeartModeSession')
    expect(feedback).toContain('resetActivePlaybackFeedbackWindow')
    expect(assistant).toContain('多来点这种')
    expect(assistant).toContain('跳远一点')
    expect(assistant).toContain('重置本轮学习')
    expect(assistant).toContain('window.confirm')
    expect(playPage).toContain('<HeartModeAssistant />')
    expect(main).toContain('rankHeartModeCandidatesWithScores')
    expect(main).toContain('rerankHeartModeCandidatesWithDecisions')
    expect(main).toContain('recordHeartModeRecommendationReasons')
    expect(main).toContain('getEffectiveHeartModeProfile')
  })

  test('uses adaptive branch score to reorder otherwise similar refill candidates', () => {
    const ranked = rankHeartModeCandidatesByScore({
      seedTrackID: 1,
      candidateTrackIDs: [10, 20],
      likedTrackIDs: [],
      recentPlayedTrackIDs: [],
      historyEntries: [],
      feedbackEntries: [],
      profile: getHeartModePresetProfile('balanced'),
      candidateSeedByTrackID: new Map([
        [10, 100],
        [20, 200]
      ]),
      branchScoreBySeedID: new Map([
        [100, -1],
        [200, 1]
      ]),
      pinSeedFirst: false,
      targetCount: 2,
      now: 1000
    })

    expect(ranked).toEqual([20, 10])
  })

  test('replenishes a twelve-track rolling queue only after fewer than five remain', () => {
    expect(HEART_MODE_INITIAL_QUEUE_SIZE).toBe(12)
    expect(HEART_MODE_REFILL_THRESHOLD).toBe(5)
    expect(HEART_MODE_REFILL_COUNT).toBe(8)
    expect(getHeartModeRemainingQueueCount(6, 12)).toBe(5)
    expect(shouldReplenishHeartModeQueue(6, 12)).toBe(false)
    expect(getHeartModeRemainingQueueCount(7, 12)).toBe(4)
    expect(shouldReplenishHeartModeQueue(7, 12)).toBe(true)
  })

  test('keeps spacing constraints across the existing queue tail during refill', () => {
    const profile = {
      ...getHeartModePresetProfile('balanced'),
      maxSameArtistDistance: 0,
      maxSameSeedDistance: 1
    }
    const sourceSeedByTrackID = new Map<number, number>([
      [1, 100],
      [2, 100],
      [3, 200]
    ])

    expect(getHeartModeSpacingContext([7, 8, 1], profile)).toEqual([1])

    const reranked = rerankHeartModeCandidatesForDiversity({
      rankedTrackIDs: [2, 3],
      metadataByTrackID: new Map(),
      sourceSeedByTrackID,
      likedTrackIDs: [],
      profile,
      targetCount: 2,
      contextTrackIDs: [1]
    })

    expect(reranked).toEqual([3, 2])
  })

  test('counts only real active listening and ignores pause or seek jumps', () => {
    expect(
      calculateActiveListenIncrement({
        playing: true,
        wallDeltaSeconds: 1,
        progressDeltaSeconds: 1,
        playbackRate: 1
      })
    ).toBe(1)
    expect(
      calculateActiveListenIncrement({
        playing: false,
        wallDeltaSeconds: 1,
        progressDeltaSeconds: 1,
        playbackRate: 1
      })
    ).toBe(0)
    expect(
      calculateActiveListenIncrement({
        playing: true,
        wallDeltaSeconds: 1,
        progressDeltaSeconds: 180,
        playbackRate: 1
      })
    ).toBe(0)
    expect(
      calculateActiveListenIncrement({
        playing: true,
        wallDeltaSeconds: 1,
        progressDeltaSeconds: 0,
        playbackRate: 1
      })
    ).toBe(0)
  })

  test('maps listening behavior to preference signals without treating lifecycle events as dislike', () => {
    const makeFeedback = (patch: Partial<PlaybackFeedback>): PlaybackFeedback => ({
      trackId: 1,
      source: 'intelligence',
      durationSeconds: 200,
      activeListenSeconds: 10,
      completionRatio: 0.05,
      endReason: 'manual-next',
      likedAtEnd: false,
      likedDuringPlayback: false,
      playedAt: Date.now(),
      ...patch
    })

    expect(scorePlaybackFeedback(makeFeedback({}))).toBe(-4)
    expect(scorePlaybackFeedback(makeFeedback({ endReason: 'manual-select' }))).toBe(-4)
    expect(
      scorePlaybackFeedback(
        makeFeedback({ activeListenSeconds: 180, completionRatio: 0.9, endReason: 'manual-next' })
      )
    ).toBe(1)
    expect(
      scorePlaybackFeedback(
        makeFeedback({ activeListenSeconds: 10, completionRatio: 0.9, endReason: 'manual-next' })
      )
    ).toBe(1)
    expect(
      scorePlaybackFeedback(
        makeFeedback({ activeListenSeconds: 200, completionRatio: 1, endReason: 'natural-end' })
      )
    ).toBe(2)
    expect(
      scorePlaybackFeedback(
        makeFeedback({
          activeListenSeconds: 120,
          completionRatio: 0.6,
          endReason: 'natural-end',
          likedAtEnd: true,
          likedDuringPlayback: true
        })
      )
    ).toBe(7)
    expect(
      scorePlaybackFeedback(
        makeFeedback({
          activeListenSeconds: 120,
          completionRatio: 0.6,
          endReason: 'natural-end',
          likedAtEnd: true,
          likedDuringPlayback: false
        })
      )
    ).toBe(2)
    expect(scorePlaybackFeedback(makeFeedback({ endReason: 'playback-error' }))).toBeNull()
    expect(
      scorePlaybackFeedback(
        makeFeedback({
          endReason: 'playback-error',
          likedAtEnd: true,
          likedDuringPlayback: false
        })
      )
    ).toBeNull()
    expect(
      scorePlaybackFeedback(
        makeFeedback({
          endReason: 'playback-error',
          likedAtEnd: true,
          likedDuringPlayback: true
        })
      )
    ).toBe(5)
    expect(scorePlaybackFeedback(makeFeedback({ endReason: 'app-close' }))).toBeNull()
    expect(scorePlaybackFeedback(makeFeedback({ endReason: 'queue-replaced' }))).toBeNull()
  })

  test('uses the requested presets and keeps Diverse as the default exploration profile', () => {
    expect(getHeartModePresetProfile('continuous')).toMatchObject({
      diversity: 15,
      novelty: 40,
      familiarity: 80,
      repeatTolerance: 60,
      seedCount: 1
    })
    expect(getHeartModePresetProfile('balanced')).toMatchObject({
      diversity: 45,
      novelty: 60,
      familiarity: 55,
      repeatTolerance: 35,
      seedCount: 2
    })
    expect(getHeartModePresetProfile('diverse')).toMatchObject({
      diversity: 80,
      novelty: 75,
      familiarity: 35,
      repeatTolerance: 20,
      seedCount: 4,
      maxSameArtistDistance: 4,
      maxSameSeedDistance: 2
    })
    expect(getHeartModePresetProfile('explore')).toMatchObject({
      diversity: 95,
      novelty: 95,
      familiarity: 15,
      repeatTolerance: 5,
      seedCount: 5
    })
  })

  test('persists a cross-session cooldown and supplements candidates with multiple seeds', () => {
    const main = readSource('src/renderer/main.ts')
    const history = readSource('src/renderer/utils/heartModeHistory.ts')
    const scorer = readSource('src/renderer/utils/heartModeScorer.ts')
    const seedSelector = readSource('src/renderer/utils/heartModeSeedSelector.ts')
    const reranker = readSource('src/renderer/utils/heartModeReranker.ts')
    const feedback = readSource('src/renderer/utils/playbackFeedback.ts')
    const profile = readSource('src/renderer/utils/heartModeProfile.ts')
    const session = readSource('src/renderer/utils/heartModeSession.ts')
    const engine = readSource('src/renderer/utils/heartModeEngine.ts')
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const player = readSource('src/renderer/store/player.ts')
    const virtualTrackList = readSource('src/renderer/components/VirtualTrackList.vue')

    expect(main).toContain('await dataStore.fetchPlayHistory()')
    expect(main).toContain('recentTracks.value.map')
    expect(main).toContain('heartModeProfile.value.seedCount')
    expect(main).toContain('const branchResults = await Promise.all(')
    expect(main).toContain('seedTrackIDs.map(async (candidateSeedTrackID) => {')
    expect(main).toContain('recommendationsBySeed.set(')
    expect(main).toContain('interleaveHeartModeSeedCandidates(')
    expect(main).not.toContain('novelCandidateCount')
    expect(main).toContain('rankHeartModeCandidatesWithScores({')
    expect(main).toContain('targetCount: candidateTrackIDs.length + 1')
    expect(main).toContain('historyEntries: heartModeHistory')
    expect(main).toContain('feedbackEntries: playbackFeedback.value')
    expect(main).toContain(
      'completeHeartModeTrackMetadata(scoredHeartModeTrackIDs, metadataByTrackID)'
    )
    expect(main).toContain('rerankHeartModeCandidatesWithDecisions({')
    expect(main).toContain('likedTrackIDs,')
    expect(main).toContain('recordHeartModeTrackIDs(initialHeartModeTrackIDs)')
    expect(main).toContain('recordHeartModeTrackIDs(appendedTrackIDs)')
    expect(reranker).toContain('const maxLikedCount = Math.max(')
    expect(reranker).toContain('const familiarityCapReached = selectedLikedCount >= maxLikedCount')
    expect(scorer).toContain('const familiarityWeight = 0.45 * familiarityLevel')
    expect(seedSelector).toContain('interleaveHeartModeSeedCandidates')
    expect(seedSelector).toContain('for (let rank = 0; rank < maxBranchLength; rank += 1)')
    expect(reranker).toContain('maxSameArtistDistance')
    expect(reranker).toContain('maxSameSeedDistance')
    expect(reranker).toContain('totalViolation')
    expect(history).toContain("HEART_MODE_HISTORY_V1_KEY = 'vutronmusic-heart-mode-history-v1'")
    expect(history).toContain("HEART_MODE_HISTORY_KEY = 'vutronmusic-heart-mode-history-v2'")
    expect(history).toContain('MAX_HEART_MODE_HISTORY = 500')
    expect(history).toContain('calculateHeartModeRepeatPenalty')
    expect(history).not.toContain('HEART_MODE_HISTORY_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000')
    expect(scorer).toContain('aggregateTrackFeedbackScore')
    expect(scorer).toContain('rankHeartModeCandidatesByScore')
    expect(scorer).toContain('recentPlayed ? 0 : 1')
    expect(main).toContain('initializePlaybackFeedback(playerStore)')
    expect(main).toContain("markPlaybackEndReason('heart-mode-restart')")
    expect(main).toContain('createHeartModeSession({')
    expect(feedback).toContain("PLAYBACK_FEEDBACK_KEY = 'vutronmusic-playback-feedback-v1'")
    expect(feedback).toContain('activeListenSeconds')
    expect(feedback).toContain('activeProgressSeconds')
    expect(feedback).toContain('likedDuringPlayback')
    expect(feedback).toContain('window.vutronmusic?.progress')
    expect(feedback).toContain("case '_playNextTrack':")
    expect(feedback).toContain("return 'manual-next'")
    expect(feedback).toContain("finalizeActivePlayback('app-close')")
    expect(profile).toContain("HEART_MODE_PROFILE_KEY = 'vutronmusic-heart-mode-profile-v1'")
    expect(profile).toContain('HEART_MODE_CUSTOM_ALGORITHM_KEY')
    expect(profile).toContain('DEFAULT_HEART_MODE_PROFILE')
    expect(profile).toContain('persistProfile()')
    expect(profile).toContain('persistCustomAlgorithmEnabled()')
    expect(profile).toContain('stopPersistWatch = watch')
    expect(profile).toContain('stopAlgorithmPersistWatch = watch')
    expect(session).toContain("HEART_MODE_SESSION_KEY = 'vutronmusic-heart-mode-session-v1'")
    expect(session).toContain('sourceSeedByTrackID')
    expect(session).toContain('branchStates')
    expect(session).toContain('consecutiveQuickSkips')
    expect(session).toContain('pendingTrackIDs')
    expect(session).toContain('enqueuedTrackIDs')
    expect(session).toContain('calculateNextHeartModeBranchState')
    expect(engine).toContain('HEART_MODE_INITIAL_QUEUE_SIZE = 12')
    expect(engine).toContain('HEART_MODE_REFILL_THRESHOLD = 5')
    expect(engine).toContain('HEART_MODE_REFILL_COUNT = 8')
    expect(main).toContain('targetCount: HEART_MODE_INITIAL_QUEUE_SIZE')
    expect(main).toContain('pinSeedFirst: false')
    expect(main).toContain('branchScoreBySeedID: getHeartModeBranchScoreMap()')
    expect(main).toContain('playerStore.appendTracksToPlaylist(refillTrackIDs)')
    expect(main).toContain('recordHeartModeEnqueuedTracks(appendedTrackIDs)')
    expect(main).toContain('shouldReplenishHeartModeQueue(')
    expect(feedback).toContain('applyHeartModeFeedbackToSession({')
    expect(player).toContain('const appendTracksToPlaylist =')
    expect(settings).toContain('settings.heartModeProfile.title')
    expect(settings).toContain('v-model="selectedHeartModeMode"')
    expect(settings).toContain("heartModeProfile.mode === 'custom'")
    expect(settings).toContain("updateHeartModeAdvanced('maxSameArtistDistance', $event)")
    expect(settings).toContain("updateHeartModeAdvanced('maxSameSeedDistance', $event)")
    expect(player).toContain("markPlaybackEndReason('natural-end')")
    expect(player).toContain("markPlaybackEndReason('playback-error')")
    expect(player).toContain('return playNextFMTrack()')
    expect(player).toContain('return playNext()')
    expect(virtualTrackList).toContain("markPlaybackEndReason('manual-select')")
  })
})

test.describe('desktop lyric partial passthrough', () => {
  const region = { x: 100, y: 50, width: 45, height: 35 }

  test('keeps the cover-control region interactive', () => {
    expect(isPointInsideRectangle({ x: 110, y: 60 }, region, 2)).toBe(true)
    expect(isPointInsideRectangle({ x: 98, y: 48 }, region, 2)).toBe(true)
  })

  test('keeps the lyric region outside the interactive hit target', () => {
    expect(isPointInsideRectangle({ x: 200, y: 60 }, region, 2)).toBe(false)
    expect(isPointInsideRectangle({ x: 110, y: 100 }, region, 2)).toBe(false)
  })
})

test.describe('desktop feature integration', () => {
  test('keeps strict CSP while enabling Vue I18n JIT AST compilation', () => {
    const csp = readSource('src/main/security/contentSecurityPolicy.ts')
    const vite = readSource('vite.config.ts')

    expect(csp).toContain('"script-src \'self\'"')
    expect(csp).not.toContain("'unsafe-eval'")
    expect(vite).toContain('__INTLIFY_JIT_COMPILATION__: true')
    expect(vite).toContain('__INTLIFY_DROP_MESSAGE_COMPILER__: false')
  })

  test('includes queue-end sleep actions and preset editing tools', () => {
    const sleepTimer = readSource('src/renderer/utils/sleepTimerSettings.ts')
    const presetDraft = readSource('src/renderer/utils/osdPresetDraftState.ts')
    const presetTransfer = readSource('src/renderer/utils/osdPresetTransferPreview.ts')

    expect(sleepTimer).toContain("'queueEnd'")
    expect(sleepTimer).toContain("SleepTimerAction = 'pause' | 'quit'")
    expect(sleepTimer).toContain('completeSleepTimerAtQueueEnd')
    expect(presetDraft).toContain('未保存修改')
    expect(presetDraft).toContain('撤销本次修改')
    expect(presetTransfer).toContain('vutronmusic-osd-preset')
    expect(presetTransfer).toContain('导出当前')
    expect(presetTransfer).toContain('导入预设')
    expect(presetTransfer).toContain("select.addEventListener('change', showSelectedPresetPreview)")
    expect(presetTransfer).toContain('resolveSelectedSettings(select.value)')
    expect(presetTransfer).toContain(
      'event.key === PRESETS_STORAGE_KEY || event.key === BUILTIN_OVERRIDES_STORAGE_KEY'
    )
    expect(presetTransfer).toContain(
      "button.addEventListener('click', refreshPreviewAfterPresetAction)"
    )
  })

  test('allows context menus to be dismissed without choosing an action', () => {
    const contextMenu = readSource('src/renderer/components/ContextMenu.vue')

    expect(contextMenu).toContain("document.addEventListener('pointerdown'")
    expect(contextMenu).toContain("document.addEventListener('keydown'")
    expect(contextMenu).toContain("event.key !== 'Escape'")
    expect(contextMenu).toContain('const shouldToggleClosed =')
    expect(contextMenu).toContain('if (shouldToggleClosed) return')
  })

  test('keeps speed and pitch presets separated from the fine-adjust sliders', () => {
    const playback = readSource('src/renderer/components/ModalPlayback.vue')
    const pitch = readSource('src/renderer/components/ModalPitch.vue')

    expect(playback).toContain("$t('player.playbackRateModal.title')")
    expect(playback).toContain("$t('player.playbackRateModal.current')")
    expect(playback).toContain('class="preset-grid"')
    expect(playback).toContain('playbackRatePresets')
    expect(playback).not.toContain(':marks="marks"')
    expect(pitch).toContain('class="preset-grid"')
    expect(pitch).toContain('pitchPresets')
    expect(pitch).not.toContain(':marks="marks"')
  })

  test('keeps Classic cover, lyrics and lyric timing tools visually aligned', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')
    const lyricPage = readSource('src/renderer/components/LyricPage.vue')

    expect(commonPlayer).toContain("'calc(100% - 72px)'")
    expect(commonPlayer).toContain("'24px'")
    expect(commonPlayer).toContain('flex: 0 1 45%')
    expect(commonPlayer).toContain('align-items: flex-end')
    expect(commonPlayer).toContain('flex: 1 1 55%')
    expect(lyricPage).toContain('width: 44px')
    expect(lyricPage).toContain('height: 44px')
    expect(lyricPage).toContain('width: 22px')
    expect(lyricPage).toContain('height: 22px')
  })

  test('centers the Classic cover when lyrics are absent or the window becomes portrait', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')

    expect(commonPlayer).toContain('&.no-lyric {')
    expect(commonPlayer).toContain('flex: 1 1 100%')
    expect(commonPlayer).toContain('flex: 0 0 0')
    expect(commonPlayer).toContain('width: 0')
    expect(commonPlayer).toContain('overflow: hidden')
    expect(commonPlayer).toContain('&.isMobile {')
    expect(commonPlayer).toContain('width: 100%')
    expect(commonPlayer).toContain('align-items: center')
  })

  test('keeps the Classic lyric toolbar and comments inside the viewport tool lane', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')
    const commentList = readSource('src/renderer/components/CommentList.vue')
    const writeComment = readSource('src/renderer/components/WriteComment.vue')

    expect(commonPlayer).toContain('padding: 0 0 0 clamp(20px, 3vw, 44px)')
    expect(commonPlayer).toContain("'40px 72px 10px 4vh'")
    expect(commentList).toContain('flex: 1 1 auto')
    expect(commentList).toContain('min-height: 0')
    expect(commentList).toContain('flex: 0 0 auto')
    expect(writeComment).toContain('height: 44px')
  })

  test('toggles PlayerBar mute and keeps continuous sliders position-aware', () => {
    const playerBar = readSource('src/renderer/components/PlayerBar.vue')
    const slider = readSource('src/renderer/components/VueSlider.vue')
    const zhHans = readSource('src/renderer/locales/zh-hans.json')
    const zhHant = readSource('src/renderer/locales/zh-hant.json')
    const en = readSource('src/renderer/locales/en.json')

    expect(playerBar).toContain('@click.stop="toggleMute"')
    expect(playerBar).toContain('volumeBeforeMuted.value = volume.value')
    expect(playerBar).toContain('volume.value = restoreVolume')
    expect(playerBar).toContain("$t('player.unmute')")
    expect(playerBar).not.toContain(':dot-style="{ display: \'none\' }"')
    expect(slider).toContain('class="vue-slider-dot"')
    expect(slider).toContain('const dotStyle = computed')
    expect(slider).toContain('normalizedValue.value * 100')
    for (const locale of [zhHans, zhHant, en]) {
      expect(locale).toContain('\"unmute\"')
    }
  })

  test('keeps injected settings controls theme-aware and activates custom accent colors', () => {
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const sharedFeatures = readSource('src/renderer/utils/v327FeatureShared.ts')

    expect(settings).toContain('@update:value="selectCustomizeColor"')
    expect(settings).toContain('const selectCustomizeColor = (value: string) => {')
    expect(settings).toContain('customizeColor.value.color = value')
    expect(settings).toContain('changeColor(customizeColor.value)')
    expect(sharedFeatures).toContain('color: var(--color-text);')
    expect(sharedFeatures).toContain('background: var(--color-secondary-bg);')
    expect(sharedFeatures).toContain('.vutronmusic-v327-controls button {')
  })

  test('keeps update diagnostics actions readable in dark mode', () => {
    const latestVersion = readSource('src/renderer/components/LatestVersion.vue')

    expect(latestVersion).toContain('.diagnostic-panel {')
    expect(latestVersion).toContain('.diagnostic-panel__actions {')
    expect(latestVersion).toContain('color: var(--color-text);')
    expect(latestVersion).toContain('font: inherit;')
  })

  test('applies fade-in only after audio playback has started', () => {
    const player = readSource('src/renderer/store/player.ts')
    const replacePlaylist = player.slice(
      player.indexOf('const replacePlaylist = async'),
      player.indexOf('const replaceCurrentTrack = async')
    )
    const replaceCurrentTrack = player.slice(
      player.indexOf('const replaceCurrentTrack = async'),
      player.indexOf('// const _scrobble')
    )
    const play = player.slice(
      player.indexOf('const play = async'),
      player.indexOf('const pause = async')
    )

    expect(replacePlaylist).not.toContain('await smoothGain(0, 0)')
    expect(replaceCurrentTrack).not.toContain('await smoothGain(0, 0)')
    expect(player).toContain('await smoothGain(0, fade)')
    expect(play).toContain('await smoothGain(0, 0)')
    expect(play).toContain('await audioNodes.audio.play()')
    expect(play).toContain('void smoothGain(volume.value, fade)')
    expect(play.indexOf('await audioNodes.audio.play()')).toBeLessThan(
      play.indexOf('void smoothGain(volume.value, fade)')
    )
  })

  test('makes Classic volume step icons functional and self-describing', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')
    const zhHans = readSource('src/renderer/locales/zh-hans.json')
    const zhHant = readSource('src/renderer/locales/zh-hant.json')
    const en = readSource('src/renderer/locales/en.json')

    expect(commonPlayer).toContain('@click="adjustVolume(-0.05)"')
    expect(commonPlayer).toContain('@click="adjustVolume(0.05)"')
    expect(commonPlayer).toContain("$t('player.volumeDown')")
    expect(commonPlayer).toContain("$t('player.volumeUp')")
    expect(commonPlayer).toContain('Math.min(1, Math.max(0, volume.value + delta))')
    expect(commonPlayer).toContain('Math.round(nextVolume * 100) / 100')
    for (const locale of [zhHans, zhHant, en]) {
      expect(locale).toContain('\"volumeDown\"')
      expect(locale).toContain('\"volumeUp\"')
    }
  })

  test('keeps Classic track metadata readable and player actions self-describing', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')
    const playPage = readSource('src/renderer/views/PlayPage.vue')
    const zhHans = readSource('src/renderer/locales/zh-hans.json')
    const zhHant = readSource('src/renderer/locales/zh-hant.json')
    const en = readSource('src/renderer/locales/en.json')

    expect(commonPlayer).toContain(':title="currentTrack?.name || \'\'"')
    expect(commonPlayer).toContain(':title="trackDetailsTitle"')
    expect(commonPlayer).toContain("$t('player.switchTranslation')")
    expect(commonPlayer).toContain("$t('player.addToPlaylist')")
    expect(commonPlayer).toContain("$t('player.moreActions')")
    expect(commonPlayer).toContain("$t(playing ? 'player.pause' : 'player.play')")
    expect(commonPlayer).toContain("$t('player.shuffle')")
    expect(commonPlayer).toContain(
      '-webkit-line-clamp: 2;\n          line-clamp: 2;\n          line-height: 1.28'
    )
    expect(playPage).toContain("$t('player.playerTheme')")
    expect(playPage).toContain("$t('player.collapsePlayer')")
    expect(playPage).toContain("t('player.showComments')")
    for (const locale of [zhHans, zhHant, en]) {
      expect(locale).toContain('\"switchTranslation\"')
      expect(locale).toContain('\"collapsePlayer\"')
      expect(locale).toContain('\"showFullLyrics\"')
    }
  })

  test('routes Linux update checks through the Electron session network stack', () => {
    const updater = readSource('src/main/checkUpdate.ts')

    expect(updater).toContain(
      "import { BrowserWindow, app, dialog, session, shell } from 'electron'"
    )
    expect(updater).toContain('session.defaultSession.fetch(RELEASE_API_URL')
    expect(updater).not.toContain('await fetch(RELEASE_API_URL')
  })

  test('keeps desktop lyric playback independent from main-window input focus', () => {
    const ipcs = readSource('src/main/IPCs.ts')
    const preload = readSource('src/preload/index.ts')
    const player = readSource('src/renderer/store/player.ts')

    expect(ipcs).toContain("message === 'playOrPauseFromOsd'")
    expect(ipcs).toContain("win.webContents.send('play-from-osd')")
    expect(preload).toContain("'play-from-osd'")
    expect(player).toContain("window.mainApi?.on('play-from-osd'")
    expect(player).toContain("window.mainApi?.on('play', () => {")
  })

  test('toggles the main window by visibility rather than transient focus', () => {
    const ipcs = readSource('src/main/IPCs.ts')

    expect(ipcs).toContain('const revealMainWindowFromOsd =')
    expect(ipcs).toContain('if (win.isMinimized()) win.restore()')
    expect(ipcs).toContain('win.isMinimized() || !win.isVisible()')
    expect(ipcs).not.toContain('win.isMinimized() || !win.isVisible() || !win.isFocused()')
    expect(ipcs).toContain('win.hide()')
    expect(ipcs).toContain('revealMainWindowFromOsd(win)')
  })

  test('uses exactly one desktop-lyric play toggle route', () => {
    const constants = readSource('src/main/utils/Constants.ts')
    const ipcs = readSource('src/main/IPCs.ts')
    const player = readSource('src/renderer/store/player.ts')

    expect(constants).not.toContain("import '../osdPlaybackBridge'")
    expect(ipcs).toContain("message === 'playOrPauseFromOsd'")
    expect(ipcs).toContain("win.webContents.send('play-from-osd')")
    expect(player).toContain("window.mainApi?.on('play-from-osd'")
    expect(player).toContain('watch(playing, (value) => {')
  })

  test('renders concise release notes as cleaned bullet points', () => {
    const latestVersion = readSource('src/renderer/components/LatestVersion.vue')

    expect(latestVersion).toContain('v-if="releaseNoteItems.length"')
    expect(latestVersion).toContain('MAX_RELEASE_NOTE_ITEMS = 8')
    expect(latestVersion).toContain('buildReleaseNoteItems')
    expect(latestVersion).not.toContain('v-same-html="latestVersion?.updateInfo?.releaseNotes')
  })

  test('uses the same pill toggle geometry across settings controls', () => {
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const coverControls = readSource('src/renderer/utils/osdCoverControlsSettings.ts')

    expect(settings).toContain('.toggle input + label {')
    expect(settings).toContain('height: 24px;')
    expect(settings).toContain('width: 44px;')
    expect(settings).toContain('border-radius: 999px;')
    expect(settings).toContain('height: 18px;')
    expect(settings).toContain('width: 18px;')
    expect(settings).toContain('border-radius: 50%;')
    expect(settings).toContain('left: 23px;')

    expect(coverControls).toContain('width: 44px;')
    expect(coverControls).toContain('height: 24px;')
    expect(coverControls).toContain('border-radius: 999px;')
    expect(coverControls).toContain('width: 18px;')
    expect(coverControls).toContain('height: 18px;')
    expect(coverControls).toContain('border-radius: 50%;')
  })

  test('matches the Linux desktop launcher to Electron actual WM_CLASS', () => {
    const main = readSource('src/main/index.ts')
    const builder = readSource('buildAssets/builder/config.js')

    expect(main).not.toContain("app.commandLine.appendSwitch('class', 'vutron')")
    expect(builder).toContain("StartupWMClass: 'VutronMusic'")
    expect(builder).toContain("executableName: 'vutron'")
  })

  test('restores and explicitly reveals persisted desktop lyrics', () => {
    const main = readSource('src/main/index.ts')

    expect(main).toContain('this.initOSDWindow()')
    expect(main).toContain('this.handleOSDWindowEvents()')
    expect(main).toContain('await lyricWin.loadURL(Constants.APP_OSD_URL)')
    expect(main).toContain('lyricWin.showInactive()')
    expect(main).toContain("log.error('[OSD] Failed to load desktop lyric window:'")
    expect(main).toContain('if (this.lyricWin?.isDestroyed()) this.lyricWin = null')
  })

  test('keeps language switching reactive across Vue and injected controls', () => {
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const shared = readSource('src/renderer/utils/v327FeatureShared.ts')
    const select = readSource('src/renderer/components/CustomSelect.vue')
    const playback = readSource('src/renderer/components/ModalPlayback.vue')
    const pitch = readSource('src/renderer/components/ModalPitch.vue')
    const diagnostics = readSource('src/renderer/components/LatestVersion.vue')
    const compact = readSource('src/renderer/components/CompactCoverControls.vue')

    expect(settings).toContain('setFeatureLanguage(value as SupportedLanguage)')
    expect(settings).toContain('const languageOption = computed(() => [')
    expect(settings).toContain('const translateOptions = computed(() => [')
    expect(shared).toContain("FEATURE_LANGUAGE_CHANGE_EVENT = 'vutronmusic-language-change'")
    expect(shared).toContain('const featureLanguage = ref<SupportedLanguage>')
    expect(shared).toContain('refreshInjectedControlsForLanguage')
    expect(select).toContain("t('common.selectPlaceholder')")
    expect(select).toContain("t('common.searchPlaceholder')")
    expect(playback).toContain("$t('player.playbackRateModal.title')")
    expect(pitch).toContain("$t('player.pitchModal.title')")
    expect(diagnostics).toContain('settings.update.diagnostics.title')
    expect(compact).toContain('computed(() => TEXTS[resolveFeatureLanguage()])')
  })

  test('registers diagnostics and playback-history integrations', () => {
    const constants = readSource('src/main/utils/Constants.ts')
    const main = readSource('src/renderer/main.ts')
    const playPage = readSource('src/renderer/views/PlayPage.vue')

    expect(constants).toContain("import '../runtimeDiagnostics'")
    expect(main).toContain('initializePlaybackHistory(playerStore)')
    expect(main).toContain('initializeTrackLyricOffset(playerStore)')
    expect(playPage).toContain('<PlaybackHistoryModal />')
    expect(playPage).toContain('<TrackLyricOffsetModal />')
  })

  test('keeps Heart Mode assistant draggable, theme-aware and visually consistent', () => {
    const assistant = readSource('src/renderer/components/HeartModeAssistant.vue')

    expect(assistant).toContain('@pointerdown="startDrag"')
    expect(assistant).toContain('vutronmusic-heart-mode-assistant-position-v1')
    expect(assistant).toContain('clampAssistantPosition')
    expect(assistant).toContain('panelHorizontalClass')
    expect(assistant).toContain('panelVerticalClass')
    expect(assistant).toContain('settingsStore.theme.appearance')
    expect(assistant).toContain('.heart-mode-assistant.is-dark .heart-mode-trigger')
    expect(assistant).toContain('background: var(--color-primary)')
    expect(assistant).toContain('class="heart-action-button"')
    expect(assistant).not.toContain('button:first-child')
    expect(assistant).not.toContain('button:last-child')
    expect(assistant).toContain('strategyScoreBullets')
    expect(assistant).toContain('strategyFeedbackBullets')
    expect(assistant).toContain('strategyControlBullets')
    expect(assistant).toContain('v-for="bullet in item.bullets"')
  })

  test('shares Heart Mode profile controls and custom algorithm switch across UI and runtime', () => {
    const assistant = readSource('src/renderer/components/HeartModeAssistant.vue')
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const profile = readSource('src/renderer/utils/heartModeProfile.ts')
    const session = readSource('src/renderer/utils/heartModeSession.ts')
    const main = readSource('src/renderer/main.ts')

    expect(profile).toContain('vutronmusic-heart-mode-custom-algorithm-enabled-v1')
    expect(profile).toContain('heartModeCustomAlgorithmEnabled = ref(true)')
    expect(profile).toContain('setHeartModeCustomAlgorithmEnabled')

    expect(settings).toContain('v-model="useCustomHeartModeAlgorithm"')
    expect(settings).toContain('settings.heartModeProfile.algorithmEnabled')

    expect(assistant).toContain('v-model="customAlgorithmEnabled"')
    expect(assistant).toContain('v-model="selectedProfileMode"')
    expect(assistant).toContain('profileCoreControls')
    expect(assistant).toContain('profile-advanced-grid')
    expect(assistant).toContain("type HeartModePanelPage = 'main' | 'settings' | 'guide'")
    expect(assistant).toContain('class="panel-tabs"')
    expect(assistant).toContain('role="tablist"')
    expect(assistant).toContain('class="panel-tab"')
    expect(assistant).toContain("panelPage = 'settings'")
    expect(assistant).toContain("panelPage = 'guide'")
    expect(assistant).toContain("panelPage = 'main'")
    expect(assistant).toContain(':aria-selected="panelPage === \'main\'"')
    expect(assistant).toContain(':aria-selected="panelPage === \'settings\'"')
    expect(assistant).toContain(':aria-selected="panelPage === \'guide\'"')
    expect(assistant).not.toContain('class="back-button"')
    expect(assistant).not.toContain('class="nav-card"')
    expect(assistant).toContain('currentProfileModeDescription')
    expect(assistant).toContain('modeContinuousDesc')
    expect(assistant).toContain('modeBalancedDesc')
    expect(assistant).toContain('modeDiverseDesc')
    expect(assistant).toContain('modeExploreDesc')
    expect(assistant).toContain('modeCustomDesc')
    expect(assistant).toContain('profile-summary')
    expect(assistant).not.toContain('<details class="profile-card"')
    expect(assistant).not.toContain('<details class="strategy-card"')
    expect(assistant).toContain(':disabled="!customAlgorithmEnabled || !session"')

    expect(main).toContain('const startBasicHeartModeQueue = async')
    expect(main).toContain('slice(0, HEART_MODE_TARGET_COUNT)')
    expect(main).toContain("replacePlaylist('intelligence', playlistID, trackIDs, 0)")
    expect(main).toContain('if (!heartModeCustomAlgorithmEnabled.value) {')
    expect(main).toContain('clearCurrentHeartModeSession()')
    expect(main).toContain('if (!heartModeCustomAlgorithmEnabled.value) return')
    expect(session).toContain(
      'if (!heartModeCustomAlgorithmEnabled.value || !currentSession) return null'
    )
  })
})
