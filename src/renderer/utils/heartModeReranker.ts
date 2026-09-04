import type { HeartModeProfile } from './heartModeProfile'

export type HeartModeTrackMetadata = {
  artistIds: number[]
  albumId?: number
}

export type HeartModeRerankOptions = {
  rankedTrackIDs: number[]
  metadataByTrackID: ReadonlyMap<number, HeartModeTrackMetadata>
  sourceSeedByTrackID: ReadonlyMap<number, number> | Record<string, number>
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
 * 2. 每一步优先挑选同时满足“同艺人间隔”和“同 seed 间隔”的最高分候选；
 * 3. 如果当前剩余候选没有一个完全满足约束，则选择违反程度最小的候选，
 *    同等违反程度时仍按 Scorer 原始排名决定，保证队列一定能填满；
 * 4. 本阶段不改变候选分数，只改变局部顺序，因此 NetEase + Phase 3 Scorer
 *    仍然是全局质量主导。
 */
export const rerankHeartModeCandidatesForDiversity = ({
  rankedTrackIDs,
  metadataByTrackID,
  sourceSeedByTrackID,
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

  const selected: number[] = [ranked[0]]
  const remaining = ranked.slice(1)

  while (remaining.length && selected.length < limit) {
    let bestIndex = -1
    let bestViolation = Number.POSITIVE_INFINITY

    for (let index = 0; index < remaining.length; index += 1) {
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
    selected.push(remaining.splice(bestIndex, 1)[0])
  }

  return selected
}
