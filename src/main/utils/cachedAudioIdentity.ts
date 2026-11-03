import { parseFile } from 'music-metadata'
import { audioIdentityMismatch, type AudioIdentity } from '../../shared/audioIdentity'

export const metadataIdentity = (metadata: {
  common: { title?: string; artists?: string[]; artist?: string }
  format: { duration?: number }
}): AudioIdentity => ({
  name: metadata.common.title,
  artists: (
    metadata.common.artists || (metadata.common.artist ? [metadata.common.artist] : [])
  ).map((name) => ({ name })),
  duration: Number(metadata.format.duration) * 1000
})

/** Validate legacy cache bytes without trusting their filename or rewritten catalog metadata. */
export const cachedAudioMismatch = async (track: any): Promise<string | null> => {
  try {
    const metadata = await parseFile(track.url, { skipCovers: true })
    return audioIdentityMismatch(track, metadataIdentity(metadata), false)
  } catch {
    return 'cache_metadata_unavailable'
  }
}
