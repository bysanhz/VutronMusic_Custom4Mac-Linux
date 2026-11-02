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
let sourceCount = 0
let missingSourceCount = 0
let neteaseSourceCount = 0

/** Distinguish an API record without a cover URL from a CDN image failure. */
export const recordCoverSource = (value: unknown): void => {
  sourceCount += 1
  if (typeof value !== 'string' || !value.trim()) {
    missingSourceCount += 1
  } else if (isNeteaseAssetUrl(value)) {
    neteaseSourceCount += 1
  }
}

/** Deliberately exclude path, query, fragment, credentials and song IDs. */
export const describeCoverImageSource = (
  source: string
): Omit<CoverFailure, 'time' | 'hasSource'> => {
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
  target instanceof HTMLImageElement &&
  Boolean(
    target.closest('.cover-container') ||
      target.matches('[data-vutron-cover], .compact-cover, .player .left img')
  )

if (typeof window !== 'undefined') {
  document.addEventListener(
    'load',
    (event) => {
      if (isCoverImage(event.target)) loadCount += 1
    },
    true
  )

  document.addEventListener(
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

const currentCoverImages = (): HTMLImageElement[] =>
  typeof document === 'undefined'
    ? []
    : [
        ...document.querySelectorAll<HTMLImageElement>(
          '.cover-container img, img[data-vutron-cover], img.compact-cover, .player .left img'
        )
      ]

export const getCoverLoadDiagnostics = () => ({
  currentImages: {
    total: currentCoverImages().length,
    fallback: currentCoverImages().filter((image) => image.dataset.vutronCoverState === 'fallback').length,
    loaded: currentCoverImages().filter((image) => image.complete && image.naturalWidth > 0).length,
    broken: currentCoverImages().filter(
      (image) => image.complete && image.naturalWidth === 0 && image.getAttribute('src')
    ).length,
    pending: currentCoverImages().filter((image) => !image.complete).length
  },
  sourceCount,
  missingSourceCount,
  neteaseSourceCount,
  successCount: loadCount,
  failureCount: errorCount,
  recentFailures: failures.map((failure) => ({ ...failure }))
})

/** Internal-only URLs are sent to a domain-restricted main-process probe. */
export const getFailedNeteaseCoverProbeUrls = (): string[] =>
  [
    ...new Set([
      ...currentCoverImages()
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src)
        .filter(isNeteaseAssetUrl),
      ...privateProbeUrls
    ])
  ].slice(0, 2)
