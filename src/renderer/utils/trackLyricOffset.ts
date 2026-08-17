import { computed, ref, watch, type WatchStopHandle } from 'vue'
import type { usePlayerStore } from '../store/player'
import { globalLyricOffset } from './globalLyricOffset'

type PlayerStore = ReturnType<typeof usePlayerStore>

type TrackOffsetRecord = {
  offset: number
  updatedAt: number
}

const STORAGE_KEY = 'vutronmusic-track-lyric-offsets-v1'
const MAX_RECORDS = 2000
export const MIN_TRACK_LYRIC_OFFSET = -30
export const MAX_TRACK_LYRIC_OFFSET = 30

export const trackLyricOffsetModalVisible = ref(false)
export const trackLyricOffset = ref(0)
export const trackLyricOffsetTrackName = ref('')

let activePlayerStore: PlayerStore | null = null
let stopTrackWatch: WatchStopHandle | null = null

export const normalizeTrackLyricOffset = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  const clamped = Math.min(MAX_TRACK_LYRIC_OFFSET, Math.max(MIN_TRACK_LYRIC_OFFSET, value))
  return Math.round(clamped * 10) / 10
}

const loadRecords = (): Record<string, TrackOffsetRecord> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([trackID, value]) => {
          const record = value as Partial<TrackOffsetRecord>
          const offset = normalizeTrackLyricOffset(Number(record?.offset))
          const updatedAt = Number(record?.updatedAt) || 0
          return [trackID, { offset, updatedAt }] as const
        })
        .filter(([, record]) => record.offset !== 0)
        .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
        .slice(0, MAX_RECORDS)
    )
  } catch (error) {
    console.warn('[TrackLyricOffset] 读取单曲歌词校正失败：', error)
    return {}
  }
}

const saveRecords = (records: Record<string, TrackOffsetRecord>): void => {
  try {
    const compact = Object.fromEntries(
      Object.entries(records)
        .filter(([, record]) => record.offset !== 0)
        .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
        .slice(0, MAX_RECORDS)
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compact))
  } catch (error) {
    console.warn('[TrackLyricOffset] 保存单曲歌词校正失败：', error)
  }
}

const readTrackAdjustment = (trackID: number | string | undefined): number => {
  if (trackID === undefined || trackID === null) return 0
  return normalizeTrackLyricOffset(loadRecords()[String(trackID)]?.offset || 0)
}

const applyAdjustmentToCurrentTrack = (adjustment: number): void => {
  const track = activePlayerStore?.currentTrack as
    | (Record<string, unknown> & { id?: number | string; offset?: number })
    | null
  if (!track?.id) return

  const previousApplied = normalizeTrackLyricOffset(Number(track._vutronUserLyricOffset) || 0)
  const baseOffset = Number(track.offset) || 0
  const nextAdjustment = normalizeTrackLyricOffset(adjustment)

  track.offset = Math.round((baseOffset - previousApplied + nextAdjustment) * 10) / 10
  track._vutronUserLyricOffset = nextAdjustment
  trackLyricOffset.value = nextAdjustment
  trackLyricOffsetTrackName.value = String(track.name || '')
}

export const setTrackLyricOffset = (value: number): number => {
  const trackID = activePlayerStore?.currentTrack?.id
  if (trackID === undefined || trackID === null) return 0

  const normalized = normalizeTrackLyricOffset(value)
  const records = loadRecords()
  const key = String(trackID)

  if (normalized === 0) delete records[key]
  else records[key] = { offset: normalized, updatedAt: Date.now() }

  saveRecords(records)
  applyAdjustmentToCurrentTrack(normalized)
  return normalized
}

export const adjustTrackLyricOffset = (delta: number): number =>
  setTrackLyricOffset(trackLyricOffset.value + delta)

export const resetTrackLyricOffset = (): void => {
  setTrackLyricOffset(0)
}

export const effectiveTrackLyricOffset = computed(
  () => Math.round((trackLyricOffset.value + globalLyricOffset.value) * 10) / 10
)

export const initializeTrackLyricOffset = (playerStore: PlayerStore): (() => void) => {
  activePlayerStore = playerStore
  stopTrackWatch?.()

  stopTrackWatch = watch(
    () => playerStore.currentTrack?.id,
    (trackID) => {
      const adjustment = readTrackAdjustment(trackID)
      applyAdjustmentToCurrentTrack(adjustment)
    },
    { immediate: true, flush: 'post' }
  )

  return () => {
    stopTrackWatch?.()
    stopTrackWatch = null
    activePlayerStore = null
  }
}
