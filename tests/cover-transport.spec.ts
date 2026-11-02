import { serveCoverImage } from '../src/main/utils/coverImageResponse'
import { test, expect } from '@playwright/test'
import { fetchNeteaseCover } from '../src/main/utils/coverFetch'
import { resolveRuntimeProxyUrl } from '../src/shared/proxySettings'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=',
  'base64'
)

test('stalled and HTTP-error CDN candidates are aborted before an image sibling is used', async () => {
  let aborted = 0,
    cancelled = 0
  const urls: string[] = []
  const result = await fetchNeteaseCover(
    'https://p4.music.126.net/cover.png?param=512y512&token=fixture-private',
    async (url, { signal }) => {
      urls.push(url)
      if (urls.length === 1)
        return await new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => {
              aborted++
              reject(new Error('aborted'))
            },
            { once: true }
          )
        )
      if (urls.length === 2)
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled++
            }
          }),
          { status: 403 }
        )
      return new Response(png, { headers: { 'content-type': 'image/jpg' } })
    },
    undefined,
    20
  )
  expect(result.format).toBe('image/png')
  expect(result.pic).toEqual(png)
  expect(aborted).toBe(1)
  expect(cancelled).toBe(1)
  expect(urls).toHaveLength(3)
  expect(urls.every((url) => new URL(url).searchParams.get('token') === 'fixture-private')).toBe(
    true
  )
})

test('HTML disguised as audio/image data and oversized covers end finitely; user cancellation does not retry', async () => {
  let requests = 0
  const source = 'https://p1.music.126.net/cover.png?token=private'
  const result = await fetchNeteaseCover(source, async () => {
    requests++
    return new Response('<html>error</html>', { headers: { 'content-type': 'image/png' } })
  })
  expect(result.pic).toBeNull()
  expect(requests).toBe(3)
  const c = new AbortController()
  c.abort()
  requests = 0
  expect(
    (
      await fetchNeteaseCover(
        source,
        async () => {
          requests++
          return new Response(png)
        },
        c.signal
      )
    ).pic
  ).toBeNull()
  expect(requests).toBe(0)
  let cancelled = 0
  expect(
    (
      await fetchNeteaseCover(
        source,
        async () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled++
              }
            }),
            { headers: { 'content-length': String(9 * 1024 * 1024) } }
          )
      )
    ).pic
  ).toBeNull()
  expect(cancelled).toBe(3)
})

test('media and artwork use the established development environment proxy without changing production or explicit choices', () => {
  expect(resolveRuntimeProxyUrl({ type: 0 }, true, 'http://127.0.0.1:7890')).toBe(
    'http://127.0.0.1:7890'
  )
  expect(resolveRuntimeProxyUrl({ type: 0 }, false, 'http://127.0.0.1:7890')).toBe('')
  expect(
    resolveRuntimeProxyUrl(
      { type: 1, address: 'proxy.test', port: 8080 },
      true,
      'http://127.0.0.1:7890'
    )
  ).toBe('http://proxy.test:8080')
  for (const source of ['file:///tmp/file', 'http://proxy.test/path', 'invalid'])
    expect(resolveRuntimeProxyUrl({}, true, source)).toBe('')
})

test('image protocol reports genuine failures instead of a successful default cover', async () => {
  let requests = 0
  const source = 'https://p1.music.126.net/fixture.png'
  const load = async () => {
    requests++
    return { pic: null, format: '' }
  }
  expect((await serveCoverImage('http://127.0.0.1/private.png', load)).status).toBe(403)
  expect(requests).toBe(0)
  const failed = await serveCoverImage(source, load)
  expect(failed.status).toBe(502)
  expect(failed.headers.get('cache-control')).toBe('no-store')
  expect((await failed.arrayBuffer()).byteLength).toBe(0)
  const ok = await serveCoverImage(source, async () => ({ pic: png, format: 'image/png' }))
  expect(ok.status).toBe(200)
  expect(Buffer.from(await ok.arrayBuffer())).toEqual(png)
  expect(ok.headers.get('content-type')).toBe('image/png')
  expect(
    (
      await serveCoverImage(source, async () => {
        throw Error('network unavailable')
      })
    ).status
  ).toBe(502)
  const controller = new AbortController()
  controller.abort()
  expect((await serveCoverImage(source, load, controller.signal)).status).toBe(499)
  expect(requests).toBe(1)
})
