export type HeartModeHistoryEntry = {
  id: number
  recommendedAt: number
}

export type HeartModeRankingOptions = {
  seedTrackID: number
  candidateTrackIDs: number[]
  likedTrackIDs: number[]
  recentPlayedTrackIDs: number[]
  recentHeartModeTrackIDs: number[]
  targetCount?: number
}

const HEART_MODE_HISTORY_KEY = 'vutronmusic-heart-mode-history-v1'
const MAX_HEART_MODE_HISTORY = 300
const HEART_MODE_HISTORY_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000

const normalizeTrackIDs = (ids: Iterable<number>): number[] =>
  Array.from(
    new Set(
      Array.from(ids)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  )

const readHeartModeHistory = (): HeartModeHistoryEntry[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(HEART_MODE_HISTORY_KEY) || '[]')
    if (!Array.isArray(stored)) return []

    return stored
      .map((item) => ({
        id: Number(item?.id),
        recommendedAt: Number(item?.recommendedAt)
      }))
      .filter(
        (item) =>
          Number.isFinite(item.id) &&
          item.id > 0 &&
          Number.isFinite(item.recommendedAt) &&
          item.recommendedAt > 0
      )
      .slice(0, MAX_HEART_MODE_HISTORY)
  } catch {
    return []
  }
}

/**
 * 返回仍处于心动模式冷却期内的歌曲 ID。
 *
 * 默认冷却 14 天；历史最多保存 300 首，跨应用重启仍然有效。
 */
export const getRecentHeartModeTrackIDs = (
  now = Date.now(),
  cooldownMs = HEART_MODE_HISTORY_COOLDOWN_MS
): Set<number> => {
  const threshold = now - Math.max(0, cooldownMs)
  return new Set(
    readHeartModeHistory()
      .filter((entry) => entry.recommendedAt >= threshold)
      .map((entry) => entry.id)
  )
}

/**
 * 记录本次心动模式已经推荐给用户的歌曲。
 *
 * 新记录排在最前，同一歌曲只保留最近一次出现时间。
 */
export const recordHeartModeTrackIDs = (trackIDs: Iterable<number>, now = Date.now()): void => {
  const normalized = normalizeTrackIDs(trackIDs)
  if (!normalized.length) return

  const current = readHeartModeHistory()
  const incoming = new Set(normalized)
  const next = [
    ...normalized.map((id) => ({ id, recommendedAt: now })),
    ...current.filter((entry) => !incoming.has(entry.id))
  ].slice(0, MAX_HEART_MODE_HISTORY)

  try {
    localStorage.setItem(HEART_MODE_HISTORY_KEY, JSON.stringify(next))
  } catch (error) {
    console.warn('[HeartMode] 保存心动模式推荐历史失败：', error)
  }
}

const shuffle = (values: number[], random: () => number): number[] => {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

/**
 * 为多轮心动模式请求挑选不同 seed。
 *
 * 优先选择近期没有播放过、也没有出现在心动模式冷却历史中的喜欢歌曲；
 * 候选不足时才回退到近期出现过的喜欢歌曲。
 */
export const selectHeartModeSeedIDs = (
  likedTrackIDs: Iterable<number>,
  avoidedTrackIDs: Iterable<number>,
  maxSeeds = 3,
  random: () => number = Math.random
): number[] => {
  const liked = normalizeTrackIDs(likedTrackIDs)
  const avoided = new Set(normalizeTrackIDs(avoidedTrackIDs))
  const preferred = liked.filter((id) => !avoided.has(id))
  const fallback = liked.filter((id) => avoided.has(id))

  return [...shuffle(preferred, random), ...shuffle(fallback, random)].slice(
    0,
    Math.max(1, maxSeeds)
  )
}

/**
 * 对网易云心动模式候选做客户端二次排序。
 *
 * 顺序：
 * 1. 本次 seed；
 * 2. 最近没听过、最近心动模式也没推荐过的歌曲；
 * 3. 已喜欢的重复歌曲；
 * 4. 仅命中心动模式冷却历史、但不在最近播放中的未喜欢歌曲；
 * 5. 最近播放过且未喜欢的歌曲（最后兜底）。
 *
 * 这样不会永久屏蔽旧歌，但会显著降低“刚听过、没点喜欢又被高频推荐”的概率。
 */
export const rankHeartModeCandidates = ({
  seedTrackID,
  candidateTrackIDs,
  likedTrackIDs,
  recentPlayedTrackIDs,
  recentHeartModeTrackIDs,
  targetCount = 30
}: HeartModeRankingOptions): number[] => {
  const seed = Number(seedTrackID)
  if (!Number.isFinite(seed) || seed <= 0) return []

  const candidates = normalizeTrackIDs(candidateTrackIDs).filter((id) => id !== seed)
  const liked = new Set(normalizeTrackIDs(likedTrackIDs))
  const recentPlayed = new Set(normalizeTrackIDs(recentPlayedTrackIDs))
  const recentHeartMode = new Set(normalizeTrackIDs(recentHeartModeTrackIDs))

  const fresh: number[] = []
  const likedRepeats: number[] = []
  const heartModeRepeats: number[] = []
  const recentUnlikedRepeats: number[] = []

  for (const id of candidates) {
    const wasRecentlyPlayed = recentPlayed.has(id)
    const wasRecentlyRecommended = recentHeartMode.has(id)

    if (!wasRecentlyPlayed && !wasRecentlyRecommended) {
      fresh.push(id)
      continue
    }

    if (liked.has(id)) {
      likedRepeats.push(id)
      continue
    }

    if (!wasRecentlyPlayed && wasRecentlyRecommended) {
      heartModeRepeats.push(id)
      continue
    }

    recentUnlikedRepeats.push(id)
  }

  return [seed, ...fresh, ...likedRepeats, ...heartModeRepeats, ...recentUnlikedRepeats].slice(
    0,
    Math.max(1, targetCount)
  )
}
