import { Readable, pipeline } from 'node:stream'
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib'
import { parseAudioProxyUrl } from '../../shared/neteaseAssetUrl'
import {
  beginAudioDiagnostic,
  audioFailureCode,
  type AudioRequestDiagnostic
} from './audioDiagnostics'

const signature = (chunk: Uint8Array): string => {
  const head = Buffer.from(chunk.subarray(0, 64))
  const text = head.toString('utf8').trimStart().toLowerCase()
  if (/^(<!doctype html|<html|<\?xml)/.test(text)) return 'html'
  if (/^[{[]/.test(text)) return 'json-candidate'
  if (text.startsWith('flac')) return 'flac'
  if (text.startsWith('id3') || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'mp3-or-aac'
  if (text.startsWith('oggs')) return 'ogg'
  if (text.startsWith('riff')) return 'riff'
  if (head.toString('ascii', 4, 8) === 'ftyp') return 'mp4'
  return 'unknown'
}

/** Electron protocol bodies are already-decoded entity bytes, unlike Node's raw HTTP stream. */
const decodeAudioResponse = async (response: Response): Promise<Response> => {
  const encoding = (response.headers.get('content-encoding') || '').trim().toLowerCase()
  if (!response.body || !encoding || encoding === 'identity') return response
  const createDecoder =
    encoding === 'gzip'
      ? createGunzip
      : encoding === 'deflate'
        ? createInflate
        : encoding === 'br'
          ? createBrotliDecompress
          : null
  const range = response.headers.get('content-range')?.match(/^bytes 0-(\d+)\/(\d+)$/)
  // A slice of a compressed representation cannot be decoded as an independent audio range.
  if (
    !createDecoder ||
    (response.status === 206 && (!range || Number(range[1]) + 1 !== Number(range[2])))
  ) {
    await response.body.cancel().catch(() => undefined)
    throw Object.assign(new Error('Cannot decode upstream representation'), {
      code: 'UNSUPPORTED_CONTENT_ENCODING_OR_RANGE'
    })
  }
  const source = Readable.fromWeb(response.body as any)
  const decoder = createDecoder()
  // pipeline propagates cancellation/error in both directions, including the original HTTP socket.
  pipeline(source, decoder, () => {})
  const headers = new Headers(response.headers)
  for (const name of ['content-encoding', 'content-length', 'content-range', 'accept-ranges'])
    headers.delete(name)
  return new Response(Readable.toWeb(decoder) as ReadableStream<Uint8Array>, {
    status: response.status === 206 ? 200 : response.status,
    statusText: response.status === 206 ? 'OK' : response.statusText,
    headers
  })
}

/** Keep backpressure and propagate consumer cancellation to the upstream socket. */
export const monitorAudioResponse = (
  response: Response,
  diagnostic: AudioRequestDiagnostic,
  startedAt: number,
  signal?: AbortSignal
): Response => {
  if (!response.body) {
    diagnostic.phase = 'complete'
    return response
  }
  const reader = response.body.getReader()
  let finished = false
  const finish = (phase: string, interrupted: boolean) => {
    if (finished) return
    finished = true
    diagnostic.phase = phase
    diagnostic.interrupted = interrupted
    diagnostic.elapsedMs = Date.now() - startedAt
    signal?.removeEventListener('abort', abort)
  }
  const abort = () => {
    finish('cancelled', true)
    void reader.cancel().catch(() => undefined)
  }
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await reader.read()
          if (done) {
            finish('complete', false)
            controller.close()
            return
          }
          if (!diagnostic.bytes) {
            diagnostic.firstByteMs = Date.now() - startedAt
            diagnostic.signature = signature(value)
          }
          diagnostic.bytes = (diagnostic.bytes || 0) + value.byteLength
          controller.enqueue(value)
        } catch (error) {
          diagnostic.error = audioFailureCode(error)
          finish('stream-error', true)
          controller.error(error)
        }
      },
      async cancel() {
        finish('cancelled', true)
        await reader.cancel().catch(() => undefined)
      }
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    }
  )
}

/** Production protocol handler, with transport supplied for deterministic HTTP integration tests. */
export const serveAudioProxy = async (
  request: Request,
  fetchSource: (url: string, options: any) => Promise<Response>
): Promise<Response> => {
  const { url, trackId, revision } = parseAudioProxyUrl(request.url)
  const headers = request.headers
  const startedAt = Date.now()
  const diagnostic = beginAudioDiagnostic({
    kind: 'proxy',
    trackId,
    revision,
    host: new URL(url).hostname,
    phase: 'request',
    redirects: 0
  })
  try {
    const response = await fetchSource(url, {
      headers,
      signal: request.signal,
      onRedirect: (count: number) => {
        diagnostic.redirects = count
      }
    })
    Object.assign(diagnostic, {
      phase: 'headers',
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      contentType: (response.headers.get('content-type') || '').split(';')[0].slice(0, 96),
      contentLength: response.headers.get('content-length'),
      acceptRanges: response.headers.get('accept-ranges'),
      contentRange: response.headers.get('content-range'),
      contentEncoding: response.headers.get('content-encoding') || 'identity'
    })
    if (!response.ok) {
      diagnostic.phase = 'http-error'
      await response.body?.cancel().catch(() => undefined)
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': 'text/plain'
        }
      })
    }

    // 某些“音频地址”实际会返回登录页/错误页。若把 HTML/JSON 原样交给
    // <audio>，Renderer 只会得到难以诊断的 DOMException。这里尽早拒绝。
    const contentType = String(response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()

    if (
      contentType.startsWith('text/') ||
      contentType === 'application/json' ||
      contentType.endsWith('+json') ||
      contentType === 'application/xml'
    ) {
      await response.body?.cancel().catch(() => undefined)
      diagnostic.phase = 'non-audio'
      return new Response(null, {
        status: 502,
        statusText: 'Upstream did not return audio',
        headers: {
          'Content-Type': 'text/plain'
        }
      })
    }

    const decoded = await decodeAudioResponse(response)
    diagnostic.decoded = decoded !== response
    return monitorAudioResponse(decoded, diagnostic, startedAt, request.signal)
  } catch (error) {
    diagnostic.error = audioFailureCode(error)
    diagnostic.elapsedMs = Date.now() - startedAt
    diagnostic.interrupted = request.signal?.aborted || false
    diagnostic.phase = diagnostic.interrupted ? 'cancelled' : 'request-error'
    if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return new Response(null, {
        status: 499,
        statusText: 'Client Closed Request'
      })
    }

    return new Response(null, {
      status: 500,
      statusText: 'Internal Server Error'
    })
  }
}
