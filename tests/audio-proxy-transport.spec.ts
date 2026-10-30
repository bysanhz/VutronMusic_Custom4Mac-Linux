import { gzipSync } from 'node:zlib'
import dns from 'node:dns/promises'
import { assertPublicRemoteUrl } from '../src/main/security/remoteUrl'
import { expect, test } from '@playwright/test'
import http from 'node:http'
import net from 'node:net'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { fetchRemoteStream, fetchValidatedStream } from '../src/main/utils/remoteStream'
import { serveAudioProxy } from '../src/main/utils/audioProxyResponse'
import {
  getAudioRequestDiagnostics,
  beginAudioDiagnostic,
  audioFailureCode
} from '../src/main/utils/audioDiagnostics'
import { buildAudioProxyUrl, parseAudioProxyUrl } from '../src/shared/neteaseAssetUrl'
import { isAllowedRemoteAddress, parseSafeExternalUrl } from '../src/main/security/validation'
import { redactDiagnosticText } from '../src/shared/diagnosticRedaction'
import { summarizeLinuxMappings } from '../src/main/linuxProcessMemory'

let server: http.Server
let base: string
let closedStreams = 0

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const route = req.url!.split('?')[0]
    if (route === '/redirect' || route === '/loop' || route === '/blocked-redirect') {
      res.writeHead(302, {
        location:
          route === '/redirect'
            ? '/audio'
            : route === '/loop'
              ? '/loop'
              : 'http://127.0.0.2/private'
      })
      res.write('redirect')
      res.on('close', () => {
        closedStreams++
      })
      return
    }
    if (route === '/idle-body') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' })
      res.write('ID3')
      return
    }
    if (route === '/timeout') return
    if (route === '/slow') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' })
      res.write('ID3')
      const timer = setInterval(() => res.write(Buffer.alloc(1024)), 10)
      res.on('close', () => {
        clearInterval(timer)
        closedStreams++
      })
      return
    }
    if (route === '/html' || route === '/json') {
      res.writeHead(200, { 'content-type': route === '/html' ? 'text/html' : 'application/json' })
      return res.end(route === '/html' ? '<html>denied</html>' : '{"code":403}')
    }
    if (/^\/\d+$/.test(route)) {
      res.writeHead(Number(route.slice(1)))
      return res.end('denied')
    }
    if (req.headers.range === 'bytes=0-3') {
      res.writeHead(206, {
        'content-type': 'audio/flac',
        'content-length': '4',
        'accept-ranges': 'bytes',
        'content-range': 'bytes 0-3/100'
      })
      return res.end('fLaC')
    }
    res.writeHead(200, { 'content-type': 'audio/mpeg' })
    res.end('ID3')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`
})
test.afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const serve = (path: string, init: RequestInit = {}) =>
  serveAudioProxy(
    new Request(buildAudioProxyUrl(`${base}${path}?token=private`, 443854, 7), init),
    (url, options) => fetchRemoteStream(new URL(url), options)
  )

test('preserves signed URL bytes, correlation, Range/206 and exact binary data', async () => {
  const signed = 'https://m7.music.126.net/a%2Fb.flac?sign=a%2B%2F&x=1&x=2'
  expect(parseAudioProxyUrl(buildAudioProxyUrl(signed, 44, 3))).toEqual({
    url: signed,
    trackId: '44',
    revision: 3
  })
  expect(parseAudioProxyUrl(`atom://get-online-music/${signed}`).url).toBe(signed)
  const response = await serve('/audio', { headers: { range: 'bytes=0-3' } })
  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toBe('bytes 0-3/100')
  expect(response.headers.get('content-length')).toBe('4')
  expect(response.headers.get('accept-ranges')).toBe('bytes')
  expect(await response.text()).toBe('fLaC')
  expect(getAudioRequestDiagnostics().at(-1)).toMatchObject({
    phase: 'complete',
    trackId: '443854',
    revision: 7,
    signature: 'flac',
    bytes: 4
  })
})

for (const status of [403, 404, 500, 503]) {
  test(`preserves HTTP ${status}, cancels its body and records its failing layer`, async () => {
    const response = await serve(`/${status}`)
    expect(response.status).toBe(status)
    expect(await response.text()).toBe('')
    expect(getAudioRequestDiagnostics().at(-1)).toMatchObject({ phase: 'http-error', status })
  })
}
for (const type of ['html', 'json']) {
  test(`rejects upstream ${type} before handing it to the demuxer`, async () => {
    expect((await serve(`/${type}`)).status).toBe(502)
    expect(getAudioRequestDiagnostics().at(-1)?.phase).toBe('non-audio')
  })
}

