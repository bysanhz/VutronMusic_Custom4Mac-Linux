import type { HeartModeProfile } from './heartModeProfile'

export type HeartModeBranchState = {
  seedId: number
  playedCount: number
  quickSkipCount: number
  consecutiveQuickSkips: number
  completionAverage: number
  positiveCount: number
  branchScore: number
}

export type HeartModeSessionState = {
  id: string
  profile: HeartModeProfile
  seedIds: number[]
  playlistId: number
  startedAt: number
  sourceSeedByTrackID: Record<string, number>
  playedTrackIDs: number[]
  enqueuedTrackIDs: number[]
  pendingTrackIDs: number[]
  branchStates: Record<string, HeartModeBranchState>
}

export type HeartModeTrackContext = {
  heartModeSessionId: string
  sourceSeedId?: number
}

export type HeartModeBranchFeedbackSignal = {
  sessionId: string
  seedId: number
  score: number | null
  completionRatio: number
  quickSkip: boolean
  positive: boolean
}

export const HEART_MODE_SESSION_KEY = 'vutronmusic-heart-mode-session-v1'

const MAX_SESSION_PLAYED_TRACKS = 200
const MAX_SESSION_CANDIDATES = 500

let currentSession: HeartModeSessionState | null = null
let hydrated = false

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const normalizePositiveID = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

const normalizeTrackIDs = (value: unknown, max = MAX_SESSION_CANDIDATES): number[] =>
  Array.from(
    new Set<number>(
      (Array.isArray(value) ? value : [])
        .map(normalizePositiveID)
        .filter((id: number | null): id is number => id !== null)
    )
  ).slice(-max)

const createDefaultBranchState = (seedId: number): HeartModeBranchState => ({
  seedId,
  playedCount: 0,
  quickSkipCount: 0,
  consecutiveQuickSkips: 0,
  completionAverage: 0,
  positiveCount: 0,
  branchScore: 0
})

const normalizeBranchState = (
  value: unknown,
  fallbackSeedId: number
): HeartModeBranchState => {
  const item = value && typeof value === 'object' ? (value as any) : {}
  const seedId = normalizePositiveID(item.seedId) ?? fallbackSeedId
  return {
    seedId,
    playedCount: Math.max(0, Math.round(Number(item.playedCount) || 0)),
    quickSkipCount: Math.max(0, Math.round(Number(item.quickSkipCount) || 0)),
    consecutiveQuickSkips: Math.max(
      0,
      Math.round(Number(item.consecutiveQuickSkips) || 0)
    ),
    completionAverage: clamp(Number(item.completionAverage) || 0, 0, 1),
    positiveCount: Math.max(0, Math.round(Number(item.positiveCount) || 0)),
    branchScore: clamp(Number(item.branchScore) || 0, -1, 1)
  }
}

/**
 * 根据一次可用于偏好学习的播放反馈更新 seed 分支状态。
 *
 * branchScore 使用有界 EMA：
 * - quick skip(-4) 会迅速拉低分支；
 * - 连续 quick skip 额外叠加 streak penalty；
 * - natural-end(+2)、主动点赞(+5) 会逐步恢复/提升；
 * - score=null 的生命周期事件完全不更新分支。
 */
export const calculateNextHeartModeBranchState = (
  previous: HeartModeBranchState,
  signal: Omit<HeartModeBranchFeedbackSignal, 'sessionId' | 'seedId'>
): HeartModeBranchState => {
  if (signal.score === null) return { ...previous }

  const playedCount = previous.playedCount + 1
  const completionRatio = clamp(Number(signal.completionRatio) || 0, 0, 1)
  const completionAverage =
    (previous.completionAverage * previous.playedCount + completionRatio) /
    playedCount

  const consecutiveQuickSkips = signal.quickSkip
    ? previous.consecutiveQuickSkips + 1
    : 0
  const quickSkipCount = previous.quickSkipCount + (signal.quickSkip ? 1 : 0)
  const positiveCount = previous.positiveCount + (signal.positive ? 1 : 0)

  const normalizedSignal = clamp(signal.score / 4, -1, 1)
  const emaScore = previous.branchScore * 0.75 + normalizedSignal * 0.25
  const streakPenalty = signal.quickSkip
    ? Math.min(0.3, 0.08 * consecutiveQuickSkips)
    : 0

  return {
    seedId: previous.seedId,
    playedCount,
    quickSkipCount,
    consecutiveQuickSkips,
    completionAverage,
    positiveCount,
    branchScore: clamp(emaScore - streakPenalty, -1, 1)
  }
}

