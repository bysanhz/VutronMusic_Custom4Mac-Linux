import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('virtual cover scrolling paint stability', () => {
  test('pre-renders buffered cover rows without content-visibility paint skipping', () => {
    const source = readSource('src/renderer/components/VirtualCoverRow.vue')

    expect(source).toContain(':above-value="4"')
    expect(source).toContain(':below-value="6"')
    expect(source).toContain('image-loading="eager"')
    expect(source).toContain('will-change: transform')
    expect(source).not.toContain('content-visibility: auto')
    expect(source).not.toContain('contain-intrinsic-size')
  })

  test('keeps lazy loading as the default for non-virtual cover callers', () => {
    const source = readSource('src/renderer/components/CoverBox.vue')

    expect(source).toContain(':loading="imageLoading"')
    expect(source).toContain("type: String as PropType<'lazy' | 'eager'>")
    expect(source).toContain("default: 'lazy'")
  })
})
