type TrackCoverFields = {
  album?: { picUrl?: unknown } | null
  al?: { picUrl?: unknown } | null
  picUrl?: unknown
}

/** Placeholder artwork must not prevent a later song-detail lookup. */
export const getUsableTrackCoverUrl = (track: TrackCoverFields | null | undefined): string => {
  if (!track) return ''
  for (const candidate of [track.album?.picUrl, track.al?.picUrl, track.picUrl]) {
    if (typeof candidate !== 'string') continue
    const url = candidate.trim()
    if (url && url !== 'atom://get-default-pic') return url
  }
  return ''
}
