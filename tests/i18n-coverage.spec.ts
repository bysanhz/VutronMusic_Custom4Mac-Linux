import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(root, relativePath), 'utf8')

const flattenKeys = (value: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      return flattenKeys(child as Record<string, unknown>, fullKey)
    }
    return [fullKey]
  })

test.describe('renderer i18n coverage', () => {
  test('keeps simplified Chinese, traditional Chinese and English locale keys in parity', () => {
    const locales = ['zh-hans', 'zh-hant', 'en'].map((name) =>
      JSON.parse(readSource(`src/renderer/locales/${name}.json`))
    )
    const keySets = locales.map((locale) => [...flattenKeys(locale)].sort())

    expect(keySets[1]).toEqual(keySets[0])
    expect(keySets[2]).toEqual(keySets[0])
  })

  test('routes Music Insights to the localized stable implementation', () => {
    const router = readSource('src/renderer/router/index.ts')
    expect(router).toContain("import('../views/MusicInsightsStable.vue')")
    expect(router).not.toContain("import('../views/MusicInsights.vue')")
  })

  test('keeps major user-facing additions on translation keys instead of Chinese literals', () => {
    const checks: Array<[string, string[]]> = [
      [
        'src/renderer/views/MusicInsightsStable.vue',
        ['<h1>音乐洞察</h1>', '<h2>听歌足迹</h2>', '待同步 +', '云盘 Pro</h2>']
      ],
      [
        'src/renderer/views/HomePage.vue',
        ['<div class="insights-title">音乐洞察</div>', '>猜你喜欢<', '>为你定制<']
      ],
      ['src/renderer/views/LibraryMusic.vue', ["'歌词歌曲加载中'", "'未知歌手'"]],
      ['src/renderer/views/DailyTracks.vue', ['>每日歌曲推荐<', '>今日推荐<', '>历史日推<']],
      [
        'src/renderer/views/LocalMusic.vue',
        ['>本地歌曲<', '>全部歌曲<', '>歌曲总时长<', '>离线歌单<']
      ],
      [
        'src/renderer/views/StreamPage.vue',
        ['>流媒体歌曲', '>全部歌曲<', '>流媒体歌单<', '>聚合<']
      ],
      ['src/renderer/views/UserPage.vue', ['>TA的听歌排行<', '>动态<', '>播客<', "'已关注'"]],
      [
        'src/renderer/components/VirtualTrackList.vue',
        ['>不感兴趣<', '>从云盘删除<', "'已从云盘删除'"]
      ],
      [
        'src/renderer/views/SystemSettings.vue',
        ["'高清环绕声'", "'沉浸环绕声'", "'臻音全景声'", "'超清母带'"]
      ]
    ]

    for (const [file, forbidden] of checks) {
      const source = readSource(file)
      for (const literal of forbidden) expect(source).not.toContain(literal)
    }
  })
})
