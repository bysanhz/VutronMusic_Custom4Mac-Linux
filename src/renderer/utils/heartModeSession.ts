import type { HeartModeProfile } from './heartModeProfile'

export type HeartModeSessionState = {
  id: string
  profile: HeartModeProfile
  seedIds: number[]
  startedAt: number
  sourceSeedByTrackID: Record<string, number>
  playedTrackIDs: number[]
}

export type HeartModeTrackContext = {
  heartModeSessionId: string
  sourceSeedId?: number
}

export const HEART_MODE_SESSION_KEY = 'vutronmusic-heart-mode-session-v1'

const MAX_SESSION_PLAYED_TRACKS = 100

let currentSession: HeartModeSessionState | null = null
let hydrated = false

const normalizePositiveID = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

const readSession = (): HeartModeSessionState | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(HEART_MODE_SESSION_KEY) || 'null')
    if (!stored || typeof stored !== 'object' || !stored.id) return null

    const seedIds = Array.from(
      new Set<number>(
        (Array.isArray(stored.seedIds) ? stored.seedIds : [])
          .map(normalizePositiveID)
          .filter((id: number | null): id is number => id !== null)
      )
    )

    const sourceSeedByTrackID: Record<string, number> = {}
    for (const [trackID, seedID] of Object.entries(stored.sourceSeedByTrackID || {})) {
      const normalizedTrackID = normalizePositiveID(trackID)
      const normalizedSeedID = normalizePositiveID(seedID)
      if (normalizedTrackID && normalizedSeedID) {
        sourceSeedByTrackID[String(normalizedTrackID)] = normalizedSeedID
      }
    }

    const playedTrackIDs = Array.from(
      new Set<number>(
        (Array.isArray(stored.playedTrackIDs) ? stored.playedTrackIDs : [])
          .map(normalizePositiveID)
          .filter((id: number | null): id is number => id !== null)
      )
    ).slice(-MAX_SESSION_PLAYED_TRACKS)

    return {
      id: String(stored.id),
      profile: stored.profile as HeartModeProfile,
      seedIds,
      startedAt: Number(stored.startedAt) || Date.now(),
      sourceSeedByTrackID,
      playedTrackIDs
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
  sourceSeedByTrackID
}: {
  profile: HeartModeProfile
  seedIds: number[]
  sourceSeedByTrackID: Record<string, number>
}): HeartModeSessionState => {
  hydrate()

  currentSession = {
    id: createSessionID(),
    profile: { ...profile },
    seedIds: [...seedIds],
    startedAt: Date.now(),
    sourceSeedByTrackID: { ...sourceSeedByTrackID },
    playedTrackIDs: []
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
