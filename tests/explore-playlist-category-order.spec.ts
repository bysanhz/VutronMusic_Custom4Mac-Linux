import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { orderEnabledPlaylistCategories, playlistCategories } from '../src/renderer/utils/common'

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

test('default Explore categories show Recommended, Featured, All first', () => {
  const enabled = playlistCategories.filter((category) => category.enable).map((category) => category.name)
  expect(enabled.slice(0, 3)).toEqual(['推荐歌单', '精品歌单', '全部'])
  expect(orderEnabledPlaylistCategories(enabled)).toEqual(enabled)
})

test('previously saved category orders are corrected without deleting or reordering other categories', () => {
  const oldPreference = ['全部', '推荐歌单', '精品歌单', '官方', '欧美', '治愈']
  const snapshot = [...oldPreference]
  expect(orderEnabledPlaylistCategories(oldPreference)).toEqual([
    '推荐歌单', '精品歌单', '全部', '官方', '欧美', '治愈'
  ])
  expect(oldPreference).toEqual(snapshot)

  expect(orderEnabledPlaylistCategories(['全部', 'ACG', '欧美'])).toEqual(['全部', 'ACG', '欧美'])
  expect(orderEnabledPlaylistCategories(['精品歌单', 'ACG', '推荐歌单'])).toEqual([
    '推荐歌单', '精品歌单', 'ACG'
  ])
})

test('Explore renders the ordered list and leaves routing and category toggles untouched', () => {
  const view = source('src/renderer/views/ExplorePage.vue')
  expect(view).toContain('v-for="category in displayedPlaylistCategories"')
  expect(view).toContain('orderEnabledPlaylistCategories(general.value.enabledPlaylistCategories)')
  expect(view).toContain("goToCategory('playlist', category)")
  expect(view).toContain('togglePlaylistCategory(cat.name)')
  expect(view).toContain('category === activeCategory')
})

test('reordered buttons retain rainbow hue progression, hover and active state in light and dark themes', () => {
  const css = source('src/renderer/assets/css/rainbow-theme.scss')
  for (let index = 1; index <= 3; index++) {
    expect(css).toContain(
      `.rainbow-explore-filter > .button:nth-child(7n + ${index}) { --rainbow-item-color: var(--rainbow-${index}); }`
    )
  }
  expect(css).toContain('.explore-page .rainbow-explore-filter > .button:hover')
  expect(css).toContain('.explore-page .rainbow-explore-filter > .button.active')
  expect(css).toContain("body[data-theme='dark'] #app .explore-page .rainbow-explore-filter > .button")
  expect(css).toContain('--rainbow-dark-pill-hue: var(--rainbow-item-color)')
})

test('sidebar Explore and top playlist navigation both open Recommended by default', () => {
  const sidebar = source('src/renderer/components/SideNav.vue')
  const navbar = source('src/renderer/components/NavBar.vue')
  const page = source('src/renderer/views/ExplorePage.vue')

  expect(sidebar).toContain('@click="openExplore"')
  expect(sidebar).toContain("query: { tab: 'playlist', category: '推荐歌单' }")
  expect(navbar).toContain("@click=\"toExplore('playlist')\"")
  expect(navbar).toContain("const cat = category === 'playlist'")
  expect(navbar).toContain("? '推荐歌单'")
  expect(page).toContain("const activeCategory = ref('推荐歌单')")
  expect(page).toContain("const saveCategory = ref('推荐歌单')")
  expect(page).toContain("exploreTab.value = tab || 'playlist'")
  expect(page).toContain('activeCategory.value = (target.query.category as string) || saveCategory.value')
})

test('explicit All selection and unrelated Explore tabs keep their existing routes', () => {
  const page = source('src/renderer/views/ExplorePage.vue')
  const navbar = source('src/renderer/components/NavBar.vue')

  expect(page).toContain("router.push({ name: 'explore', query: { tab, category } })")
  expect(page).toContain("if (activeCategory.value === '精品歌单') return getHighQualityPlaylist()")
  expect(page).toContain("cat: activeCategory.value")
  expect(navbar).toContain("chart: '排行榜'")
  expect(navbar).toContain("artist: '歌手'")
  expect(navbar).toContain(": ['chart', 'artist'].includes(category) ? categoryMap[category] : '全部'")
})
