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

  test('keeps the modern-to-legacy API fallback and refresh event consumer connected', () => {
    const trackApi = readSource('src/renderer/api/track.ts')
    const insights = readSource('src/renderer/views/MusicInsightsStable.vue')

    expect(trackApi).toContain("url: '/scrobble/v1'")
    expect(trackApi).toContain("url: '/scrobble'")
    expect(insights).toContain(
      "window.addEventListener('vutronmusic-netease-scrobble', handleNeteaseScrobble)"
    )
    expect(insights).toContain('}, 1800)')
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
