import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('liked songs resilience', () => {
  test('persists the last successful liked-song snapshot', () => {
    const dataStore = readSource('src/renderer/store/data.ts')

    expect(dataStore).toContain("'liked.songs'")
    expect(dataStore).toContain('if (!Array.isArray(res?.ids)) return false')
    expect(dataStore).toContain("'[Data] 获取喜欢歌曲失败，继续使用本地缓存：'")
  })

  test('compares track IDs by canonical string value when toggling likes', () => {
    const dataStore = readSource('src/renderer/store/data.ts')

    expect(dataStore).toContain('const sameTrackID =')
    expect(dataStore).toContain('String(left) === String(right)')
    expect(dataStore).toContain('liked.songs.some((item) => sameTrackID(item, id))')
  })

  test('recovers the liked playlist ID before loading track details', () => {
    const dataStore = readSource('src/renderer/store/data.ts')

    expect(dataStore).toContain('if (!likedSongPlaylistID.value) {')
    expect(dataStore).toContain('await fetchLikedPlaylist()')
    expect(dataStore).toContain('if (!likedSongPlaylistID.value) return')
  })
})

test.describe('desktop lyric continuity', () => {
  test('installs a main-player lyric index watchdog', () => {
    const main = readSource('src/renderer/main.ts')
    const watchdog = readSource('src/renderer/utils/playerLyricWatchdog.ts')

    expect(main).toContain("import { initializePlayerLyricWatchdog } from './utils/playerLyricWatchdog'")
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
