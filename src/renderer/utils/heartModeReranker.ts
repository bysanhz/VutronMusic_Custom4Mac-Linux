import type { HeartModeProfile } from './heartModeProfile'

export type HeartModeTrackMetadata = {
  artistIds: number[]
  albumId?: number
}

export type HeartModeRerankDecision = {
  originalRank: number
  finalRank: number
  artistViolation: number
  seedViolation: number
  movedForArtistSpacing: boolean
  movedForSeedSpacing: boolean
  familiarityDeferred: boolean
}

export type HeartModeRerankResult = {
  trackIDs: number[]
  decisions: Record<string, HeartModeRerankDecision>
}

export type HeartModeRerankOptions = {
  rankedTrackIDs: number[]
  metadataByTrackID: ReadonlyMap<number, HeartModeTrackMetadata>
  sourceSeedByTrackID: Map<number, number> | Record<string, number>
  likedTrackIDs: Iterable<number>
  profile: HeartModeProfile
  targetCount?: number
  contextTrackIDs?: Iterable<number>
}

const normalizeID = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

const resolveSeedID = (
  sourceSeedByTrackID: HeartModeRerankOptions['sourceSeedByTrackID'],
  trackID: number
): number | undefined => {
  const raw =
    sourceSeedByTrackID instanceof Map
      ? sourceSeedByTrackID.get(trackID)
      : sourceSeedByTrackID[String(trackID)]
  return normalizeID(raw) ?? undefined
}

const hasArtistOverlap = (
  left: HeartModeTrackMetadata | undefined,
  right: HeartModeTrackMetadata | undefined
): boolean => {
  if (!left?.artistIds?.length || !right?.artistIds?.length) return false
  const rightArtists = new Set(right.artistIds)
  return left.artistIds.some((artistID) => rightArtists.has(artistID))
}

type ConstraintEvaluation = {
  artistViolation: number
  seedViolation: number
  totalViolation: number
}

const evaluateSpacing = ({
  trackID,
  selectedTrackIDs,
  metadataByTrackID,
  sourceSeedByTrackID,
  artistDistance,
  seedDistance
}: {
  trackID: number
  selectedTrackIDs: number[]
  metadataByTrackID: ReadonlyMap<number, HeartModeTrackMetadata>
  sourceSeedByTrackID: HeartModeRerankOptions['sourceSeedByTrackID']
  artistDistance: number
  seedDistance: number
}): ConstraintEvaluation => {
  const candidateMetadata = metadataByTrackID.get(trackID)
  const candidateSeedID = resolveSeedID(sourceSeedByTrackID, trackID)

  let artistViolation = 0
  let seedViolation = 0

  if (artistDistance > 0 && candidateMetadata?.artistIds?.length) {
    const start = Math.max(0, selectedTrackIDs.length - artistDistance)
    for (let index = start; index < selectedTrackIDs.length; index += 1) {
      const previousTrackID = selectedTrackIDs[index]
      if (!hasArtistOverlap(candidateMetadata, metadataByTrackID.get(previousTrackID))) continue

      const distance = selectedTrackIDs.length - index
      artistViolation = Math.max(artistViolation, artistDistance - distance + 1)
    }
  }

  if (seedDistance > 0 && candidateSeedID) {
    const start = Math.max(0, selectedTrackIDs.length - seedDistance)
    for (let index = start; index < selectedTrackIDs.length; index += 1) {
      const previousTrackID = selectedTrackIDs[index]
      if (resolveSeedID(sourceSeedByTrackID, previousTrackID) !== candidateSeedID) continue

      const distance = selectedTrackIDs.length - index
      seedViolation = Math.max(seedViolation, seedDistance - distance + 1)
    }
  }

  return {
    artistViolation,
    seedViolation,
    totalViolation: artistViolation + seedViolation
  }
}

/**
 * 在 Phase 3 Scorer 的全局排序基础上执行局部多样性重排。
 *
 * 策略：
 * 1. 保留 Scorer 第一名（通常是主 seed）作为队首；
 * 2. profile.familiarity 直接映射为最终队列中“已喜欢歌曲”的目标上限比例；
 *    例如 35 表示约 35%，但主 seed 至少保留 1 首；
 * 3. 在不超过熟悉歌曲上限的候选中，优先满足“同艺人间隔”和“同 seed 间隔”；
 * 4. 若新歌候选不足，熟悉度上限会安全放宽，保证队列不被截断；
 * 5. 若 spacing 无法完全满足，则选择违反程度最小的候选；同等违反程度时仍按
 *    Scorer 原始排名决定。
 */
