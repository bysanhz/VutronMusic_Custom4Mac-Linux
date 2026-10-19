import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('cross-device recent plays reuses user history and never replaces week/all rankings', () => {
  const view = readSource('src/renderer/views/UserPage.vue')
  expect(view).toContain("selectPlayHistoryMode('recent')")
  expect(view).toContain("playHistoryMode === 'week'")
  expect(view).toContain("playHistoryMode === 'all'")
  expect(view).toContain("recentSongs(100)")
  expect(view).toContain('v-if="isOwnProfile"')
  expect(view).toContain('requestId !== recentRequestId')
  expect(view).toContain('recentTracks.value = []')
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
