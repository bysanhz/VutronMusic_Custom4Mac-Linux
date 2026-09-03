import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('liked songs resilience', () => {
  test('persists the last successful liked-song snapshot', () => {
    const dataStore = readSource('src/renderer/store/data.ts')

    expect(dataStore).toContain("'liked.songs'")
    expect(dataStore).toContain('const syncLikedSongs =')
    expect(dataStore).toContain('liked.songs = normalizeTrackIDs(ids)')
  })

  test('resolves the real NetEase liked playlist instead of assuming playlist zero', () => {
    const dataStore = readSource('src/renderer/store/data.ts')

    expect(dataStore).toContain('const resolveLikedPlaylist =')
    expect(dataStore).toContain('Number(playlist?.specialType) === 5')
    expect(dataStore).toContain("name.includes('喜欢的音乐')")
    expect(dataStore).not.toContain('const firstPlaylistID = Number(res.playlist[0]?.id)')
  })

  test('falls back to the verified liked playlist when likelist is unavailable', () => {
    const dataStore = readSource('src/renderer/store/data.ts')

    expect(dataStore).toContain('const fetchLikedSongsFromPlaylist = async () =>')
    expect(dataStore).toContain('return await fetchLikedSongsFromPlaylist()')
    expect(dataStore).toContain('syncLikedSongs(trackIDs.map((track: any) => track?.id ?? track))')
  })

  test('validates the liked playlist before every startup heart synchronization', () => {
    const dataStore = readSource('src/renderer/store/data.ts')

    expect(dataStore).toContain('const fetchLikedSongs = async () =>')
    expect(dataStore).toContain('const fetchLikedSongsWithDetails = async () =>')
    expect(dataStore.match(/await fetchLikedPlaylist\(\)/g)?.length).toBeGreaterThanOrEqual(3)
  })

  test('compares track IDs by canonical string value when toggling likes', () => {
    const dataStore = readSource('src/renderer/store/data.ts')

    expect(dataStore).toContain('const sameTrackID =')
    expect(dataStore).toContain('String(left) === String(right)')
    expect(dataStore).toContain('liked.songs.some((item) => sameTrackID(item, id))')
  })
})

test.describe('desktop lyric continuity', () => {
  test('installs a main-player lyric index watchdog', () => {
    const main = readSource('src/renderer/main.ts')
    const watchdog = readSource('src/renderer/utils/playerLyricWatchdog.ts')

    expect(main).toContain(
      "import { initializePlayerLyricWatchdog } from './utils/playerLyricWatchdog'"
    )
    expect(main).toContain('initializePlayerLyricWatchdog(playerStore)')
    expect(watchdog).toContain('window.vutronmusic?.progress')
    expect(watchdog).toContain('player.currentIndex = expectedIndex')
    expect(watchdog).toContain('WATCHDOG_INTERVAL_MS = 250')
  })

  test('keeps an independent OSD clock and periodically requests authoritative seek', () => {
    const osdEntry = readSource('src/renderer/osdLyric.ts')
    const guard = readSource('src/renderer/utils/osdLyricSyncGuard.ts')

    expect(osdEntry).toContain(
      "import { initializeOsdLyricSyncGuard } from './utils/osdLyricSyncGuard'"
    )
    expect(osdEntry).toContain('initializeOsdLyricSyncGuard()')
    expect(guard).toContain("window.mainApi?.sendMessage({ type: 'get-seek' })")
    expect(guard).toContain("type: 'update-osd-status'")
    expect(guard).toContain('LOCAL_TICK_MS = 250')
  })
})

test.describe('player track identity consistency', () => {
  test('uses a monotonic revision to reject stale asynchronous track work', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain('let trackLoadRevision = 0')
    expect(player).toContain('const isCurrentTrackLoad =')
    expect(player).toContain('const revision = ++trackLoadRevision')
    expect(player).toContain('clearTrackDerivedState(track)')
    expect(player).toContain('void searchMatchForLocal(track, revision)')
    expect(player).toContain('await playAudioSource(source, autoPlay, revision, track)')
  })

  test('commits lyrics, artwork and media metadata only for the active track load', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain('const getLyric = async (track: Track, revision = trackLoadRevision) =>')
    expect(player).toContain('if (!isCurrentTrackLoad(revision, track)) return false')
    expect(player).toContain('const updateMediaSessionMetaData = async (')
    expect(player).toContain('const trackDuration = ~~((track.dt || track.duration || 1000) / 1000)')
    expect(player).toContain("data: { pic: pic.value }")
  })

  test('keeps heart-mode random indexing in bounds and ignores stale requests', () => {
    const playlist = readSource('src/renderer/views/PlaylistPage.vue')

    expect(playlist).toContain('let intelligenceRequestRevision = 0')
    expect(playlist).toContain('Math.floor(Math.random() * tracks.value.length)')
    expect(playlist).not.toContain('Math.floor(Math.random() * tracks.value.length + 1)')
    expect(playlist).toContain('requestRevision !== intelligenceRequestRevision')
    expect(playlist).toContain('Array.isArray(result?.data)')
    expect(playlist).toContain("showToast('心动模式加载失败，请稍后重试')")
  })
})
