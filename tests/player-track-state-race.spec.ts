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
