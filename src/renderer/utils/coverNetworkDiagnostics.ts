/**
 * Collect bounded, privacy-preserving cover load diagnostics.
 *
 * Usage: imported once by the existing one-click diagnostics feature.
 * Args: image load/error events from shared cover cards are observed automatically.
 * Returns: aggregate counters, sanitized CDN hosts and at most two private
 *          failed NetEase URLs for on-demand main-process probing. The URLs
 *          themselves are never included in the copied diagnostics report.
 */
import { isNeteaseAssetUrl } from '../../shared/neteaseAssetUrl'

const MAX_RECENT_FAILURES = 12
const MAX_PRIVATE_PROBE_URLS = 6

type CoverFailure = {
  time: string
  host: string
  protocol: string
  netease: boolean
  hasSource: boolean
}

const failures: CoverFailure[] = []
const privateProbeUrls: string[] = []
let loadCount = 0
let errorCount = 0

/** Deliberately exclude path, query, fragment, credentials and song IDs. */
export const describeCoverImageSource = (source: string): Omit<CoverFailure, 'time' | 'hasSource'> => {
  try {
    const parsed = new URL(source)
    return {
      host: isNeteaseAssetUrl(source) ? parsed.hostname : 'other-resource',
      protocol: parsed.protocol,
      netease: isNeteaseAssetUrl(source)
    }
  } catch {
    return { host: '', protocol: '', netease: false }
  }
}

const isCoverImage = (target: EventTarget | null): target is HTMLImageElement =>
  target instanceof HTMLImageElement && Boolean(target.closest('.cover-container'))

if (typeof window !== 'undefined') {
  window.addEventListener(
    'load',
    (event) => {
      if (isCoverImage(event.target)) loadCount += 1
    },
    true
  )

  window.addEventListener(
    'error',
    (event) => {
      if (!isCoverImage(event.target)) return
      errorCount += 1
      const source = event.target.getAttribute('src') || ''
      const details = describeCoverImageSource(source)
      failures.unshift({
        time: new Date().toISOString(),
        ...details,
        hasSource: source.trim().length > 0
      })
      failures.splice(MAX_RECENT_FAILURES)

      if (details.netease && !privateProbeUrls.includes(source)) {
        privateProbeUrls.unshift(source)
        privateProbeUrls.splice(MAX_PRIVATE_PROBE_URLS)
      }
    },
    true
  )
}

export const getCoverLoadDiagnostics = () => ({
  successCount: loadCount,
  failureCount: errorCount,
  recentFailures: failures.map((failure) => ({ ...failure }))
})

/** Internal-only URLs are sent to a domain-restricted main-process probe. */
export const getFailedNeteaseCoverProbeUrls = (): string[] => privateProbeUrls.slice(0, 2)
