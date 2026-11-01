import { fileTypeFromBuffer } from 'file-type'
import { getNeteaseImageCandidateUrls } from '../../shared/neteaseAssetUrl'

const MAX_COVER_BYTES = 8 * 1024 * 1024

/** Finite CDN fallback. Abort failed bodies before trying a sibling; preserve signed query fields. */
export const fetchNeteaseCover = async (
  url: string,
  fetchSource: (url: string, options: { signal: AbortSignal }) => Promise<Response>,
  signal?: AbortSignal,
  timeoutMs = 3500
): Promise<{ pic: Buffer | null; format: string }> => {
  for (const candidate of getNeteaseImageCandidateUrls(url)) {
    if (signal?.aborted) break
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, timeoutMs)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const response = await fetchSource(candidate, { signal: controller.signal })
      if (
        !response.ok ||
        !response.body ||
        Number(response.headers.get('content-length')) > MAX_COVER_BYTES
      ) {
        await response.body?.cancel().catch(() => undefined)
        continue
      }
      reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > MAX_COVER_BYTES) throw new Error('Cover exceeds size limit')
        chunks.push(chunk.value)
      }
      const pic = Buffer.concat(chunks, size)
      const detected = await fileTypeFromBuffer(pic)
      if (detected?.mime.startsWith('image/')) return { pic, format: detected.mime }
    } catch {
      // A missing, truncated, non-image or timed-out candidate may have a healthy sibling.
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      await reader?.cancel().catch(() => undefined)
      controller.abort()
    }
  }
  return { pic: null, format: '' }
}
