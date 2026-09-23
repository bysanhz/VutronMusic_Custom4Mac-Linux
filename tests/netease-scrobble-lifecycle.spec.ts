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
    expect(player).toContain('const syncCurrentNeteaseListenCheckpoint = async')
    expect(player).toContain('void scrobbleNetease(currentTrack.value, seek.value)')
    expect(player).toContain(
      'void scrobbleNetease(endedTrack, currentTrackDuration.value, true)'
    )
    expect(player).toContain("new CustomEvent('vutronmusic-netease-scrobble'")
    expect(player).toContain("from '../utils/neteaseListenPending'")
    expect(player).toContain('addPendingNeteaseListenSeconds(delta)')
    expect(player).toContain('neteaseSessionListenedSeconds += delta')
    expect(player).toContain('markSubmittedNeteaseListenSeconds(listenedSeconds)')
    expect(player).toContain('flushPendingNeteaseListenSeconds()')
    const trackApi = readSource('src/renderer/api/track.ts')
    expect(trackApi).not.toContain('addPendingNeteaseListenSeconds(listenedSeconds)')
  })

  test('counts real playback progress continuously without counting seeks twice', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain('const delta = currentTime - lastUpdateTime')
    expect(player).toContain('delta > 0')
    expect(player).toContain('delta <= maxExpectedDelta')
    expect(player).toContain('shouldTrackNeteaseListenTime(currentTrack.value)')
    expect(player).toContain('lastUpdateTime = value')
  })

  test('serializes duration-aware scrobbles across rapid track changes', () => {
    const player = readSource('src/renderer/store/player.ts')
    const trackApi = readSource('src/renderer/api/track.ts')

    expect(player).toContain('let neteaseScrobbleQueue: Promise<void> = Promise.resolve()')
    expect(player).toContain('const NETEASE_SCROBBLE_QUEUE_GAP_MS = 350')
    expect(player).toContain('const queued = neteaseScrobbleQueue.then(operation, operation)')
    expect(player).toContain('neteaseScrobbleQueue = queued.catch(() => {})')
    expect(player).toContain('const sourceid = resolveNeteaseScrobbleSourceID(track)')
    expect(player).toContain('const source = playlistSource.value.type')
    expect(player).toContain('result?.skipped || result?.deduplicated')
    expect(trackApi.indexOf("url: '/scrobble-v1'")).toBeLessThan(
      trackApi.indexOf("url: '/scrobble'")
    )
  })

  test('deduplicates natural-end and replacement reporting by reserving submitted session deltas', () => {
    const player = readSource('src/renderer/store/player.ts')
    const handlerIndex = player.indexOf('const scrobbleNetease = async')
    const reservationIndex = player.indexOf(
      'neteaseSessionSubmittedSeconds = submittedAfter',
      handlerIndex
    )
    const requestIndex = player.indexOf('const result = await scrobble({', handlerIndex)
    const endReportIndex = player.indexOf(
      'void scrobbleNetease(endedTrack, currentTrackDuration.value, true)'
    )
    const resetSeekIndex = player.indexOf('seek.value = 0', endReportIndex)

    expect(handlerIndex).toBeGreaterThan(-1)
    expect(player).toContain(
      'sessionListenedSeconds - neteaseSessionSubmittedSeconds'
    )
    expect(reservationIndex).toBeGreaterThan(handlerIndex)
    expect(requestIndex).toBeGreaterThan(reservationIndex)
    expect(endReportIndex).toBeGreaterThan(-1)
    expect(resetSeekIndex).toBeGreaterThan(endReportIndex)
    expect(player).toContain('neteaseSessionSubmittedSeconds = 0')
    expect(player).toContain('neteaseSessionRevision += 1')
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
    expect(trackApi).toContain('!params.allowShort && listenedSeconds < minimumSeconds')
    expect(trackApi).toContain("reason: 'short-playback'")
    expect(trackApi).toContain('!params.allowRepeat && Date.now() - lastSuccessAt < SCROBBLE_DEDUP_WINDOW_MS')
    expect(trackApi).toContain('result?.durationAware === true')
  })

  test('supports manual refresh checkpoints without double counting later track changes', () => {
    const player = readSource('src/renderer/store/player.ts')
    const insights = readSource('src/renderer/views/MusicInsightsStable.vue')
    const trackApi = readSource('src/renderer/api/track.ts')

    expect(player).toContain('const MIN_NETEASE_CHECKPOINT_SECONDS = 30')
    expect(player).toContain('const syncCurrentNeteaseListenCheckpoint = async')
    expect(player).toContain('checkpoint = false')
    expect(player).toContain('const hasPreviousSubmission = neteaseSessionSubmittedSeconds > 0')
    expect(player).toContain('time: listenedSeconds')
    expect(player).toContain('allowShort: hasPreviousSubmission || completed')
    expect(player).toContain('allowRepeat: hasPreviousSubmission')
    expect(insights).toContain('await playerStore.syncCurrentNeteaseListenCheckpoint()')
    expect(insights.indexOf('await playerStore.syncCurrentNeteaseListenCheckpoint()')).toBeLessThan(
      insights.indexOf('await loadFootprint()', insights.indexOf('const refreshFootprintWithConfirmation'))
    )
    expect(trackApi).toContain('allowShort?: boolean')
    expect(trackApi).toContain('allowRepeat?: boolean')
    expect(trackApi).toContain('durationAware: true')
    expect(trackApi).toContain('durationAware: false')
    expect(player).toContain('const durationAware = result?.durationAware === true')
  })

  test('tracks submitted listen time separately until NetEase confirms it', () => {
    const pending = readSource('src/renderer/utils/neteaseListenPending.ts')
    const insights = readSource('src/renderer/views/MusicInsightsStable.vue')

    expect(pending).toContain('export const submittedNeteaseListenSeconds = ref(state.submittedSeconds)')
    expect(pending).toContain('export const markSubmittedNeteaseListenSeconds =')
    expect(pending).toContain('submittedNeteaseListenSeconds.value + value')
    expect(pending).toContain('const confirmableSeconds =')
    expect(insights).toContain('const pendingUnsubmittedSeconds = computed')
    expect(insights).toContain("t('insights.footprint.pendingSubmitted'")
    expect(insights).toContain("t('insights.footprint.pendingMixed'")
  })

  test('keeps normal scrobble diagnostics development-only but preserves failures', () => {
    const trackApi = readSource('src/renderer/api/track.ts')

    expect(trackApi).toContain('if (import.meta.env.DEV) console.debug(...args)')
    expect(trackApi).toContain(
      "debugScrobble('[Track API] /scrobble-v1 未成功，回退 legacy /scrobble：'"
    )
    expect(trackApi).toContain(
      "console.warn('[Track API] 网易云听歌上报失败：'"
    )
  })

  test('validates feedback and sanitizes non-numeric source ids', () => {
    const trackApi = readSource('src/renderer/api/track.ts')
    const insights = readSource('src/renderer/views/MusicInsightsStable.vue')
    const legacyIndex = trackApi.indexOf("url: '/scrobble'")
    const modernIndex = trackApi.indexOf("url: '/scrobble-v1'")

    expect(modernIndex).toBeGreaterThan(-1)
    expect(legacyIndex).toBeGreaterThan(modernIndex)
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
    expect(insights).toContain('const PENDING_SYNC_INTERVAL_MS = 10_000')
    expect(insights).toContain('void refreshPendingRemoteDuration()')
    expect(insights).toContain('}, 1200)')
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
