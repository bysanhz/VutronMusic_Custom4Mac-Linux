import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('macOS tray metadata for lyricless tracks', () => {
  test('expands the tray lyric area to fit normal-length artist/title metadata', () => {
    const tray = readSource('src/renderer/utils/trayLyrics.ts')

    expect(tray).toContain('const resolveTrayLyricWidth =')
    expect(tray).toContain('measureTrayTextWidth(payload.text) + 18')
    expect(tray).toContain('Math.min(520, Math.floor(screenWidth * 0.42))')
    expect(tray).toContain('new Lyric({ width: resolveTrayLyricWidth(payload) })')
    expect(tray).toContain('this.getCombineIcon()')
    expect(tray).toContain("join(' / ')")
  })

  test('keeps ordinary timed lyrics on the configured fixed width', () => {
    const tray = readSource('src/renderer/utils/trayLyrics.ts')

    expect(tray).toContain('if (!payload.loop) return configuredWidth')
  })
})
