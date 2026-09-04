export type HeartModeHistoryEntry = {
  id: number
  recommendedAt: number
  legacy: boolean
}

export const HEART_MODE_HISTORY_V1_KEY = 'vutronmusic-heart-mode-history-v1'
export const HEART_MODE_HISTORY_KEY = 'vutronmusic-heart-mode-history-v2'
export const MAX_HEART_MODE_HISTORY = 500

const DAY_MS = 24 * 60 * 60 * 1000

const normalizeTrackIDs = (ids: Iterable<number>): number[] =>
  Array.from(
    new Set(
      Array.from(ids)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  )

const normalizeHistoryEntries = (
  value: unknown,
  legacyFallback: boolean
): HeartModeHistoryEntry[] => {
  if (!Array.isArray(value)) return []

  const byTrackID = new Map<number, HeartModeHistoryEntry>()

  for (const item of value) {
    const id = Number(item?.id)
    const recommendedAt = Number(item?.recommendedAt)
    if (
      !Number.isFinite(id) ||
      id <= 0 ||
      !Number.isFinite(recommendedAt) ||
      recommendedAt <= 0
    ) {
      continue
    }

    const entry: HeartModeHistoryEntry = {
      id,
      recommendedAt,
      legacy:
        typeof item?.legacy === 'boolean'
          ? item.legacy
          : legacyFallback
    }

    const existing = byTrackID.get(id)
    if (!existing || entry.recommendedAt > existing.recommendedAt) {
      byTrackID.set(id, entry)
    }
  }

  return Array.from(byTrackID.values())
    .sort((left, right) => right.recommendedAt - left.recommendedAt)
    .slice(0, MAX_HEART_MODE_HISTORY)
}

/**
 * 将旧版 history-v1 记录保守转换成 v2。
 *
 * v1 只知道“曾被推荐过”，不知道用户对它的真实反馈，因此迁移后只保留
 * recommendedAt 并标记 legacy=true。Scorer 只把这类记录用于重复冷却，
 * 不会把它们解释为喜欢或不喜欢。
 */
export const migrateHeartModeHistoryEntries = (value: unknown): HeartModeHistoryEntry[] =>
  normalizeHistoryEntries(value, true)

const persistHeartModeHistory = (entries: HeartModeHistoryEntry[]): void => {
  try {
    localStorage.setItem(HEART_MODE_HISTORY_KEY, JSON.stringify(entries))
  } catch (error) {
    console.warn('[HeartMode] 保存心动模式推荐历史失败：', error)
  }
}

/**
 * 读取 v2 历史。若本机只有 v1，则首次读取时自动迁移并写入 v2。
 */
export const getHeartModeHistory = (): HeartModeHistoryEntry[] => {
  try {
    const v2Raw = localStorage.getItem(HEART_MODE_HISTORY_KEY)
    if (v2Raw) {
      return normalizeHistoryEntries(JSON.parse(v2Raw), false)
    }

    const v1Raw = localStorage.getItem(HEART_MODE_HISTORY_V1_KEY)
    if (!v1Raw) return []

    const migrated = migrateHeartModeHistoryEntries(JSON.parse(v1Raw))
    if (migrated.length) persistHeartModeHistory(migrated)
    return migrated
  } catch {
    return []
  }
}

/**
 * 计算一条心动模式推荐历史在当前时刻的重复惩罚，范围为 0..1。
 *
 * 三段指数衰减语义：
 * - 0..short：强冷却，1.00 -> 0.80
 * - short..medium：中冷却，0.80 -> 0.35
 * - medium..long：弱冷却，0.35 -> 0.01
 * - 超过 long：恢复为 0
 */
export const calculateHeartModeRepeatPenalty = ({
  recommendedAt,
  now = Date.now(),
  shortCooldownHours = 24,
  mediumCooldownDays = 7,
  longCooldownDays = 30
}: {
  recommendedAt: number
  now?: number
  shortCooldownHours?: number
  mediumCooldownDays?: number
  longCooldownDays?: number
}): number => {
  const ageMs = Math.max(0, now - Number(recommendedAt))
  const shortMs = Math.max(1, Number(shortCooldownHours) || 24) * 60 * 60 * 1000
  const mediumMs = Math.max(
    shortMs,
    Math.max(1, Number(mediumCooldownDays) || 7) * DAY_MS
  )
  const longMs = Math.max(
    mediumMs,
    Math.max(1, Number(longCooldownDays) || 30) * DAY_MS
  )

  if (ageMs >= longMs) return 0

  const exponentialSegment = (
    startValue: number,
    endValue: number,
    progress: number
  ): number => {
    const t = Math.min(1, Math.max(0, progress))
    return startValue * Math.pow(endValue / startValue, t)
  }

  if (ageMs <= shortMs) {
    return exponentialSegment(1, 0.8, ageMs / shortMs)
  }

  if (ageMs <= mediumMs) {
    return exponentialSegment(
      0.8,
      0.35,
      (ageMs - shortMs) / Math.max(1, mediumMs - shortMs)
    )
  }

  return exponentialSegment(
    0.35,
    0.01,
    (ageMs - mediumMs) / Math.max(1, longMs - mediumMs)
  )
}

/**
 * 返回给定时间窗内仍有重复惩罚的歌曲 ID。
 *
 * 该函数主要用于 seed 选择的粗过滤；正式候选排序使用连续时间衰减，
 * 不再使用旧版固定 14 天硬阈值。
 */
export const getRecentHeartModeTrackIDs = (
  now = Date.now(),
  cooldownMs = 30 * DAY_MS
): Set<number> => {
  const threshold = now - Math.max(0, cooldownMs)
  return new Set(
    getHeartModeHistory()
      .filter((entry) => entry.recommendedAt >= threshold)
      .map((entry) => entry.id)
  )
}

/**
 * 记录本次心动模式已经推荐给用户的歌曲。
 *
 * 新记录排在最前，同一歌曲只保留最近一次出现时间。新记录标记 legacy=false。
 */
export const recordHeartModeTrackIDs = (trackIDs: Iterable<number>, now = Date.now()): void => {
  const normalized = normalizeTrackIDs(trackIDs)
  if (!normalized.length) return

  const current = getHeartModeHistory()
  const incoming = new Set(normalized)
  const next = [
    ...normalized.map((id) => ({ id, recommendedAt: now, legacy: false })),
    ...current.filter((entry) => !incoming.has(entry.id))
  ].slice(0, MAX_HEART_MODE_HISTORY)

  persistHeartModeHistory(next)
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
 * 优先选择近期没有播放过、也没有处于心动模式长期冷却窗内的喜欢歌曲；
 * 候选不足时才回退。艺人/专辑级 seed 多样化属于 Phase 4。
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
