import type { HeartModeProfile } from './heartModeProfile'
import type { HeartModeHistoryEntry } from './heartModeHistory'
import { calculateHeartModeRepeatPenalty } from './heartModeHistory'
import type { PlaybackFeedback } from './playbackFeedback'
import { scorePlaybackFeedback } from './playbackFeedback'

export type HeartModeScoreBreakdown = {
  rankQuality: number
  novelty: number
  familiarity: number
  behavior: number
  repeatPenalty: number
  recentPlayedPenalty: number
  seedDiversity: number
  total: number
}

export type HeartModeScoredCandidate = {
  id: number
  originalRank: number
  sourceSeedId?: number
  breakdown: HeartModeScoreBreakdown
}

export type HeartModeScorerOptions = {
  seedTrackID: number
  candidateTrackIDs: number[]
  likedTrackIDs: Iterable<number>
  recentPlayedTrackIDs: Iterable<number>
  historyEntries: HeartModeHistoryEntry[]
  feedbackEntries: PlaybackFeedback[]
  profile: HeartModeProfile
  candidateSeedByTrackID?: ReadonlyMap<number, number> | Record<string, number>
  targetCount?: number
  now?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const FEEDBACK_HALF_LIFE_MS = 45 * DAY_MS

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const clamp01 = (value: number): number => clamp(value, 0, 1)

const normalizeTrackIDs = (ids: Iterable<number>): number[] =>
  Array.from(
    new Set(
      Array.from(ids)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  )

const resolveSourceSeedID = (
  candidateSeedByTrackID: HeartModeScorerOptions['candidateSeedByTrackID'],
  trackID: number
): number | undefined => {
  if (!candidateSeedByTrackID) return undefined

  const raw =
    candidateSeedByTrackID instanceof Map
      ? candidateSeedByTrackID.get(trackID)
      : candidateSeedByTrackID[String(trackID)]

  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

/**
 * 汇总某首歌曲的历史行为反馈，输出 -1..1。
 *
 * 只使用 Phase 1 已定义为有效偏好的事件：
 * - 快速/中途跳过为负；
 * - 高完播、自然结束、播放中主动点赞为正；
 * - app-close / playback-error / queue-replaced 等生命周期事件为 null，不参与。
 *
 * 越新的反馈权重越高，45 天为指数半衰期。
 */
export const aggregateTrackFeedbackScore = (
  trackID: number,
  feedbackEntries: PlaybackFeedback[],
  now = Date.now()
): number => {
  let weightedScore = 0
  let totalWeight = 0

  for (const feedback of feedbackEntries) {
    if (Number(feedback.trackId) !== Number(trackID)) continue

    const score = scorePlaybackFeedback(feedback)
    if (score === null) continue

    const ageMs = Math.max(0, now - Number(feedback.playedAt || now))
    const recencyWeight = Math.pow(0.5, ageMs / FEEDBACK_HALF_LIFE_MS)
    weightedScore += score * recencyWeight
    totalWeight += recencyWeight
  }

  if (totalWeight <= 0) return 0

  // Phase 1 的强负反馈基线是 -4，因此以 4 归一化：
  // quick skip -> -1，natural end -> +0.5，主动点赞可达到 +1。
  return clamp(weightedScore / totalWeight / 4, -1, 1)
}

/**
 * 计算一个候选的可解释分数。
 *
 * Phase 3 只改变候选排序，不做 Phase 4 的艺人/专辑邻接重排：
 * - NetEase rank 仍作为质量先验；
 * - novelty/familiarity 由 Profile 控制；
 * - behavior 来自真实播放反馈；
 * - history 使用连续时间衰减，而不是固定 14 天硬过滤；
 * - diversity 在本阶段只给“非主 seed 分支”一个轻量奖励。
 */
export const scoreHeartModeCandidate = ({
  trackID,
  originalRank,
  candidateCount,
  sourceSeedID,
  seedTrackID,
  liked,
  recentPlayed,
  historyEntry,
  feedbackEntries,
  profile,
  now
}: {
  trackID: number
  originalRank: number
  candidateCount: number
  sourceSeedID?: number
  seedTrackID: number
  liked: boolean
  recentPlayed: boolean
  historyEntry?: HeartModeHistoryEntry
  feedbackEntries: PlaybackFeedback[]
  profile: HeartModeProfile
  now: number
}): HeartModeScoreBreakdown => {
  const noveltyLevel = clamp01(profile.novelty / 100)
  const familiarityLevel = clamp01(profile.familiarity / 100)
  const diversityLevel = clamp01(profile.diversity / 100)
  const repeatTolerance = clamp01(profile.repeatTolerance / 100)

  const rankQuality =
    candidateCount <= 1
      ? 1
      : clamp01(1 - originalRank / Math.max(1, candidateCount - 1))

  // “最近听过但没点赞”不是 dislike；这里只降低“新鲜度”，不附加未点赞惩罚。
  const novelty = recentPlayed ? 0 : 1
  const familiarity = liked ? 1 : 0
  const behavior = aggregateTrackFeedbackScore(trackID, feedbackEntries, now)

  const repeatPenalty = historyEntry
    ? calculateHeartModeRepeatPenalty({
        recommendedAt: historyEntry.recommendedAt,
        now,
        shortCooldownHours: profile.shortCooldownHours,
        mediumCooldownDays: profile.mediumCooldownDays,
        longCooldownDays: profile.longCooldownDays
      })
    : 0

  const recentPlayedPenalty = recentPlayed ? 1 : 0
  const seedDiversity =
    sourceSeedID && sourceSeedID !== seedTrackID ? 1 : 0

  const rankWeight = 1.4
  const noveltyWeight = 0.35 + 1.65 * noveltyLevel
  const familiarityWeight = 1.5 * familiarityLevel
  const behaviorWeight = 1.3

  // repeatTolerance 越高，重复相关惩罚越弱，但不会彻底归零。
  const repeatScale = 1 - 0.85 * repeatTolerance
  const repeatWeight = (0.6 + 1.6 * noveltyLevel) * repeatScale
  const recentPlayedWeight = (0.35 + 0.9 * noveltyLevel) * repeatScale

  // Phase 4 才会真正按艺人/seed 做邻接重排；这里仅让多分支候选有轻量机会。
  const seedDiversityWeight = 0.45 * diversityLevel

  const total =
    rankWeight * rankQuality +
    noveltyWeight * novelty +
    familiarityWeight * familiarity +
    behaviorWeight * behavior +
    seedDiversityWeight * seedDiversity -
    repeatWeight * repeatPenalty -
    recentPlayedWeight * recentPlayedPenalty

  return {
    rankQuality,
    novelty,
    familiarity,
    behavior,
    repeatPenalty,
    recentPlayedPenalty,
    seedDiversity,
    total
  }
}

/**
 * 使用 Profile + 历史 + 真实播放反馈对 NetEase 候选做 Phase 3 动态排序。
 *
 * seed 固定为第一首，剩余候选按 total score 降序；同分时保持 NetEase 原始顺序。
 */
export const rankHeartModeCandidatesByScore = ({
  seedTrackID,
  candidateTrackIDs,
  likedTrackIDs,
  recentPlayedTrackIDs,
  historyEntries,
  feedbackEntries,
  profile,
  candidateSeedByTrackID,
  targetCount = 30,
  now = Date.now()
}: HeartModeScorerOptions): number[] => {
  const seed = Number(seedTrackID)
  if (!Number.isFinite(seed) || seed <= 0) return []

  const candidates = normalizeTrackIDs(candidateTrackIDs).filter((id) => id !== seed)
  const liked = new Set(normalizeTrackIDs(likedTrackIDs))
  const recentPlayed = new Set(normalizeTrackIDs(recentPlayedTrackIDs))

  const historyByTrackID = new Map<number, HeartModeHistoryEntry>()
  for (const entry of historyEntries) {
    const existing = historyByTrackID.get(entry.id)
    if (!existing || entry.recommendedAt > existing.recommendedAt) {
      historyByTrackID.set(entry.id, entry)
    }
  }

  const scored: HeartModeScoredCandidate[] = candidates.map((id, originalRank) => {
    const sourceSeedId = resolveSourceSeedID(candidateSeedByTrackID, id)
    return {
      id,
      originalRank,
      sourceSeedId,
      breakdown: scoreHeartModeCandidate({
        trackID: id,
        originalRank,
        candidateCount: candidates.length,
        sourceSeedID: sourceSeedId,
        seedTrackID: seed,
        liked: liked.has(id),
        recentPlayed: recentPlayed.has(id),
        historyEntry: historyByTrackID.get(id),
        feedbackEntries,
        profile,
        now
      })
    }
  })

  scored.sort((left, right) => {
    const delta = right.breakdown.total - left.breakdown.total
    if (Math.abs(delta) > 1e-9) return delta
    return left.originalRank - right.originalRank
  })

  return [seed, ...scored.map((item) => item.id)].slice(
    0,
    Math.max(1, Math.round(targetCount))
  )
}