const readSession = (): HeartModeSessionState | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(HEART_MODE_SESSION_KEY) || 'null')
    if (!stored || typeof stored !== 'object' || !stored.id) return null

    const seedIds = normalizeTrackIDs(stored.seedIds)

    const sourceSeedByTrackID: Record<string, number> = {}
    for (const [trackID, seedID] of Object.entries(stored.sourceSeedByTrackID || {})) {
      const normalizedTrackID = normalizePositiveID(trackID)
      const normalizedSeedID = normalizePositiveID(seedID)
      if (normalizedTrackID && normalizedSeedID) {
        sourceSeedByTrackID[String(normalizedTrackID)] = normalizedSeedID
      }
    }

    const branchStates: Record<string, HeartModeBranchState> = {}
    for (const seedId of seedIds) {
      branchStates[String(seedId)] = normalizeBranchState(
        stored.branchStates?.[String(seedId)],
        seedId
      )
    }

    // 兼容 Phase 1-4 的旧 session：旧数据没有 rolling queue 字段时，
    // 把已经有 source 归因的歌曲视作“曾经已入队”，pending 默认为空。
    const legacyEnqueuedTrackIDs = Object.keys(sourceSeedByTrackID)
      .map(normalizePositiveID)
      .filter((id: number | null): id is number => id !== null)

    return {
      id: String(stored.id),
      profile: stored.profile as HeartModeProfile,
      seedIds,
      playlistId: normalizePositiveID(stored.playlistId) ?? 0,
      startedAt: Number(stored.startedAt) || Date.now(),
      sourceSeedByTrackID,
      playedTrackIDs: normalizeTrackIDs(
        stored.playedTrackIDs,
        MAX_SESSION_PLAYED_TRACKS
      ),
      enqueuedTrackIDs: normalizeTrackIDs(
        stored.enqueuedTrackIDs ?? legacyEnqueuedTrackIDs
      ),
      pendingTrackIDs: normalizeTrackIDs(stored.pendingTrackIDs),
      branchStates
    }
  } catch {
    return null
  }
}

const hydrate = (): void => {
  if (hydrated) return
  currentSession = readSession()
  hydrated = true
}

const persist = (): void => {
  try {
    if (!currentSession) {
      localStorage.removeItem(HEART_MODE_SESSION_KEY)
      return
    }
    localStorage.setItem(HEART_MODE_SESSION_KEY, JSON.stringify(currentSession))
  } catch (error) {
    console.warn('[HeartModeSession] 保存当前 session 失败：', error)
  }
}

const createSessionID = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const createHeartModeSession = ({
  profile,
  seedIds,
  playlistId,
  sourceSeedByTrackID,
  enqueuedTrackIDs,
  pendingTrackIDs
}: {
  profile: HeartModeProfile
  seedIds: number[]
  playlistId: number
  sourceSeedByTrackID: Record<string, number>
  enqueuedTrackIDs: number[]
  pendingTrackIDs: number[]
}): HeartModeSessionState => {
  hydrate()

  const normalizedSeeds = normalizeTrackIDs(seedIds)
  const branchStates = Object.fromEntries(
    normalizedSeeds.map((seedId) => [
      String(seedId),
      createDefaultBranchState(seedId)
    ])
  )

  currentSession = {
    id: createSessionID(),
    profile: { ...profile },
    seedIds: normalizedSeeds,
    playlistId: normalizePositiveID(playlistId) ?? 0,
    startedAt: Date.now(),
    sourceSeedByTrackID: { ...sourceSeedByTrackID },
    playedTrackIDs: [],
    enqueuedTrackIDs: normalizeTrackIDs(enqueuedTrackIDs),
    pendingTrackIDs: normalizeTrackIDs(pendingTrackIDs),
    branchStates
  }
  persist()
  return currentSession
}

export const getCurrentHeartModeSession = (): HeartModeSessionState | null => {
  hydrate()
  return currentSession
}