test('consumer cancellation and AbortSignal close abandoned upstream sockets', async () => {
  const before = closedStreams
  const response = await serve('/slow')
  const reader = response.body!.getReader()
  await reader.read()
  await reader.cancel()
  await expect.poll(() => closedStreams).toBe(before + 1)
  expect(getAudioRequestDiagnostics().at(-1)).toMatchObject({
    phase: 'cancelled',
    interrupted: true
  })
  const abort = new AbortController()
  const second = await serve('/slow', { signal: abort.signal })
  await second.body!.getReader().read()
  abort.abort()
  await expect.poll(() => closedStreams).toBe(before + 2)
})

test('bounds connection/header waits and accepts a subsequent healthy request', async () => {
  await expect(
    fetchRemoteStream(new URL(`${base}/timeout`), { timeoutMs: 40 })
  ).rejects.toHaveProperty('name', 'TimeoutError')
  expect(await (await serve('/healthy')).text()).toBe('ID3')
})

test('actually uses the configured CONNECT proxy for an otherwise unresolvable audio host', async () => {
  const proxy = http.createServer()
  let connects = 0
  proxy.on('connect', (_req, socket, head) => {
    connects++
    const upstream = net.connect((server.address() as net.AddressInfo).port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    socket.on('error', () => upstream.destroy())
    upstream.on('error', () => socket.destroy())
    socket.on('close', () => upstream.destroy())
  })
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  const agent = new HttpsProxyAgent(`http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}`)
  try {
    const response = await fetchRemoteStream(new URL('http://unresolvable.invalid/audio'), {
      agent
    })
    expect(await response.text()).toBe('ID3')
    expect(connects).toBe(1)
  } finally {
    agent.destroy()
    proxy.closeAllConnections()
    await new Promise<void>((resolve) => proxy.close(() => resolve()))
  }
})

test('Fake-IP exception stays limited to named NetEase CDN hosts on standard ports', () => {
  for (const address of ['198.18.0.102', '198.19.255.254']) {
    expect(isAllowedRemoteAddress(new URL('https://m7.music.126.net/a'), address)).toBe(true)
    expect(isAllowedRemoteAddress(new URL('https://p3.music.126.net/a'), address)).toBe(true)
    for (const url of [
      'https://example.com',
      'https://music.126.net.evil.test',
      'https://m7.music.126.net:8080',
      'https://m7.music.126.net.evil.test'
    ]) {
      expect(isAllowedRemoteAddress(new URL(url), address)).toBe(false)
    }
  }
  for (const address of [
    '127.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    '::ffff:198.18.0.1'
  ]) {
    expect(isAllowedRemoteAddress(new URL('https://m7.music.126.net/a'), address)).toBe(false)
  }
  expect(parseSafeExternalUrl('http://198.18.0.1')).toBeNull()
})

test('bounded diagnostics and memory aggregates never export credentials or mapping paths', () => {
  for (let index = 0; index < 100; index++)
    beginAudioDiagnostic({ kind: 'source', trackId: String(index), phase: 'api' })
  const journal = JSON.stringify(getAudioRequestDiagnostics())
  expect(getAudioRequestDiagnostics()).toHaveLength(40)
  expect(journal).not.toContain('token=')
  expect(journal).not.toContain(base)
  const redacted = redactDiagnosticText(
    'Error https://host/path?token=private Cookie: MUSIC_U=private\nauth token=private'
  )
  expect(redacted).not.toContain('private')
  expect(
    summarizeLinuxMappings(
      '1000-2000 rw-p 0000 00:00 0 [anon:v8]\nRss: 2048 kB\n2000-3000 rw-p 0000 00:00 0 /secret/file\nRss: 1024 kB'
    )
  ).toEqual({ v8: 2, partitionAlloc: 0, anonymous: 0, file: 1, other: 0 })
})

test('redirects preserve Range, are bounded, and release bodies before rejecting unsafe targets', async () => {
  let redirects = 0
  const validate = async (value: string | URL) => {
    const url = new URL(value)
    if (url.hostname !== '127.0.0.1') throw new Error('blocked test target')
    return url
  }
  const response = await fetchValidatedStream(
    `${base}/redirect`,
    {
      headers: { range: 'bytes=0-3' },
      onRedirect: (count) => {
        redirects = count
      }
    },
    validate
  )
  expect(response.status).toBe(206)
  expect(await response.text()).toBe('fLaC')
  expect(redirects).toBe(1)
  const before = closedStreams
  await expect(fetchValidatedStream(`${base}/blocked-redirect`, {}, validate)).rejects.toThrow(
    'blocked test target'
  )
  await expect.poll(() => closedStreams).toBeGreaterThan(before)
  await expect(fetchValidatedStream(`${base}/loop`, {}, validate)).rejects.toThrow(
    'Too many audio redirects'
  )
})

test('DOMException numeric codes cannot crash cancellation diagnostics', () => {
  expect(audioFailureCode(new DOMException('cancelled', 'AbortError'))).toBe('AbortError')
  expect(audioFailureCode({ code: 403 })).toBe('request_failed')
  expect(audioFailureCode({ code: 'ECONNRESET' })).toBe('ECONNRESET')
})

test('production DNS validation checks every answer, including mixed private/Fake-IP answers', async () => {
  const original = dns.lookup
  try {
    dns.lookup = (async () => [
      { address: '198.18.0.102', family: 4 },
      { address: '10.0.0.8', family: 4 }
    ]) as typeof dns.lookup
    await expect(assertPublicRemoteUrl('https://m7.music.126.net/audio')).rejects.toHaveProperty(
      'code',
      'NON_PUBLIC_DNS'
    )
    dns.lookup = (async () => [{ address: '198.18.0.102', family: 4 }]) as typeof dns.lookup
    await expect(assertPublicRemoteUrl('https://example.com/audio')).rejects.toHaveProperty(
      'code',
      'NON_PUBLIC_DNS'
    )
    await expect(assertPublicRemoteUrl('https://m7.music.126.net/audio')).resolves.toHaveProperty(
      'hostname',
      'm7.music.126.net'
    )
    await expect(assertPublicRemoteUrl('http://198.18.0.102/audio')).rejects.toHaveProperty(
      'code',
      'UNSAFE_REMOTE_URL'
    )
  } finally {
    dns.lookup = original
  }
})

test('decodes wire content once, drops encoded byte headers, and closes encoded sources on cancellation', async () => {
  const compressed = gzipSync(Buffer.from('fLaC'))
  const response = await serveAudioProxy(
    new Request(buildAudioProxyUrl('https://m7.music.126.net/test', 1, 1)),
    async () =>
      new Response(new Uint8Array(compressed), {
        headers: {
          'content-type': 'audio/flac',
          'content-encoding': 'gzip',
          'content-length': String(compressed.length)
        }
      })
  )
  expect(await response.text()).toBe('fLaC')
  expect(response.headers.get('content-length')).toBeNull()
  expect(response.headers.get('content-encoding')).toBeNull()
  expect(getAudioRequestDiagnostics().at(-1)).toMatchObject({
    contentEncoding: 'gzip',
    decoded: true,
    bytes: 4
  })
  let cancelled = false
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(gzipSync(Buffer.alloc(1024 * 1024))))
    },
    cancel() {
      cancelled = true
    }
  })
  const active = await serveAudioProxy(
    new Request(buildAudioProxyUrl('https://m7.music.126.net/test', 1, 2)),
    async () =>
      new Response(source, { headers: { 'content-type': 'audio/wav', 'content-encoding': 'gzip' } })
  )
  const reader = active.body!.getReader()
  await reader.read()
  await reader.cancel()
  await expect.poll(() => cancelled).toBe(true)
})

