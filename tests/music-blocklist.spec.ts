import { expect, test } from '@playwright/test'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getArtistBlockKey,
  getSongBlockKey,
  useMusicBlocklistStore
} from '../src/renderer/store/musicBlocklist'

const readSource = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

test.beforeEach(() => {
  setActivePinia(createPinia())
})

test('blocked songs are persistent keys scoped to their music service', () => {
  const blocklist = useMusicBlocklistStore()
  const netease = { id: 42, name: 'Test song', type: 'online' }
  const local = { id: 42, name: 'Test song', type: 'local' }
  const stream = { id: 42, name: 'Test song', type: 'stream', source: 'navidrome' }

  expect(getSongBlockKey(netease)).toBe('netease:song:42')
  expect(getSongBlockKey(local)).toBe('local:song:42')
  expect(getSongBlockKey(stream)).toBe('stream:navidrome:song:42')
  expect(blocklist.blockSong(netease)).toBe(true)
  expect(blocklist.blockSong(netease)).toBe(false)
  expect(blocklist.isTrackBlocked(netease)).toBe(true)
  expect(blocklist.isTrackBlocked(local)).toBe(false)
  expect(blocklist.isTrackBlocked(stream)).toBe(false)
  expect(blocklist.isNeteaseCandidateBlocked(42)).toBe(true)

  blocklist.unblockSong('netease:song:42')
  expect(blocklist.isTrackBlocked(netease)).toBe(false)
  expect(blocklist.blockedSongs).toHaveLength(0)
})

test('blocking any collaborator excludes the track without conflating same-name artist IDs', () => {
  const blocklist = useMusicBlocklistStore()
  const collaboration = {
    id: 101,
    name: 'Collaboration',
    type: 'online',
    ar: [{ id: 501, name: 'Same name' }, { id: 502, name: 'Second artist' }]
  }
  const namesake = {
    id: 102,
    name: 'Another singer',
    type: 'online',
    artists: [{ id: 503, name: 'Same name' }]
  }

  expect(blocklist.blockArtist(collaboration.ar[0], collaboration)).toBe(true)
  expect(blocklist.isTrackBlocked(collaboration)).toBe(true)
  expect(blocklist.isTrackBlocked(namesake)).toBe(false)
  expect(blocklist.isNeteaseCandidateBlocked(999, [777, 501])).toBe(true)
  expect(blocklist.isNeteaseCandidateBlocked(999, [503])).toBe(false)

  const key = getArtistBlockKey(collaboration.ar[0], collaboration)
  expect(key).toBe('netease:artist:501')
  blocklist.unblockArtist(key!)
  expect(blocklist.isTrackBlocked(collaboration)).toBe(false)
})

test('artists without service IDs match names only inside the same source', () => {
  const blocklist = useMusicBlocklistStore()
  const local = {
    id: 201,
    name: 'Local song',
    type: 'local',
    artists: [{ id: 0, name: 'Example Artist' }]
  }
  const otherLocal = {
    id: 202,
    name: 'Another local song',
    type: 'local',
    artists: [{ id: 0, name: ' example  artist ' }]
  }
  const online = {
    id: 203,
    name: 'Remote song',
    type: 'online',
    artists: [{ id: 0, name: 'Example Artist' }]
  }

  expect(blocklist.blockArtist(local.artists[0], local)).toBe(true)
  expect(blocklist.isTrackBlocked(otherLocal)).toBe(true)
  expect(blocklist.isTrackBlocked(online)).toBe(false)
})

test('heart-mode UI, recommendation paths, playback guard and settings backup are wired', () => {
  const assistant = readSource('src/renderer/components/HeartModeAssistant.vue')
  const main = readSource('src/renderer/main.ts')
  const player = readSource('src/renderer/store/player.ts')
  const backup = readSource('src/renderer/utils/settingsBackupSettings.ts')
  const blocklist = readSource('src/renderer/store/musicBlocklist.ts')

  expect(assistant).toContain("panelPage === 'blocklist'")
  expect(assistant).toContain('toggleCurrentSong')
  expect(assistant).toContain('toggleCurrentArtist')
  expect(assistant).toContain('removeBlockedArtist(item.key)')
  expect(main).toContain('selectAvailableHeartModeSeedIDs')
  expect(main).toContain('playableHeartModeTrackIDs')
  expect(main).toContain('playablePendingTrackIDs')
  expect(main).toContain("await playerStore.replacePlaylist('intelligence', playlistID, playableTrackIDs, 0)")
  expect(player).toContain('if (musicBlocklistStore.isTrackBlocked(track))')
  expect(player).toContain('musicBlocklistStore.isTrackBlocked(currentTrack.value)')
  expect(backup).toContain("'musicBlocklist'")
  expect(blocklist).toContain("pick: ['blockedSongs', 'blockedArtists']")
})
