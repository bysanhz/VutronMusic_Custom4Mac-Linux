import { expect, test } from '@playwright/test'
import { describeCoverImageSource, getCoverLoadDiagnostics } from '../src/renderer/utils/coverNetworkDiagnostics'
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
  expect(main).not.toContain('return { url, status:')
})
