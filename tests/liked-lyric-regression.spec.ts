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

  test('keeps OSD word timing event-driven instead of progress-driven', () => {
    const player = readSource('src/renderer/store/player.ts')
    const container = readSource('src/renderer/components/OsdLyricContainer.vue')

    expect(player).toContain('watch(currentIndex, (value) => {')
    expect(player).not.toContain('() => [currentIndex.value, progress.value]')
    expect(player).toContain('line: [currentIndex.value, value]')
    expect(player).toContain('seek: value')
    expect(container).toContain('if (isShowingNextGroup.value && i === 0)')
    expect(container).toContain("instance?.updatePlayStatus('reset')")
  })

  test('does not render a new track with the previous track played state', () => {
    const player = readSource('src/renderer/store/player.ts')
    const container = readSource('src/renderer/components/OsdLyricContainer.vue')
    const guard = readSource('src/renderer/utils/osdLyricSyncGuard.ts')

    expect(player).toContain('line: [currentIndex.value, currentTime]')
    expect(player).toContain('seek: currentTime')
    expect(container).toContain('currentIndex.value = -1')
    expect(guard).toContain('let hasAnchorForCurrentLyrics = false')
    expect(guard).toContain('!hasAnchorForCurrentLyrics')
    expect(guard).toContain('hasAnchorForCurrentLyrics = false')
    expect(guard).toContain('hasAnchorForCurrentLyrics = true')
  })

  test('keeps two-line lifecycle while rejecting late same-line timing rewinds', () => {
    const container = readSource('src/renderer/components/OsdLyricContainer.vue')
    const line = readSource('src/renderer/components/LyricLine.vue')

    expect(container).toContain(':key="index"')
    expect(container).toContain('watch(lyricToShow, async () => {')
    expect(container).toContain('clearAnimations()')
    expect(container).toContain('const lineChanged = lineIndex !== currentIndex.value')
    expect(container).toContain('const isExplicitSeek = data.seek !== undefined && data.syncGuard !== true')
    expect(container).toContain('if (lineChanged || isExplicitSeek || !playing.value)')
    expect(line).not.toContain('const isLinux = Boolean(window.env?.isLinux)')
    expect(line).not.toContain('liveTime <= 1200')
    expect(line).not.toContain('needsWordAnimation')
  })

  test('keeps an independent OSD clock without fighting word-by-word WAAPI timing', () => {
    const osdEntry = readSource('src/renderer/osdLyric.ts')
    const guard = readSource('src/renderer/utils/osdLyricSyncGuard.ts')
    const container = readSource('src/renderer/components/OsdLyricContainer.vue')
    const player = readSource('src/renderer/store/player.ts')

    expect(osdEntry).toContain(
      "import { initializeOsdLyricSyncGuard } from './utils/osdLyricSyncGuard'"
    )
    expect(osdEntry).toContain('initializeOsdLyricSyncGuard()')
    expect(guard).toContain(
      "window.mainApi?.sendMessage({ type: 'get-seek', source: 'osd-sync-guard' })"
    )
    expect(guard).toContain('if (line === lastKnownLine) return')
    expect(guard).toContain('lastKnownLine = Number(data.line[0])')
    expect(guard).toContain("type: 'update-osd-status'")
    expect(guard).toContain('LOCAL_TICK_MS = 250')
    expect(player).toContain("syncGuard: event.data.source === 'osd-sync-guard'")
    expect(container).toContain('if (data.seek !== undefined && data.syncGuard !== true)')
  })
})
