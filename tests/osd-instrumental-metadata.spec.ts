import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('compact OSD instrumental metadata', () => {
  test('renders metadata outside LyricLine and scrolls the full fallback text when needed', () => {
    const osd = readSource('src/renderer/components/OsdLyricContainer.vue')

    expect(osd).toContain('v-if="isMini && isFallbackTrackTitle"')
    expect(osd).toContain('class="fallback-track-info"')
    expect(osd).toContain('{{ fallbackTrackText }}')
    expect(osd).toContain("join(' / ')")
    expect(osd).toContain('textElement.scrollWidth - viewport.clientWidth')
    expect(osd).toContain('fallbackNeedsMarquee.value = overflow > 2')
    expect(osd).toContain('@keyframes fallback-track-marquee')
    expect(osd).toContain('transform: translateX(var(--fallback-travel))')
    expect(osd).toContain('fallbackResizeObserver?.observe(viewport)')
  })
})
