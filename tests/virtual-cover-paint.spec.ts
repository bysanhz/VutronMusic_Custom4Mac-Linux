import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('cover scrolling paint stability', () => {
  test('keeps virtual cover buffers eager without content-visibility skipping', () => {
    const source = readSource('src/renderer/components/VirtualCoverRow.vue')

    expect(source).toContain(':above-value="4"')
    expect(source).toContain(':below-value="6"')
    expect(source).toContain(':image-loading=')
    expect(source).toContain("enableVirtualScroll ? 'eager' : 'lazy'")
    expect(source).toContain("'virtual-cover-row--virtualized': enableVirtualScroll")
    expect(source).toContain('.virtual-cover-row--virtualized :deep(.infinite-list)')
    expect(source).toContain('will-change: transform')
  })

  test('uses native outer scrolling for library cover grids', () => {
    const library = readSource('src/renderer/views/LibraryMusic.vue')
    const nativeScrollMatches = library.match(/:enable-virtual-scroll="false"/g)

    expect(nativeScrollMatches?.length).toBeGreaterThanOrEqual(4)
    expect(library).not.toContain(':enable-virtual-scroll="true"')
  })

  test('skips offscreen native cover work without virtual row switching', () => {
    const source = readSource('src/renderer/components/VirtualCoverRow.vue')
    const coverBox = readSource('src/renderer/components/CoverBox.vue')

    expect(source).toContain("'native-cover-item': !enableVirtualScroll")
    expect(source).toContain('content-visibility: auto')
    expect(source).toContain('contain-intrinsic-size: auto 280px')
    expect(coverBox).toContain(':loading="imageLoading"')
    expect(coverBox).toContain("type: String as PropType<'lazy' | 'eager'>")
    expect(coverBox).toContain("default: 'lazy'")
  })
})
