import { ref, watch, type WatchStopHandle } from 'vue'
import type { usePlayerStore } from '../store/player'

type PlayerStore = ReturnType<typeof usePlayerStore>

export type RecentTrackEntry = {
  id: number
  name: string
  artist: string
  pic: string
  playedAt: number
}

export type QueueSnapshot = {
  id: string
  label: string
  createdAt: number
  sourceType: string
  sourceId: number | string
  trackIds: number[]
  currentIndex: number
}

const RECENT_TRACKS_KEY = 'vutronmusic-recent-tracks-v1'
const QUEUE_SNAPSHOTS_KEY = 'vutronmusic-queue-snapshots-v1'
const MAX_RECENT_TRACKS = 50
const MAX_QUEUE_SNAPSHOTS = 12

export const playbackHistoryModalVisible = ref(false)
export const recentTracks = ref<RecentTrackEntry[]>([])
export const queueSnapshots = ref<QueueSnapshot[]>([])

let activePlayerStore: PlayerStore | null = null
let stopTrackWatch: WatchStopHandle | null = null
let unsubscribeActions: (() => void) | null = null

const readArray = <T>(key: string): T[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

const persist = (): void => {
  try {
    localStorage.setItem(RECENT_TRACKS_KEY, JSON.stringify(recentTracks.value))
    localStorage.setItem(QUEUE_SNAPSHOTS_KEY, JSON.stringify(queueSnapshots.value))
  } catch (error) {
    console.warn('[PlaybackHistory] 保存播放历史失败：', error)
  }
}

const getArtistName = (track: Record<string, any>): string => {
  const artists = track.artists || track.ar || []
  return String(artists[0]?.name || '')
}

const getTrackPicture = (track: Record<string, any>): string =>
  String(track.album?.picUrl || track.al?.picUrl || track.picUrl || '')

const addRecentTrack = (track: Record<string, any>): void => {
  const id = Number(track.id)
  if (!Number.isFinite(id) || id <= 0) return

  const entry: RecentTrackEntry = {
    id,
    name: String(track.name || `Track ${id}`),
    artist: getArtistName(track),
    pic: getTrackPicture(track),
    playedAt: Date.now()
  }

  recentTracks.value = [entry, ...recentTracks.value.filter((item) => item.id !== id)].slice(
    0,
    MAX_RECENT_TRACKS
  )
  persist()
}

const createSnapshotLabel = (store: PlayerStore): string => {
  const sourceType = String(store.playlistSource?.type || '')
  if (sourceType === 'intelligence') return '心动模式前的队列'
  if (sourceType.includes('local')) return '本地音乐队列'
  return store.currentTrack?.name ? `${store.currentTrack.name} 所在队列` : '播放队列'
}

export const captureCurrentQueueSnapshot = (label?: string): QueueSnapshot | null => {
  const store = activePlayerStore
  if (!store) return null

  const trackIds = store._list
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (!trackIds.length) return null

  const snapshot: QueueSnapshot = {
    id:
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: label || createSnapshotLabel(store),
    createdAt: Date.now(),
    sourceType: String(store.playlistSource?.type || 'history'),
    sourceId: store.playlistSource?.id ?? 0,
    trackIds,
    currentIndex: Math.min(Math.max(Number(store.currentTrackIndex) || 0, 0), trackIds.length - 1)
  }

  const sameAsLatest = queueSnapshots.value[0]
  if (
    sameAsLatest &&
    sameAsLatest.sourceType === snapshot.sourceType &&
    sameAsLatest.sourceId === snapshot.sourceId &&
    sameAsLatest.currentIndex === snapshot.currentIndex &&
    sameAsLatest.trackIds.join(',') === snapshot.trackIds.join(',')
  ) {
    return sameAsLatest
  }

  queueSnapshots.value = [snapshot, ...queueSnapshots.value].slice(0, MAX_QUEUE_SNAPSHOTS)
  persist()
  return snapshot
}

export const restoreQueueSnapshot = async (snapshot: QueueSnapshot): Promise<boolean> => {
  const store = activePlayerStore
  if (!store || !snapshot.trackIds.length) return false

  await store.replacePlaylist(
    snapshot.sourceType || 'history',
    snapshot.sourceId ?? 0,
    [...snapshot.trackIds],
    snapshot.currentIndex
  )
  return true
}

export const playRecentTrack = async (entry: RecentTrackEntry): Promise<boolean> => {
  const store = activePlayerStore
  if (!store) return false
  await store.replacePlaylist('recent-history', 0, [entry.id], 0)
  return true
}

export const deleteQueueSnapshot = (snapshotId: string): void => {
  queueSnapshots.value = queueSnapshots.value.filter((snapshot) => snapshot.id !== snapshotId)
  persist()
}

export const clearPlaybackHistory = (): void => {
  recentTracks.value = []
  queueSnapshots.value = []
  persist()
}

export const initializePlaybackHistory = (playerStore: PlayerStore): (() => void) => {
  activePlayerStore = playerStore
  recentTracks.value = readArray<RecentTrackEntry>(RECENT_TRACKS_KEY).slice(0, MAX_RECENT_TRACKS)
  queueSnapshots.value = readArray<QueueSnapshot>(QUEUE_SNAPSHOTS_KEY).slice(
    0,
    MAX_QUEUE_SNAPSHOTS
  )

  stopTrackWatch?.()
  stopTrackWatch = watch(
    () => playerStore.currentTrack?.id,
    (trackID, previousTrackID) => {
      if (trackID === undefined || trackID === null || trackID === previousTrackID) return
      if (playerStore.currentTrack) addRecentTrack(playerStore.currentTrack as Record<string, any>)
    },
    { flush: 'post' }
  )

  unsubscribeActions?.()
  unsubscribeActions = playerStore.$onAction(({ name }) => {
    if (name !== 'replacePlaylist') return
    captureCurrentQueueSnapshot()
  })

  return () => {
    stopTrackWatch?.()
    stopTrackWatch = null
    unsubscribeActions?.()
    unsubscribeActions = null
    activePlayerStore = null
  }
}
