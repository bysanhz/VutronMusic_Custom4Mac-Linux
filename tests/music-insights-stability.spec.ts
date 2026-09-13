import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('music insights rendering stability', () => {
  test('keeps the insights page out of virtual-scroll lifecycle churn', () => {
    const router = readSource('src/renderer/router/index.ts')
    const view = readSource('src/renderer/views/MusicInsightsStable.vue')

    expect(router).toContain("import('../views/MusicInsightsStable.vue')")
    expect(view).toContain("import InsightsTrackList from '../components/InsightsTrackList.vue'")
    expect(view).toContain(
      "import InsightsResourceGrid from '../components/InsightsResourceGrid.vue'"
    )
    expect(view).not.toContain('VirtualTrackList')
    expect(view).not.toContain('VirtualCoverRow')
    expect(view).not.toContain('clearStyleResources')
  })

  test('does not empty style results before the replacement request resolves', () => {
    const view = readSource('src/renderer/views/MusicInsightsStable.vue')

    expect(view).toContain('const revision = ++styleRequestRevision')
    expect(view).toContain('applyStyleResult(result, reset)')
    expect(view).toContain('revision !== styleRequestRevision')
    expect(view).not.toContain('styleTracks.value = []')
    expect(view).not.toContain('styleAlbums.value = []')
    expect(view).not.toContain('styleArtists.value = []')
    expect(view).not.toContain('stylePlaylists.value = []')
  })

  test('uses display toggles instead of repeatedly mounting result components', () => {
    const view = readSource('src/renderer/views/MusicInsightsStable.vue')

    expect(view).toContain('v-show="styleResourceType === \'song\'"')
    expect(view).toContain('v-show="styleResourceType === \'album\'"')
    expect(view).toContain('v-show="styleResourceType === \'artist\'"')
    expect(view).toContain('v-show="styleResourceType === \'playlist\'"')
  })
})
