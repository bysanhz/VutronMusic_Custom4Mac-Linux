import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('cross-device recent plays belongs to listening insights, not user profile', () => {
  const view = readSource('src/renderer/views/MusicInsightsStable.vue')
  expect(view).toContain("selectFootprintRankMode('recent')")
  expect(view).toContain("footprintRankMode === 'week'")
  expect(view).toContain("footprintRankMode === 'all'")
  expect(view).toContain("recentSongs(100)")
  expect(view).toContain("accountId.value === 'anonymous'")
  expect(view).toContain('requestId !== recentRequestId')
  expect(view).toContain('recentTracks.value = []')
  expect(readSource('src/renderer/views/UserPage.vue')).not.toContain('crossDeviceRecent')
  expect(readSource('src/renderer/components/NavBar.vue')).not.toContain('openMyProfile')
  expect(view).toContain("item?.data || item?.song || item")
})

test('cross-device recent play labels exist in all supported languages', () => {
  for (const language of ['zh-hans', 'zh-hant', 'en']) {
    const locale = JSON.parse(readSource(`src/renderer/locales/${language}.json`))
    expect(locale.userPage.crossDeviceRecent).toBeTruthy()
    expect(locale.userPage.recentLoading).toBeTruthy()
    expect(locale.userPage.recentError).toBeTruthy()
    expect(locale.userPage.recentEmpty).toBeTruthy()
  }
})