export const rerankHeartModeCandidatesWithDecisions = ({
  rankedTrackIDs,
  metadataByTrackID,
  sourceSeedByTrackID,
  likedTrackIDs,
  profile,
  targetCount = 30,
  contextTrackIDs = []
}: HeartModeRerankOptions): HeartModeRerankResult => {
  const ranked = Array.from(
    new Set(
      rankedTrackIDs
        .map(normalizeID)
        .filter((id): id is number => id !== null)
    )
  )

  if (!ranked.length) return { trackIDs: [], decisions: {} }

  const originalRankByTrackID = new Map(
    ranked.map((trackID, index) => [trackID, index])
  )
  const limit = Math.max(1, Math.round(targetCount))
  const artistDistance = Math.max(0, Math.round(profile.maxSameArtistDistance))
  const seedDistance = Math.max(0, Math.round(profile.maxSameSeedDistance))
  const liked = new Set(
    Array.from(likedTrackIDs)
      .map(normalizeID)
      .filter((id): id is number => id !== null)
  )

  const maxLikedCount = Math.max(
    1,
    Math.ceil(limit * Math.min(1, Math.max(0, Number(profile.familiarity) / 100)))
  )

  const context = Array.from(contextTrackIDs)
    .map(normalizeID)
    .filter((id): id is number => id !== null)

  const selected: number[] = []
  const decisions: Record<string, HeartModeRerankDecision> = {}
  let selectedLikedCount = 0
  const remaining = [...ranked]

  const recordDecision = (
    trackID: number,
    evaluation: ConstraintEvaluation,
    flags: {
      movedForArtistSpacing?: boolean
      movedForSeedSpacing?: boolean
      familiarityDeferred?: boolean
    } = {}
  ) => {
    decisions[String(trackID)] = {
      originalRank: originalRankByTrackID.get(trackID) ?? 0,
      finalRank: selected.length - 1,
      artistViolation: evaluation.artistViolation,
      seedViolation: evaluation.seedViolation,
      movedForArtistSpacing: Boolean(flags.movedForArtistSpacing),
      movedForSeedSpacing: Boolean(flags.movedForSeedSpacing),
      familiarityDeferred: Boolean(flags.familiarityDeferred)
    }
  }

  if (!context.length && remaining.length) {
    const firstTrackID = remaining.shift()!
    selected.push(firstTrackID)
    if (liked.has(firstTrackID)) selectedLikedCount += 1
    recordDecision(firstTrackID, {
      artistViolation: 0,
      seedViolation: 0,
      totalViolation: 0
    })
  }

  while (remaining.length && selected.length < limit) {
    let bestIndex = -1
    let bestViolation = Number.POSITIVE_INFINITY
    let bestEvaluation: ConstraintEvaluation = {
      artistViolation: 0,
      seedViolation: 0,
      totalViolation: 0
    }

    const familiarityCapReached = selectedLikedCount >= maxLikedCount
    const familiarityEligibleIndices = remaining
      .map((trackID, index) => ({ trackID, index }))
      .filter(
        ({ trackID }) =>
          !liked.has(trackID) || !familiarityCapReached
      )
      .map(({ index }) => index)

    const candidateIndices =
      familiarityEligibleIndices.length > 0
        ? familiarityEligibleIndices
        : remaining.map((_, index) => index)

    const evaluations = new Map<number, ConstraintEvaluation>()

    for (const index of candidateIndices) {
      const evaluation = evaluateSpacing({
        trackID: remaining[index],
        selectedTrackIDs: [...context, ...selected],
        metadataByTrackID,
        sourceSeedByTrackID,
        artistDistance,
        seedDistance
      })
      evaluations.set(index, evaluation)

      if (evaluation.totalViolation === 0) {
        bestIndex = index
        bestViolation = 0
        bestEvaluation = evaluation
        break
      }

      if (evaluation.totalViolation < bestViolation) {
        bestIndex = index
        bestViolation = evaluation.totalViolation
        bestEvaluation = evaluation
      }
    }

    if (bestIndex < 0) break

    const earlierIndices = candidateIndices.filter((index) => index < bestIndex)
    const movedForArtistSpacing = earlierIndices.some(
      (index) => (evaluations.get(index)?.artistViolation ?? 0) > 0
    )
    const movedForSeedSpacing = earlierIndices.some(
      (index) => (evaluations.get(index)?.seedViolation ?? 0) > 0
    )
    const familiarityDeferred =
      familiarityCapReached &&
      remaining.slice(0, bestIndex).some((trackID) => liked.has(trackID))

    const [nextTrackID] = remaining.splice(bestIndex, 1)
    selected.push(nextTrackID)
    if (liked.has(nextTrackID)) selectedLikedCount += 1
    recordDecision(nextTrackID, bestEvaluation, {
      movedForArtistSpacing,
      movedForSeedSpacing,
      familiarityDeferred
    })
  }

  return { trackIDs: selected, decisions }
}

/**
 * 兼容 Phase 4-5 的 ID-only reranker。
 * Phase 6 解释层使用 rerankHeartModeCandidatesWithDecisions() 保存决策快照。
 */
export const rerankHeartModeCandidatesForDiversity = (
  options: HeartModeRerankOptions
): number[] => rerankHeartModeCandidatesWithDecisions(options).trackIDs
