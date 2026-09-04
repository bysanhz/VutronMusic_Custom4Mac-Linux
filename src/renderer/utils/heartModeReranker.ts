import type { HeartModeProfile } from './heartModeProfile'

export type HeartModeTrackMetadata = {
  artistIds: number[]
  albumId?: number
}

export type HeartModeRerankOptions = {
  rankedTrackIDs: number[]
  metadataByTrackID: ReadonlyMap<number, HeartModeTrackMetadata>
  sourceSeedByTrackID: Map<number, number> | Record<string, number>
  likedTrackIDs: Iterable<number>
  profile: HeartModeProfile
  targetCount?: number
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
export const rerankHeartModeCandidatesForDiversity = ({
  rankedTrackIDs,
  metadataByTrackID,
  sourceSeedByTrackID,
  likedTrackIDs,
  profile,
  targetCount = 30
}: HeartModeRerankOptions): number[] => {
  const ranked = Array.from(
    new Set(
      rankedTrackIDs
        .map(normalizeID)
        .filter((id): id is number => id !== null)
    )
  )

  if (!ranked.length) return []

  const limit = Math.max(1, Math.round(targetCount))
  const artistDistance = Math.max(0, Math.round(profile.maxSameArtistDistance))
  const seedDistance = Math.max(0, Math.round(profile.maxSameSeedDistance))
  const liked = new Set(
    Array.from(likedTrackIDs)
      .map(normalizeID)
      .filter((id): id is number => id !== null)
  )

  // familiarity=35 => 最终 30 首中约最多 11 首已喜欢歌曲。
  // 主 seed 来自喜欢歌单，因此至少允许 1 首。
  const maxLikedCount = Math.max(
    1,
    Math.ceil(limit * Math.min(1, Math.max(0, Number(profile.familiarity) / 100)))
  )

  const selected: number[] = [ranked[0]]
  let selectedLikedCount = liked.has(ranked[0]) ? 1 : 0
  const remaining = ranked.slice(1)

  while (remaining.length && selected.length < limit) {
    let bestIndex = -1
    let bestViolation = Number.POSITIVE_INFINITY

    // 达到熟悉歌曲上限后，只要仍有未喜欢候选，就暂时不考虑已喜欢歌曲。
    // 只有当未喜欢候选已经耗尽时才放宽该上限，避免队列长度不足。
    const familiarityEligibleIndices = remaining
      .map((trackID, index) => ({ trackID, index }))
      .filter(
        ({ trackID }) =>
          !liked.has(trackID) || selectedLikedCount < maxLikedCount
      )
      .map(({ index }) => index)

    const candidateIndices =
      familiarityEligibleIndices.length > 0
        ? familiarityEligibleIndices
        : remaining.map((_, index) => index)

    for (const index of candidateIndices) {
      const evaluation = evaluateSpacing({
        trackID: remaining[index],
        selectedTrackIDs: selected,
        metadataByTrackID,
        sourceSeedByTrackID,
        artistDistance,
        seedDistance
      })

      if (evaluation.totalViolation === 0) {
        bestIndex = index
        bestViolation = 0
        break
      }

      if (evaluation.totalViolation < bestViolation) {
        bestIndex = index
        bestViolation = evaluation.totalViolation
      }
    }

    if (bestIndex < 0) break
    const [nextTrackID] = remaining.splice(bestIndex, 1)
    selected.push(nextTrackID)
    if (liked.has(nextTrackID)) selectedLikedCount += 1
  }

  return selected
}
