import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('player track-state race guards', () => {
  test('invalidates stale asynchronous track work before committing UI state', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain('let trackLoadRevision = 0')
    expect(player).toContain('const revision = ++trackLoadRevision')
    expect(player).toContain('const isTrackLoadCurrent =')
    expect(player).toContain('await getLyric(track, revision)')
    expect(player).toContain('await updateMediaSessionMetaData(track, revision)')
    expect(player).toContain('if (revision !== trackLoadRevision) return false')
  })

  test('clears previous track-scoped state when a new track becomes current', () => {
    const player = readSource('src/renderer/store/player.ts')
    const replaceCurrentTrack = player.slice(
      player.indexOf('const replaceCurrentTrack = async'),
      player.indexOf('// const _scrobble')
    )

    expect(replaceCurrentTrack).toContain('lyrics.value = []')
    expect(replaceCurrentTrack).toContain('currentIndex.value = -1')
    expect(replaceCurrentTrack).toContain('chorusStartTime.value = 0')
    expect(replaceCurrentTrack).toContain('chorus.value = 0')
    expect(replaceCurrentTrack).toContain(
      "pic.value = new URL('../assets/images/default.jpg', import.meta.url).href"
    )
  })

  test('does not let an older fade operation replace the audio source', () => {
    const player = readSource('src/renderer/store/player.ts')
    const playAudioSource = player.slice(
      player.indexOf('const playAudioSource = async'),
      player.indexOf('const getLocalMusic =')
    )

    expect(playAudioSource).toContain('revision = trackLoadRevision')
    expect(playAudioSource).toContain('await smoothGain(0, fade)')
    expect(playAudioSource.match(/revision !== trackLoadRevision/g)?.length).toBeGreaterThanOrEqual(
      2
    )
    expect(playAudioSource.indexOf('await smoothGain(0, fade)')).toBeLessThan(
      playAudioSource.lastIndexOf('revision !== trackLoadRevision')
    )
  })

  test('keeps a transient track lookup failure from corrupting playlist navigation', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain('let trackLookupFailureRevision = -1')
    expect(player).toContain('for (let attempt = 0; attempt < 2; attempt += 1)')
    expect(player).toContain('if (response.status === 404) return undefined')
    expect(player).toContain("showToast(t('toast.trackInfoFailed'))")
    const messages = JSON.parse(readSource('src/renderer/locales/zh-hans.json'))
    expect(messages.toast.trackInfoFailed).toBe('歌曲信息获取失败，未跳过当前歌曲，请稍后重试')
    expect(player).toContain('trackLookupFailureRevision === trackLoadRevision')
  })

  test('returns explicit HTTP failures from the atom track protocol', () => {
    const main = readSource('src/main/index.ts')

    expect(main).toContain("log.warn('[Player] 歌曲信息不存在', ids)")
    expect(main).toContain("JSON.stringify({ code: 404, message: 'Track not found' })")
    expect(main).toContain('JSON.stringify({ code: 503, retryable: true, message })')
  })

  test('adds system trusted CAs without disabling TLS validation', () => {
    const netease = readSource('src/main/appServer/netease.ts')

    expect(netease).toContain("getCACertificates('system')")
    expect(netease).toContain('https.globalAgent.options.ca =')
    expect(netease).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED')
    expect(netease).not.toContain('rejectUnauthorized: false')
  })

  test('detects stalled media, retries once, and preserves playback position', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain('const PLAYBACK_STALL_TIMEOUT_MS = 12_000')
    expect(player).toContain("addEventListener('stalled', _handleMediaStalled)")
    expect(player).toContain("addEventListener('error', _handleMediaError)")
    expect(player).toContain('const recoverStalledPlayback = async')
    expect(player).toContain('replaceCurrentTrack(track.id, true, resumePosition)')
    expect(player).toContain('resumePositionOverride: number | null = null')
    expect(player).toContain('startPlaybackHealthWatchdog()')
    expect(player).toContain('stopPlaybackHealthWatchdog()')
  })

  test('refreshes cached online URLs and aborts abandoned proxy streams', () => {
    const main = readSource('src/main/index.ts')

    expect(main).toContain("if (track.type !== 'local' && !track.cache)")
    expect(main).toContain('await getAudioSource(track)')
    expect(main).toContain('proxyFetch(url, { headers, signal: request.signal })')
    expect(main).toContain("statusText: 'Client Closed Request'")
  })

  test('includes media health in diagnostics snapshots', () => {
    const diagnostics = readSource('src/renderer/utils/diagnosticsSnapshotSettings.ts')

    expect(diagnostics).toContain('media: player.media || null')
  })

  test('keeps heart-mode selection in bounds and ignores stale responses', () => {
    const playlist = readSource('src/renderer/views/PlaylistPage.vue')

    expect(playlist).toContain('let intelligenceRequestID = 0')
    expect(playlist).toContain(
      'const randomIndex = Math.floor(Math.random() * tracks.value.length)'
    )
    expect(playlist).not.toContain('Math.floor(Math.random() * tracks.value.length + 1)')
    expect(playlist).toContain('const requestID = ++intelligenceRequestID')
    expect(playlist).toContain('if (requestID !== intelligenceRequestID) return')
    expect(playlist).toContain('if (!trackIDs.length)')
  })
})
