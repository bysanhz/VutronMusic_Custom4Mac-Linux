export const AUDIO_LEVELS = [
  'standard',
  'higher',
  'exhigh',
  'lossless',
  'hires',
  'jyeffect',
  'sky',
  'vivid',
  'jymaster'
] as const
export type AudioLevel = (typeof AUDIO_LEVELS)[number]
export type AudioQuality = {
  requested?: AudioLevel
  actual?: AudioLevel
  format?: string
  bitrate?: number
  sampleRate?: number
  bitDepth?: number
}

export const audioLevel = (value: unknown): AudioLevel | undefined =>
  AUDIO_LEVELS.includes(value as AudioLevel) ? (value as AudioLevel) : undefined

export const audioQualityFromResponse = (requested: unknown, item: any): AudioQuality => ({
  requested: audioLevel(requested),
  actual: audioLevel(item?.level),
  format:
    typeof item?.type === 'string' && /^[a-z0-9]{2,8}$/i.test(item.type)
      ? item.type.toUpperCase()
      : undefined,
  bitrate: positiveNumber(item?.br),
  sampleRate: positiveNumber(item?.sr),
  bitDepth: positiveNumber(item?.bitDepth)
})

const positiveNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

export const playbackInfo = (track: any) => {
  const quality: AudioQuality = track?.audioQuality || {}
  const actual = audioLevel(quality.actual)
  const requested = audioLevel(quality.requested)
  const rawSource = String(track?.source || '')
  const source =
    track?.type === 'local' || rawSource === 'localTrack'
      ? 'local'
      : track?.cache
        ? 'cache'
        : track?.type === 'stream'
          ? 'stream'
          : rawSource === 'netease'
            ? 'netease'
            : rawSource
              ? 'alternative'
              : 'unknown'
  // A bitrate or the user's preferred setting cannot establish lossless / Hi-Res quality.
  return {
    source,
    provider:
      /^[a-z][a-z0-9_-]{0,30}$/i.test(rawSource) && !['netease', 'localTrack'].includes(rawSource)
        ? rawSource
        : '',
    actual,
    requested,
    substituted: Boolean(actual && requested && actual !== requested),
    format:
      typeof quality.format === 'string' && /^[a-z0-9]{2,8}$/i.test(quality.format)
        ? quality.format.toUpperCase()
        : '',
    bitrate: positiveNumber(quality.bitrate),
    sampleRate: positiveNumber(quality.sampleRate),
    bitDepth: positiveNumber(quality.bitDepth)
  }
}
