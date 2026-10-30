import { assertPublicRemoteUrl, isRedirectStatus } from '../security/remoteUrl'
import http from 'node:http'
import https from 'node:https'
import { Readable } from 'node:stream'
import type { HttpsProxyAgent } from 'https-proxy-agent'

/** Node's HTTP client supports the existing proxy Agent; native fetch ignores it. */
export type RemoteStreamOptions = {
  headers?: ConstructorParameters<typeof Headers>[0]
  signal?: AbortSignal
  method?: string
  agent?: HttpsProxyAgent<string>
  timeoutMs?: number
  onRedirect?: (count: number) => void
}

export const fetchRemoteStream = (url: URL, options: RemoteStreamOptions = {}): Promise<Response> =>
  new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const request = client.request(
      url,
      {
        method: options.method || 'GET',
        headers: Object.fromEntries(new Headers(options.headers)),
        signal: options.signal,
        agent: options.agent
      },
      (incoming) => {
        clearTimeout(headerTimer)
        const headers = new Headers()
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (
            value !== undefined &&
            !['connection', 'transfer-encoding', 'keep-alive'].includes(key)
          ) {
            headers.set(key, Array.isArray(value) ? value.join(', ') : value)
          }
        }
        const status = incoming.statusCode || 502
        if (status < 200 || status > 599) {
          incoming.destroy()
          reject(
            Object.assign(new Error('Invalid upstream status'), { code: 'INVALID_UPSTREAM_STATUS' })
          )
          return
        }
        // HEAD/204/205/304 responses cannot have a Response body.
        const noBody = options.method === 'HEAD' || [204, 205, 304].includes(status)
        if (noBody) incoming.resume()
        resolve(
          new Response(noBody ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>), {
            status,
            statusText: incoming.statusMessage,
            headers
          })
        )
      }
    )
    request.setTimeout(options.timeoutMs ?? 30_000, () => {
      const error = new Error('Audio upstream idle timeout')
      error.name = 'TimeoutError'
      request.destroy(error)
    })
    const headerTimer = setTimeout(() => {
      const error = new Error('Audio upstream header timeout')
      error.name = 'TimeoutError'
      request.destroy(error)
    }, options.timeoutMs ?? 15_000)
    request.on('error', (error) => {
      clearTimeout(headerTimer)
      reject(error)
    })
    request.end()
  })

/** Revalidate every redirect and close its body even if validation/DNS fails. */
export const fetchValidatedStream = async (
  url: string,
  options: RemoteStreamOptions = {},
  validate: (url: string | URL) => Promise<URL> = assertPublicRemoteUrl
): Promise<Response> => {
  let currentUrl = await validate(url)
  let headers = new Headers(options.headers)
  for (let count = 0; count <= 5; count++) {
    const response = await fetchRemoteStream(currentUrl, { ...options, headers })
    if (!isRedirectStatus(response.status)) return response
    const location = response.headers.get('location')
    if (!location) return response
    await response.body?.cancel().catch(() => undefined)
    if (count === 5) throw new Error('Too many audio redirects')
    if (!['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase())) {
      throw new Error('Refusing redirect of a non-readonly request')
    }
    const nextUrl = await validate(new URL(location, currentUrl))
    options.onRedirect?.(count + 1)
    headers = new Headers(headers)
    if (nextUrl.origin !== currentUrl.origin) {
      headers.delete('authorization')
      headers.delete('cookie')
      headers.delete('proxy-authorization')
    }
    currentUrl = nextUrl
  }
  throw new Error('Audio redirect failed')
}
