/** Conservative identity checks: a search hit is not proof that it is the requested recording. */
export type AudioIdentity = {
  name?: string
  duration?: number
  dt?: number
  artists?: Array<{ name?: string }> | { name?: string }
  ar?: Array<{ name?: string }>
}

const normalize = (value: unknown): string =>
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, '')

const artistNames = (value: AudioIdentity): string[] => {
  const artists = Array.isArray(value.artists)
    ? value.artists.length
      ? value.artists
      : value.ar || []
    : value.artists || value.ar || []
  return (Array.isArray(artists) ? artists : [artists])
    .map((artist) => normalize(artist.name))
    .filter(Boolean)
    .sort()
}

export const audioIdentityMismatch = (
  expected: AudioIdentity,
  candidate: AudioIdentity,
  requireNames = true
): string | null => {
  const title = normalize(candidate.name)
  if ((requireNames || title) && (!title || title !== normalize(expected.name)))
    return 'title_mismatch'
  const artists = artistNames(candidate)
  const wantedArtists = artistNames(expected)
  if (
    (requireNames || artists.length) &&
    (!artists.length || !wantedArtists.length || artists.join('|') !== wantedArtists.join('|'))
  ) {
    return 'artist_mismatch'
  }
  const wantedDuration = Number(expected.dt || expected.duration)
  const duration = Number(candidate.dt || candidate.duration)
  if (
    Number.isFinite(wantedDuration) &&
    wantedDuration > 0 &&
    Number.isFinite(duration) &&
    duration > 0 &&
    Math.abs(duration - wantedDuration) > 5000
  )
    return 'duration_mismatch'
  return null
}

export const selectVerifiedAudioCandidate = <T extends AudioIdentity>(
  list: T[],
  expected: AudioIdentity
): T | undefined =>
  list
    .filter((candidate) => !audioIdentityMismatch(expected, candidate))
    .sort(
      (a, b) =>
        Math.abs(Number(a.duration || expected.duration) - Number(expected.duration)) -
        Math.abs(Number(b.duration || expected.duration) - Number(expected.duration))
    )[0]
