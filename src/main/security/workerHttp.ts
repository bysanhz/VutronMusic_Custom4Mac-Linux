import dns from 'dns/promises'
import http from 'http'
import https from 'https'
import { isPrivateIpAddress, isUnsafeHostname, parseSafeExternalUrl } from './validation'

const MAX_REDIRECTS = 5
const DEFAULT_TIMEOUT_MS = 30_000

type DownloadOptions = {
  maxBytes: number
  timeoutMs?: number
  headers?: Record<string, string>
}

type DownloadResult = {
  buffer: Buffer
  contentType: string
  size: number
  url: string
}

const assertPublicUrl = async (value: string | URL): Promise<URL> => {
  const url = parseSafeExternalUrl(value instanceof URL ? value.toString() : value)
  if (!url || isUnsafeHostname(url.hostname)) {
    throw new Error('下载地址不是受允许的公网 HTTP(S) 地址')
  }

  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((item) => isPrivateIpAddress(item.address))) {
    throw new Error('下载地址解析到了私有或保留 IP')
  }
  return url
}

const requestBuffer = async (
  url: URL,
  options: Required<DownloadOptions>,
  redirectCount: number
): Promise<DownloadResult> => {
  await assertPublicUrl(url)

  return await new Promise<DownloadResult>((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const request = client.get(
      url,
      {
        headers: options.headers,
        timeout: options.timeoutMs
      },
      async (response) => {
        const status = response.statusCode || 0
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location
          response.resume()
          if (!location) return reject(new Error(`重定向响应缺少 Location：${status}`))
          if (redirectCount >= MAX_REDIRECTS) return reject(new Error('下载重定向次数过多'))

          try {
            const nextUrl = await assertPublicUrl(new URL(location, url))
            resolve(await requestBuffer(nextUrl, options, redirectCount + 1))
          } catch (error) {
            reject(error)
          }
          return
        }

        if (status < 200 || status >= 300) {
          response.resume()
          reject(new Error(`下载失败，HTTP 状态码：${status}`))
          return
        }

        const declaredLength = Number(response.headers['content-length'] || 0)
        if (declaredLength > options.maxBytes) {
          response.destroy()
          reject(new Error('下载内容超过允许大小'))
          return
        }

        const chunks: Buffer[] = []
        let receivedBytes = 0
        response.on('data', (chunk: Buffer | Uint8Array) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          receivedBytes += buffer.length
          if (receivedBytes > options.maxBytes) {
            response.destroy(new Error('下载内容超过允许大小'))
            return
          }
          chunks.push(buffer)
        })
        response.on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: String(response.headers['content-type'] || 'application/octet-stream'),
            size: receivedBytes,
            url: url.toString()
          })
        })
        response.on('error', reject)
      }
    )

    request.on('timeout', () => request.destroy(new Error('下载请求超时')))
    request.on('error', reject)
  })
}

export const downloadPublicBuffer = async (
  value: string | URL,
  options: DownloadOptions
): Promise<DownloadResult> => {
  const url = await assertPublicUrl(value)
  return await requestBuffer(
    url,
    {
      maxBytes: options.maxBytes,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      headers: options.headers ?? {}
    },
    0
  )
}
