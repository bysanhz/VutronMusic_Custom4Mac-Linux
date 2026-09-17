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

  test('validates feedback and sanitizes non-numeric source ids', () => {
    const trackApi = readSource('src/renderer/api/track.ts')
    const insights = readSource('src/renderer/views/MusicInsightsStable.vue')
    const legacyIndex = trackApi.indexOf("url: '/scrobble'")
    const modernIndex = trackApi.indexOf("url: '/scrobble/v1'")

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

  test('guarantees the local app-server alias for scrobble v1', () => {
    const neteaseServer = readSource('src/main/appServer/netease.ts')

    expect(neteaseServer).toContain('const scrobbleV1Api = NeteaseCloudMusicApi.scrobble_v1')
    expect(neteaseServer).toContain("const scrobbleV1Url = '/netease/scrobble/v1'")
    expect(neteaseServer).toContain("fastify.hasRoute({ method: 'GET', url: scrobbleV1Url })")
    expect(neteaseServer).toContain("fastify.hasRoute({ method: 'POST', url: scrobbleV1Url })")
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
