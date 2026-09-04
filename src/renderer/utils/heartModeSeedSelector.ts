export type HeartModeSeedCandidatePool = {
  candidateTrackIDs: number[]
  candidateSeedByTrackID: Map<number, number>
}

const normalizeID = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

/**
 * 将多个 NetEase intelligence seed 分支按“分支内排名”进行 round-robin 交织。
 *
 * 例如：
 * A: A1 A2 A3
 * B: B1 B2 B3
 * C: C1 C2 C3
 *
 * 输出：
 * A1 B1 C1 A2 B2 C2 A3 B3 C3
 *
 * 这样保留每个分支内部的 NetEase 排名质量，同时避免简单拼接造成第一个 seed
 * 永远占据 Scorer 的高 rankQuality 区域。
 *
 * 同一歌曲若被多个 seed 推荐，只保留第一次出现，并把第一次出现的 seed 作为
 * sourceSeedId；这是一种保守、确定性的归因，Phase 5 再处理动态分支权重。
 */
export const interleaveHeartModeSeedCandidates = (
  seedTrackIDs: Iterable<number>,
  recommendationsBySeed: ReadonlyMap<number, readonly number[]>
): HeartModeSeedCandidatePool => {
  const orderedSeeds = Array.from(seedTrackIDs)
    .map(normalizeID)
    .filter((id): id is number => id !== null)

  const normalizedBySeed = new Map<number, number[]>()
  let maxBranchLength = 0

  for (const seedID of orderedSeeds) {
    const seenInBranch = new Set<number>()
    const normalized = (recommendationsBySeed.get(seedID) || [])
      .map(normalizeID)
      .filter((id): id is number => id !== null)
      .filter((id) => {
        if (seenInBranch.has(id)) return false
        seenInBranch.add(id)
        return true
      })

    normalizedBySeed.set(seedID, normalized)
    maxBranchLength = Math.max(maxBranchLength, normalized.length)
  }

  const candidateTrackIDs: number[] = []
  const candidateSeedByTrackID = new Map<number, number>()
  const globallySeen = new Set<number>()

  for (let rank = 0; rank < maxBranchLength; rank += 1) {
    for (const seedID of orderedSeeds) {
      const trackID = normalizedBySeed.get(seedID)?.[rank]
      if (!trackID || globallySeen.has(trackID)) continue

      globallySeen.add(trackID)
      candidateTrackIDs.push(trackID)
      candidateSeedByTrackID.set(trackID, seedID)
    }
  }

  return {
    candidateTrackIDs,
    candidateSeedByTrackID
  }
}
