import { expect, test } from '@playwright/test'
import { describeCoverImageSource, getCoverLoadDiagnostics } from '../src/renderer/utils/coverNetworkDiagnostics'
import { getNeteaseImageCandidateUrls, normalizeNeteaseAssetUrl, buildNeteaseImageUrl } from '../src/shared/neteaseAssetUrl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('cover diagnostics discard the image path and token-like query strings', () => {
  const source = 'https://p3.music.126.net/secret-image-id/cover.jpg?token=not-for-export'
  expect(describeCoverImageSource(source)).toEqual({
    host: 'p3.music.126.net',
    protocol: 'https:',
    netease: true
  })
  expect(JSON.stringify(getCoverLoadDiagnostics())).not.toContain('secret-image-id')
  expect(describeCoverImageSource('http://192.168.1.1:8080/cover.jpg?access=secret').host).toBe(
    'other-resource'
  )
})

test('one-click diagnostics collects image failures and triggers a bounded CDN probe', () => {
  const bootstrap = readSource('src/renderer/main.ts')
  expect(bootstrap).toContain("import './utils/diagnosticsSnapshotSettings'")
  const preload = readSource('src/preload/index.ts')
  const renderer = readSource('src/renderer/utils/diagnosticsSnapshotSettings.ts')
  const observer = readSource('src/renderer/utils/coverNetworkDiagnostics.ts')
  const main = readSource('src/main/runtimeDiagnostics.ts')
  expect(renderer).toContain('coverImages: getCoverLoadDiagnostics()')
  expect(renderer).toContain("'probe-netease-cover-network'")
  expect(preload).toContain("'probe-netease-cover-network'")
  expect(observer).toContain("target.closest('.cover-container')")
  expect(observer).toContain('missingSourceCount')
  expect(readSource('src/renderer/components/CoverBox.vue')).toContain('recordCoverSource(url)')
  expect(observer).toContain('MAX_RECENT_FAILURES = 12')
  expect(main).toContain('.slice(0, 2)')
  expect(main).toContain('.filter(isNeteaseAssetUrl)')
  expect(main).toContain('COVER_PROBE_TIMEOUT_MS = 3500')
  expect(main).toContain('without_size_param')
  expect(main).toContain('urlShape: describeCoverUrlShape(url)')
  expect(main).toContain('sizeVariantAvailable: Boolean(withoutSize)')
  expect(main).toContain('hasOtherQueryParameters:')
  expect(main).toContain('repeatedQueryKeyCount:')
  expect(main).toContain("without_query_diagnostic")
  expect(main).not.toContain('return { url, status:')
})

test('NetEase cover retries the untransformed resource only for size-only query strings', () => {
  const sized = 'https://p1.music.126.net/example.jpg?param=300y300'
  const candidates = getNeteaseImageCandidateUrls(sized)
  expect(candidates).toContain('https://p1.music.126.net/example.jpg')
  expect(candidates[0]).toBe(sized)

  const authenticated = 'https://p1.music.126.net/example.jpg?param=300y300&token=private'
  expect(getNeteaseImageCandidateUrls(authenticated)).not.toContain(
    'https://p1.music.126.net/example.jpg'
  )
})

test('corrupted artwork query is stripped but ordinary URLs and authentication are preserved', () => {
  const base = 'https://p1.music.126.net/abc/image.jpg'
  const malformed = base + '?param=300y300' + '?param=300y300'.repeat(13)
  expect(normalizeNeteaseAssetUrl(malformed)).toBe(base)
  expect(buildNeteaseImageUrl(malformed)).toBe(base)
  expect(getNeteaseImageCandidateUrls(malformed)[0]).toBe(base)

  const repeated = base + '?param=300y300&x=1&x=2&x=3&x=4&y=1&y=2&y=3&y=4&z=1'
  expect(normalizeNeteaseAssetUrl(repeated)).toBe(base)
  expect(normalizeNeteaseAssetUrl(base + '?param=300y300')).toBe(base + '?param=300y300')
  expect(normalizeNeteaseAssetUrl(base + '?token=private&param=300y300')).toBe(
    base + '?token=private&param=300y300'
  )
  expect(normalizeNeteaseAssetUrl('https://example.com/image.jpg?x=1?x=2?x=3')).toBe(
    'https://example.com/image.jpg?x=1?x=2?x=3'
  )
  expect(normalizeNeteaseAssetUrl('https://p1.music.126.net/audio.mp3?x=1?x=2?x=3')).toBe(
    'https://p1.music.126.net/audio.mp3?x=1?x=2?x=3'
  )
  expect(readSource('src/renderer/components/CoverBox.vue')).toContain(':src="safeImageUrl"')
})