test('rejects undecodable encoded byte slices instead of passing inconsistent Range metadata', async () => {
  let cancelled = false
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true
    }
  })
  const response = await serveAudioProxy(
    new Request(buildAudioProxyUrl('https://m7.music.126.net/test', 1, 1)),
    async () =>
      new Response(source, {
        status: 206,
        headers: {
          'content-type': 'audio/flac',
          'content-encoding': 'gzip',
          'content-range': 'bytes 4-9/100'
        }
      })
  )
  expect(response.status).toBe(500)
  expect(cancelled).toBe(true)
  expect(getAudioRequestDiagnostics().at(-1)?.error).toBe('UNSUPPORTED_CONTENT_ENCODING_OR_RANGE')
})

test('idle response bodies time out and out-of-range upstream status codes cannot crash the main process', async () => {
  const response = await fetchRemoteStream(new URL(`${base}/idle-body`), { timeoutMs: 50 })
  const reader = response.body!.getReader()
  expect((await reader.read()).value?.length).toBe(3)
  await expect(reader.read()).rejects.toThrow()
  await expect(fetchRemoteStream(new URL(`${base}/600`))).rejects.toHaveProperty(
    'code',
    'INVALID_UPSTREAM_STATUS'
  )
  expect(await (await serve('/healthy')).text()).toBe('ID3')
})

test('unknown Content-Encoding cannot select inherited Object factory properties or retain its body', async () => {
  let cancelled = false
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true
    }
  })
  const response = await serveAudioProxy(
    new Request(buildAudioProxyUrl('https://m7.music.126.net/test', 1, 1)),
    async () =>
      new Response(source, {
        headers: { 'content-type': 'audio/flac', 'content-encoding': 'constructor' }
      })
  )
  expect(response.status).toBe(500)
  expect(cancelled).toBe(true)
})
