import { selectVerifiedAudioCandidate, type AudioIdentity } from '../../shared/audioIdentity'
import { beginAudioDiagnostic } from './audioDiagnostics'

type SongInfo = AudioIdentity & { id: string | number; album: { name: string }; keyword?: string }
let matcher: ((id: number | string, sources: string[], data: SongInfo) => Promise<any>) | undefined

/**
 * UNM 0.28 has no public selection hook. Replace only its cached selector before
 * providers capture it; never edit node_modules or install a global loader hook.
 * A provider that skips candidate validation must not silently return search hit #1.
 */
const loadVerifiedMatcher = () => {
  if (matcher) return matcher
  const base = '@unblockneteasemusic/server'
  const providersPath = require.resolve(`${base}/src/consts`)
  if (require.cache[providersPath]) throw new Error('UNM_UNVERIFIED_LOAD_ORDER')
  const selectionPath = require.resolve(`${base}/src/provider/select`)
  require(selectionPath)
  const verified = new WeakSet<object>()
  const rejected = new WeakSet<object>()
  // Stable per-source objects retain UNM's search cache on retries, without
  // sharing a validation receipt across providers or retaining an unbounded catalog.
  const inputs = new Map<string, Map<string, SongInfo>>()
  const select = (list: AudioIdentity[], info: SongInfo) => {
    const chosen = selectVerifiedAudioCandidate(list, info)
    if (chosen) verified.add(info)
    else rejected.add(info)
    return chosen
  }
  Object.defineProperty(select, 'ENABLE_FLAC', {
    get: () => String(process.env.ENABLE_FLAC).toLowerCase() === 'true'
  })
  require.cache[selectionPath]!.exports = select
  const providers = require(providersPath).PROVIDERS
  for (const [source, provider] of Object.entries(providers) as Array<[string, any]>) {
    const check = provider.check
    provider.check = async (info: SongInfo) => {
      // UNM 0.28 discards the search metadata in these providers. Their URLs
      // already fail our identity check; reject before spawning a slow search.
      if (['youtube', 'youtubedl', 'ytdlp'].includes(source)) {
        beginAudioDiagnostic({
          kind: 'source',
          trackId: String(info.id),
          source,
          phase: 'candidate-skipped',
          error: 'provider_identity_unverifiable'
        })
        throw new Error('UNM_IDENTITY_UNVERIFIED')
      }
      const key = JSON.stringify([info.id, info.name, info.duration, info.artists, info.keyword])
      let perSource = inputs.get(key)
      if (!perSource) {
        perSource = new Map()
        inputs.set(key, perSource)
        if (inputs.size > 32) inputs.delete(inputs.keys().next().value!)
      }
      let input = perSource.get(source)
      if (!input) {
        input = { ...info }
        perSource.set(source, input)
      }
      try {
        const url = await check(input)
        // pyncmd addresses the original NetEase ID rather than searching another catalog.
        if (source !== 'pyncmd' && !verified.has(input)) throw new Error('UNM_IDENTITY_UNVERIFIED')
        beginAudioDiagnostic({
          kind: 'source',
          trackId: String(info.id),
          source,
          phase: source === 'pyncmd' ? 'direct-id-source' : 'candidate-verified'
        })
        return url
      } catch (error) {
        beginAudioDiagnostic({
          kind: 'source',
          trackId: String(info.id),
          source,
          phase: 'candidate-rejected',
          error: rejected.has(input)
            ? 'candidate_identity_mismatch'
            : 'source_unavailable_or_unverified'
        })
        throw error
      }
    }
  }
  matcher = require(base)
  return matcher!
}

export const matchVerifiedUnblock = async (track: any, sources: string[]) => {
  const data: SongInfo = {
    id: track.id,
    name: track.name,
    duration: Number(track.dt || track.duration),
    album: track.album || track.al || { name: '' },
    artists: Array.isArray(track.artists) && track.artists.length ? track.artists : track.ar || []
  }
  return loadVerifiedMatcher()(track.id, sources, data)
}