export const getHeartModeTrackContext = (trackID: number): HeartModeTrackContext | null => {
  hydrate()
  if (!currentSession) return null

  const id = normalizePositiveID(trackID)
  if (!id || !(String(id) in currentSession.sourceSeedByTrackID)) return null

  return {
    heartModeSessionId: currentSession.id,
    sourceSeedId: currentSession.sourceSeedByTrackID[String(id)]
  }
}

export const getHeartModeBranchScoreMap = (): Map<number, number> => {
  hydrate()
  if (!currentSession) return new Map()

  return new Map(
    Object.values(currentSession.branchStates).map((state) => [
      state.seedId,
      state.branchScore
    ])
  )
}

export const applyHeartModeFeedbackToSession = (
  signal: HeartModeBranchFeedbackSignal
): HeartModeBranchState | null => {
  hydrate()
  if (
    !currentSession ||
    signal.sessionId !== currentSession.id ||
    signal.score === null
  ) {
    return null
  }

  const seedId = normalizePositiveID(signal.seedId)
  if (!seedId || !currentSession.seedIds.includes(seedId)) return null

  const key = String(seedId)
  const previous =
    currentSession.branchStates[key] ?? createDefaultBranchState(seedId)
  const next = calculateNextHeartModeBranchState(previous, {
    score: signal.score,
    completionRatio: signal.completionRatio,
    quickSkip: signal.quickSkip,
    positive: signal.positive
  })

  currentSession.branchStates[key] = next
  persist()
  return next
}

export const registerHeartModeCandidatePool = ({
  sourceSeedByTrackID,
  pendingTrackIDs
}: {
  sourceSeedByTrackID: Record<string, number>
  pendingTrackIDs: Iterable<number>
}): void => {
  hydrate()
  if (!currentSession) return

  for (const [trackID, seedID] of Object.entries(sourceSeedByTrackID)) {
    if (!(trackID in currentSession.sourceSeedByTrackID)) {
      currentSession.sourceSeedByTrackID[trackID] = seedID
    }
  }

  const blocked = new Set([
    ...currentSession.playedTrackIDs,
    ...currentSession.enqueuedTrackIDs
  ])
  currentSession.pendingTrackIDs = Array.from(
    new Set([
      ...currentSession.pendingTrackIDs,
      ...Array.from(pendingTrackIDs)
        .map(normalizePositiveID)
        .filter((id: number | null): id is number => id !== null)
    ])
  )
    .filter((id) => !blocked.has(id))
    .slice(-MAX_SESSION_CANDIDATES)

  persist()
}

export const recordHeartModeEnqueuedTracks = (trackIDs: Iterable<number>): void => {
  hydrate()
  if (!currentSession) return

  const normalized = Array.from(trackIDs)
    .map(normalizePositiveID)
    .filter((id: number | null): id is number => id !== null)
  if (!normalized.length) return

  const incoming = new Set(normalized)
  currentSession.enqueuedTrackIDs = Array.from(
    new Set([...currentSession.enqueuedTrackIDs, ...normalized])
  ).slice(-MAX_SESSION_CANDIDATES)
  currentSession.pendingTrackIDs = currentSession.pendingTrackIDs.filter(
    (id) => !incoming.has(id)
  )
  persist()
}

export const replaceHeartModePendingTracks = (trackIDs: Iterable<number>): void => {
  hydrate()
  if (!currentSession) return

  const blocked = new Set([
    ...currentSession.playedTrackIDs,
    ...currentSession.enqueuedTrackIDs
  ])
  currentSession.pendingTrackIDs = Array.from(trackIDs)
    .map(normalizePositiveID)
    .filter((id: number | null): id is number => id !== null)
    .filter((id, index, values) => values.indexOf(id) === index && !blocked.has(id))
    .slice(0, MAX_SESSION_CANDIDATES)
  persist()
}

export const recordHeartModePlayedTrack = (trackID: number): void => {
  hydrate()
  if (!currentSession) return

  const id = normalizePositiveID(trackID)
  if (!id || !(String(id) in currentSession.sourceSeedByTrackID)) return

  currentSession.playedTrackIDs = [
    ...currentSession.playedTrackIDs.filter((item) => item !== id),
    id
  ].slice(-MAX_SESSION_PLAYED_TRACKS)
  persist()
}
