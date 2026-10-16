/**
 * Build a finite recovery sequence for cover images.
 *
 * Usage: getCoverImageSources(coverUrl)
 * Args: coverUrl is an image URL from NetEase, another service, or local data.
 * Returns: direct image, optional NetEase main-process proxy, then the
 *          application placeholder, deduplicated and in priority order.
 */
import {
  buildNeteaseImageProxyUrl,
  buildNeteaseImageUrl,
  isNeteaseAssetUrl
} from '../../shared/neteaseAssetUrl'

export const DEFAULT_COVER_IMAGE_URL = 'atom://get-default-pic'

export const getCoverImageSources = (coverUrl: string): string[] => {
  const original = typeof coverUrl === 'string' ? coverUrl.trim() : ''
  if (!original) return [DEFAULT_COVER_IMAGE_URL]

  const direct = isNeteaseAssetUrl(original) ? buildNeteaseImageUrl(original) : original
  const proxy = isNeteaseAssetUrl(direct) ? buildNeteaseImageProxyUrl(direct) : ''

  return Array.from(new Set([direct, proxy, DEFAULT_COVER_IMAGE_URL].filter(Boolean)))
}
