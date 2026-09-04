import type { HeartModeProfile } from './heartModeProfile'
import type { HeartModeScoreBreakdown } from './heartModeScorer'
import type { HeartModeRerankDecision } from './heartModeReranker'

export type HeartModeBranchState = {
  seedId: number
  playedCount: number
  quickSkipCount: number
  consecutiveQuickSkips: number
  completionAverage: number
  positiveCount: number
  explicitBoostCount: number
  branchScore: number
}

export type HeartModeSteering = {
  noveltyOffset: number
  diversityOffset: number
  familiarityOffset: number
}

export type HeartModeExplicitFeedbackType = 'more-like-this' | 'go-further'

export type HeartModeExplicitFeedback = {
  sessionId: string
  trackId: number
  sourceSeedId?: number
  type: HeartModeExplicitFeedbackType
  createdAt: number
}

export type HeartModeRecommendationReason = {
  trackId: number
  sourceSeedId?: number
  score: HeartModeScoreBreakdown
  originalRank: number
  finalRank: number
  likedAtRecommendation: boolean
  rerank: Pick<
    HeartModeRerankDecision,
    | 'artistViolation'
    | 'seedViolation'
    | 'movedForArtistSpacing'
    | 'movedForSeedSpacing'
    | 'familiarityDeferred'
  >
  recommendedAt: number
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
  steering: HeartModeSteering
  explicitFeedback: HeartModeExplicitFeedback[]
  recommendationReasons: Record<string, HeartModeRecommendationReason>
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
export const HEART_MODE_SESSION_CHANGE_EVENT = 'vutronmusic-heart-mode-session-change'

const MAX_SESSION_PLAYED_TRACKS = 200
const MAX_SESSION_CANDIDATES = 500
const MAX_EXPLICIT_FEEDBACK = 100

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

const createDefaultSteering = (): HeartModeSteering => ({
  noveltyOffset: 0,
  diversityOffset: 0,
  familiarityOffset: 0
})

const normalizeSteering = (value: unknown): HeartModeSteering => {
  const item = value && typeof value === 'object' ? (value as any) : {}
  return {
    noveltyOffset: clamp(Number(item.noveltyOffset) || 0, -30, 30),
    diversityOffset: clamp(Number(item.diversityOffset) || 0, -30, 30),
    familiarityOffset: clamp(Number(item.familiarityOffset) || 0, -30, 30)
  }
}

const createDefaultBranchState = (seedId: number): HeartModeBranchState => ({
  seedId,
  playedCount: 0,
  quickSkipCount: 0,
  consecutiveQuickSkips: 0,
  completionAverage: 0,
  positiveCount: 0,
  explicitBoostCount: 0,
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
    explicitBoostCount: Math.max(
      0,
      Math.round(Number(item.explicitBoostCount) || 0)
    ),
    branchScore: clamp(Number(item.branchScore) || 0, -1, 1)
  }
}

const normalizeRecommendationReason = (
  value: unknown,
  fallbackTrackId: number
): HeartModeRecommendationReason | null => {
  const item = value && typeof value === 'object' ? (value as any) : null
  if (!item) return null
  const trackId = normalizePositiveID(item.trackId) ?? fallbackTrackId
  if (!trackId || !item.score || typeof item.score !== 'object') return null
  const sourceSeedId = normalizePositiveID(item.sourceSeedId) ?? undefined
  return {
    trackId,
    sourceSeedId,
    score: item.score as HeartModeScoreBreakdown,
    originalRank: Math.max(-1, Math.round(Number(item.originalRank) || 0)),
    finalRank: Math.max(0, Math.round(Number(item.finalRank) || 0)),
    likedAtRecommendation: Boolean(item.likedAtRecommendation),
    rerank: {
      artistViolation: Math.max(0, Number(item.rerank?.artistViolation) || 0),
      seedViolation: Math.max(0, Number(item.rerank?.seedViolation) || 0),
      movedForArtistSpacing: Boolean(item.rerank?.movedForArtistSpacing),
      movedForSeedSpacing: Boolean(item.rerank?.movedForSeedSpacing),
      familiarityDeferred: Boolean(item.rerank?.familiarityDeferred)
    },
    recommendedAt: Number(item.recommendedAt) || Date.now()
  }
}

/**
 * 根据一次可用于偏好学习的播放反馈更新 seed 分支状态。
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
    explicitBoostCount: previous.explicitBoostCount,
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

    const recommendationReasons: Record<string, HeartModeRecommendationReason> = {}
    for (const [trackID, rawReason] of Object.entries(stored.recommendationReasons || {})) {
      const normalizedTrackID = normalizePositiveID(trackID)
      if (!normalizedTrackID) continue
      const reason = normalizeRecommendationReason(rawReason, normalizedTrackID)
      if (reason) recommendationReasons[String(normalizedTrackID)] = reason
    }

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
      branchStates,
      steering: normalizeSteering(stored.steering),
      explicitFeedback: Array.isArray(stored.explicitFeedback)
        ? stored.explicitFeedback.slice(-MAX_EXPLICIT_FEEDBACK)
        : [],
      recommendationReasons
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
    } else {
      localStorage.setItem(HEART_MODE_SESSION_KEY, JSON.stringify(currentSession))
    }
    window.dispatchEvent(new CustomEvent(HEART_MODE_SESSION_CHANGE_EVENT))
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
    branchStates,
    steering: createDefaultSteering(),
    explicitFeedback: [],
    recommendationReasons: {}
  }
  persist()
  return currentSession
}

export const getCurrentHeartModeSession = (): HeartModeSessionState | null => {
  hydrate()
  return currentSession
}

export const getEffectiveHeartModeProfile = (
  session: HeartModeSessionState | null = getCurrentHeartModeSession()
): HeartModeProfile | null => {
  if (!session) return null
  return {
    ...session.profile,
    novelty: clamp(
      session.profile.novelty + session.steering.noveltyOffset,
      0,
      100
    ),
    diversity: clamp(
      session.profile.diversity + session.steering.diversityOffset,
      0,
      100
    ),
    familiarity: clamp(
      session.profile.familiarity + session.steering.familiarityOffset,
      0,
      100
    )
  }
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

export const getHeartModeRecommendationReason = (
  trackID: number
): HeartModeRecommendationReason | null => {
  hydrate()
  const id = normalizePositiveID(trackID)
  if (!currentSession || !id) return null
  return currentSession.recommendationReasons[String(id)] ?? null
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

export const boostHeartModeCurrentBranch = (
  trackID: number,
  now = Date.now()
): HeartModeBranchState | null => {
  hydrate()
  if (!currentSession) return null
  const id = normalizePositiveID(trackID)
  if (!id) return null
  const seedId = normalizePositiveID(currentSession.sourceSeedByTrackID[String(id)])
  if (!seedId) return null

  const key = String(seedId)
  const previous =
    currentSession.branchStates[key] ?? createDefaultBranchState(seedId)
  const next: HeartModeBranchState = {
    ...previous,
    explicitBoostCount: previous.explicitBoostCount + 1,
    branchScore: clamp(
      previous.branchScore + 0.25 * (1 - previous.branchScore),
      -1,
      1
    )
  }
  currentSession.branchStates[key] = next
  currentSession.explicitFeedback = [
    ...currentSession.explicitFeedback,
    {
      sessionId: currentSession.id,
      trackId: id,
      sourceSeedId: seedId,
      type: 'more-like-this',
      createdAt: now
    }
  ].slice(-MAX_EXPLICIT_FEEDBACK)
  persist()
  return next
}

export const steerHeartModeFurther = (
  trackID: number,
  now = Date.now()
): HeartModeSteering | null => {
  hydrate()
  if (!currentSession) return null
  const id = normalizePositiveID(trackID)
  if (!id) return null

  currentSession.steering = {
    noveltyOffset: clamp(currentSession.steering.noveltyOffset + 10, -30, 30),
    diversityOffset: clamp(currentSession.steering.diversityOffset + 10, -30, 30),
    familiarityOffset: clamp(
      currentSession.steering.familiarityOffset - 10,
      -30,
      30
    )
  }

  currentSession.explicitFeedback = [
    ...currentSession.explicitFeedback,
    {
      sessionId: currentSession.id,
      trackId: id,
      sourceSeedId:
        normalizePositiveID(currentSession.sourceSeedByTrackID[String(id)]) ??
        undefined,
      type: 'go-further',
      createdAt: now
    }
  ].slice(-MAX_EXPLICIT_FEEDBACK)
  persist()
  return { ...currentSession.steering }
}

export const recordHeartModeRecommendationReasons = (
  reasons: Iterable<HeartModeRecommendationReason>
): void => {
  hydrate()
  if (!currentSession) return

  for (const reason of reasons) {
    const id = normalizePositiveID(reason.trackId)
    if (!id) continue
    currentSession.recommendationReasons[String(id)] = {
      ...reason,
      trackId: id,
      sourceSeedId: normalizePositiveID(reason.sourceSeedId) ?? undefined
    }
  }
  persist()
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
