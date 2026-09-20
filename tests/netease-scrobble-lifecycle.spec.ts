import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('NetEase scrobble lifecycle', () => {
  test('wires player playback into the NetEase scrobble API', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain("getTrackDetail, scrobble } from '../api/track'")
    expect(player).toContain('const scrobbleNetease = async')
    expect(player).toContain('void scrobbleNetease(currentTrack.value, seek.value)')
    expect(player).toContain(
      'void scrobbleNetease(endedTrack, currentTrackDuration.value, true)'
    )
    expect(player).toContain("new CustomEvent('vutronmusic-netease-scrobble'")
    const trackApi = readSource('src/renderer/api/track.ts')
    expect(trackApi).toContain("import { addPendingNeteaseListenSeconds } from '../utils/neteaseListenPending'")
    expect(trackApi).toContain('addPendingNeteaseListenSeconds(listenedSeconds)')
  })

  test('deduplicates natural-end and replacement reporting for one playback session', () => {
    const player = readSource('src/renderer/store/player.ts')
    const handlerIndex = player.indexOf('const scrobbleNetease = async')
    const lockIndex = player.indexOf(
      'neteaseScrobbledForCurrentSession = true',
      handlerIndex
    )
    const requestIndex = player.indexOf('const result = await scrobble({', handlerIndex)
    const endReportIndex = player.indexOf(
      'void scrobbleNetease(endedTrack, currentTrackDuration.value, true)'
    )
    const resetSeekIndex = player.indexOf('seek.value = 0', endReportIndex)

    expect(handlerIndex).toBeGreaterThan(-1)
    expect(player).toContain('if (neteaseScrobbledForCurrentSession) return')
    expect(lockIndex).toBeGreaterThan(handlerIndex)
    expect(requestIndex).toBeGreaterThan(lockIndex)
    expect(endReportIndex).toBeGreaterThan(-1)
    expect(resetSeekIndex).toBeGreaterThan(endReportIndex)
    expect(player).toContain('neteaseScrobbledForCurrentSession = false')
  })

  test('deduplicates concurrent and near-duplicate API writes for the same track', () => {
    const trackApi = readSource('src/renderer/api/track.ts')

    expect(trackApi).toContain('const SCROBBLE_DEDUP_WINDOW_MS = 10_000')
    expect(trackApi).toContain('const scrobbleInFlight = new Map<number, Promise<any>>()')
    expect(trackApi).toContain('const lastSuccessfulScrobbleAt = new Map<number, number>()')
    expect(trackApi).toContain('const existing = scrobbleInFlight.get(trackId)')
    expect(trackApi).toContain('return existing')
    expect(trackApi).toContain('lastSuccessfulScrobbleAt.set(trackId, Date.now())')
    expect(trackApi).toContain('deduplicated: true')
  })

  test('filters accidental short plays before writing NetEase history', () => {
    const trackApi = readSource('src/renderer/api/track.ts')

    expect(trackApi).toContain('const MIN_NETEASE_SCROBBLE_SECONDS = 30')
    expect(trackApi).toContain('const getMinimumScrobbleSeconds =')
    expect(trackApi).toContain(
      'return Math.min(MIN_NETEASE_SCROBBLE_SECONDS, Math.max(1, Math.floor(totalSeconds)))'
    )
    expect(trackApi).toContain('listenedSeconds < minimumSeconds')
    expect(trackApi).toContain("reason: 'short-playback'")
  })

  test('keeps normal scrobble diagnostics development-only but preserves failures', () => {
    const trackApi = readSource('src/renderer/api/track.ts')

    expect(trackApi).toContain('if (import.meta.env.DEV) console.debug(...args)')
    expect(trackApi).toContain(
      "debugScrobble('[Track API] /scrobble 未获得有效 play 确认，回退稳定 NCBL 路由：'"
    )
    expect(trackApi).toContain(
      "console.warn('[Track API] /scrobble-v1 上报失败：'"
    )
  })

  test('validates feedback and sanitizes non-numeric source ids', () => {
    const trackApi = readSource('src/renderer/api/track.ts')
    const insights = readSource('src/renderer/views/MusicInsightsStable.vue')
    const legacyIndex = trackApi.indexOf("url: '/scrobble'")
    const modernIndex = trackApi.indexOf("url: '/scrobble-v1'")

    expect(legacyIndex).toBeGreaterThan(-1)
    expect(modernIndex).toBeGreaterThan(legacyIndex)
    expect(trackApi).toContain('const playResult = result?.details?.play')
    expect(trackApi).toContain('return Boolean(playResult) && isSuccessfulResponse(playResult)')
    expect(trackApi).toContain('const normalizeScrobbleSourceId =')
    expect(trackApi).toContain('const numericSourceId = Number(sourceid)')
    expect(trackApi).toContain('return trackId')
    expect(trackApi).toContain(
      'const sourceid = normalizeScrobbleSourceId(params.sourceid, params.id)'
    )
    expect(trackApi).toContain('originalSourceid: params.sourceid')
    expect(insights).toContain(
      "window.addEventListener('vutronmusic-netease-scrobble', handleNeteaseScrobble)"
    )
    expect(insights).toContain('}, 1800)')
  })

  test('uses an app-owned stable route and bundled fallback for scrobble v1', () => {
    const trackApi = readSource('src/renderer/api/track.ts')
    const neteaseServer = readSource('src/main/appServer/netease.ts')
    const bundledScrobble = readSource('src/main/appServer/vendor/scrobbleV1.js')
    const bundledNcbl = readSource('src/main/appServer/vendor/ncbl.js')

    expect(trackApi).toContain("url: '/scrobble-v1'")
    expect(neteaseServer).toContain("import bundledScrobbleV1Api from './vendor/scrobbleV1'")
    expect(neteaseServer).toContain(
      "require('@neteasecloudmusicapienhanced/api/module/scrobble_v1')"
    )
    expect(neteaseServer).toContain("let stableScrobbleV1Source = 'bundled'")
    expect(neteaseServer).toContain(
      "const stableScrobbleV1Url = '/netease/scrobble-v1'"
    )
    expect(neteaseServer).toContain("appServerRevision: 'scrobble-v1-route-v3'")
    expect(bundledScrobble).toContain("action: '_plv'")
    expect(bundledScrobble).toContain("action: '_pld'")
    expect(bundledScrobble).toContain("from './ncbl'")
    expect(bundledScrobble).toContain('export default scrobbleV1')
    expect(bundledNcbl).toContain("import * as crypto from 'node:crypto'")
    expect(bundledNcbl).toContain('/api/clientlog/encrypt/upload?multiupload=true')
    expect(bundledNcbl).toContain('const encryptNCBL =')
    expect(bundledNcbl).toContain('export {')
  })

  test('does not report non-NetEase stream tracks or unmatched local files', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain(
      "if (track.type === 'stream' || (track.type === 'local' && !track.matched)) return"
    )
    expect(player).toContain("sourceType !== 'personalfm'")
    expect(player).toContain("!sourceType.includes('local')")
  })
})
