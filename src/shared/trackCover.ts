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
    if (!url || url.startsWith('atom://get-default-pic')) continue
    try {
      const parsed = new URL(url)
      // Legacy player snapshots can still contain the old bundled/default artwork.
      if (
        /^p\d+\.music\.126\.net$/i.test(parsed.hostname) &&
        parsed.pathname === '/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg'
      )
        continue
      if (
        [
          '/assets/images/default.jpg',
          '/src/assets/images/default.jpg',
          '/images/default.jpg'
        ].includes(parsed.pathname) ||
        /^\/assets\/default-[\w-]+\.jpg$/.test(parsed.pathname)
      )
        continue
    } catch {
      // Relative/local cover paths remain valid inputs to their existing handlers.
    }
    return url
  }
  return ''
}
