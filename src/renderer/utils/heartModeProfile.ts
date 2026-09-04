import { ref, watch, type WatchStopHandle } from 'vue'

export type HeartModeMode = 'continuous' | 'balanced' | 'diverse' | 'explore' | 'custom'

export type HeartModeProfile = {
  mode: HeartModeMode
  diversity: number
  novelty: number
  familiarity: number
  repeatTolerance: number
  seedCount: number
  shortCooldownHours: number
  mediumCooldownDays: number
  longCooldownDays: number
  maxSameArtistDistance: number
  maxSameSeedDistance: number
}

export const HEART_MODE_PROFILE_KEY = 'vutronmusic-heart-mode-profile-v1'

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export const HEART_MODE_PRESETS: Record<Exclude<HeartModeMode, 'custom'>, HeartModeProfile> = {
  continuous: {
    mode: 'continuous',
    diversity: 15,
    novelty: 40,
    familiarity: 80,
    repeatTolerance: 60,
    seedCount: 1,
    shortCooldownHours: 24,
    mediumCooldownDays: 7,
    longCooldownDays: 30,
    maxSameArtistDistance: 1,
    maxSameSeedDistance: 0
  },
  balanced: {
    mode: 'balanced',
    diversity: 45,
    novelty: 60,
    familiarity: 55,
    repeatTolerance: 35,
    seedCount: 2,
    shortCooldownHours: 24,
    mediumCooldownDays: 7,
    longCooldownDays: 30,
    maxSameArtistDistance: 2,
    maxSameSeedDistance: 1
  },
  diverse: {
    mode: 'diverse',
    diversity: 80,
    novelty: 75,
    familiarity: 35,
    repeatTolerance: 20,
    seedCount: 4,
    shortCooldownHours: 24,
    mediumCooldownDays: 7,
    longCooldownDays: 30,
    maxSameArtistDistance: 4,
    maxSameSeedDistance: 2
  },
  explore: {
    mode: 'explore',
    diversity: 95,
    novelty: 95,
    familiarity: 15,
    repeatTolerance: 5,
    seedCount: 5,
    shortCooldownHours: 24,
    mediumCooldownDays: 7,
    longCooldownDays: 30,
    maxSameArtistDistance: 5,
    maxSameSeedDistance: 3
  }
}

export const DEFAULT_HEART_MODE_PROFILE: HeartModeProfile = { ...HEART_MODE_PRESETS.diverse }

export const heartModeProfile = ref<HeartModeProfile>({ ...DEFAULT_HEART_MODE_PROFILE })

let initialized = false
let stopPersistWatch: WatchStopHandle | null = null

const isHeartModeMode = (value: unknown): value is HeartModeMode =>
  ['continuous', 'balanced', 'diverse', 'explore', 'custom'].includes(String(value))

const normalizeProfile = (
  value: Partial<HeartModeProfile> | null | undefined
): HeartModeProfile => {
  const mode = isHeartModeMode(value?.mode) ? value.mode : DEFAULT_HEART_MODE_PROFILE.mode
  const base =
    mode === 'custom'
      ? DEFAULT_HEART_MODE_PROFILE
      : HEART_MODE_PRESETS[mode as Exclude<HeartModeMode, 'custom'>]

  return {
    mode,
    diversity: clamp(value?.diversity, 0, 100, base.diversity),
    novelty: clamp(value?.novelty, 0, 100, base.novelty),
    familiarity: clamp(value?.familiarity, 0, 100, base.familiarity),
    repeatTolerance: clamp(value?.repeatTolerance, 0, 100, base.repeatTolerance),
    seedCount: Math.round(clamp(value?.seedCount, 1, 8, base.seedCount)),
    shortCooldownHours: clamp(value?.shortCooldownHours, 1, 168, base.shortCooldownHours),
    mediumCooldownDays: clamp(value?.mediumCooldownDays, 1, 60, base.mediumCooldownDays),
    longCooldownDays: clamp(value?.longCooldownDays, 7, 365, base.longCooldownDays),
    maxSameArtistDistance: Math.round(
      clamp(value?.maxSameArtistDistance, 0, 10, base.maxSameArtistDistance)
    ),
    maxSameSeedDistance: Math.round(
      clamp(value?.maxSameSeedDistance, 0, 10, base.maxSameSeedDistance)
    )
  }
}

const persistProfile = (): void => {
  try {
    localStorage.setItem(HEART_MODE_PROFILE_KEY, JSON.stringify(heartModeProfile.value))
  } catch (error) {
    console.warn('[HeartModeProfile] 保存配置失败：', error)
  }
}

export const initializeHeartModeProfile = (): (() => void) => {
  if (!initialized) {
    try {
      const stored = JSON.parse(localStorage.getItem(HEART_MODE_PROFILE_KEY) || 'null')
      heartModeProfile.value = normalizeProfile(stored)
    } catch {
      heartModeProfile.value = { ...DEFAULT_HEART_MODE_PROFILE }
    }

    persistProfile()
    stopPersistWatch = watch(heartModeProfile, persistProfile, { deep: true })
    initialized = true
  }

  return () => {
    stopPersistWatch?.()
    stopPersistWatch = null
    initialized = false
  }
}

export const getHeartModePresetProfile = (
  mode: Exclude<HeartModeMode, 'custom'>
): HeartModeProfile => ({ ...HEART_MODE_PRESETS[mode] })

export const applyHeartModePreset = (mode: HeartModeMode): void => {
  initializeHeartModeProfile()

  if (mode === 'custom') {
    heartModeProfile.value = {
      ...heartModeProfile.value,
      mode: 'custom'
    }
    return
  }

  heartModeProfile.value = getHeartModePresetProfile(mode)
}

export const updateHeartModeProfile = (patch: Partial<HeartModeProfile>): void => {
  initializeHeartModeProfile()
  heartModeProfile.value = normalizeProfile({
    ...heartModeProfile.value,
    ...patch
  })
}
