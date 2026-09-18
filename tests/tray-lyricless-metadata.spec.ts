import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('macOS tray metadata for lyricless tracks', () => {
  test('keeps a bounded tray width and starts marquee measurement on initial render', () => {
    const tray = readSource('src/renderer/utils/trayLyrics.ts')

    expect(tray).toContain("join(' / ')")
    expect(tray).toContain('new Lyric({ width: Math.max(100, Number(tray.value.lyricWidth) || 192) })')
    expect(tray).toContain('this._lyric.updateLyric(!playing.value, payload)')
    expect(tray).toContain('Lyric.updateLyric() 才会测量真实文本宽度并启动长文本滚动')
    expect(tray).not.toContain('resolveTrayLyricWidth')
    expect(tray).not.toContain('measureTrayTextWidth')
  })

  test('uses looping metadata only for lyricless fallback text', () => {
    const tray = readSource('src/renderer/utils/trayLyrics.ts')

    expect(tray).toContain('loop: true')
    expect(tray).toContain('loop: false')
    expect(tray).toContain('time: 10000')
  })
})
