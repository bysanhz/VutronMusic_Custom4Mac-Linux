import { isNeteaseAssetUrl } from '../../shared/neteaseAssetUrl'

/** A failed artwork request must not masquerade as a successful placeholder. */
export const serveCoverImage = async (
  url: string,
  load: (url: string, signal?: AbortSignal) => Promise<{ pic: Buffer | null; format: string }>,
  signal?: AbortSignal
): Promise<Response> => {
  const headers = { 'Cache-Control': 'no-store' }
  if (!isNeteaseAssetUrl(url)) return new Response(null, { status: 403, headers })
  if (signal?.aborted) return new Response(null, { status: 499, headers })
  try {
    const result = await load(url, signal)
    if (result.pic?.length) {
      return new Response(new Uint8Array(result.pic), {
        headers: { 'Content-Type': result.format, 'Cache-Control': 'public, max-age=86400' }
      })
    }
  } catch {
    // Keep the response observable as an image error; never substitute other artwork.
  }
  return new Response(null, { status: signal?.aborted ? 499 : 502, headers })
}
