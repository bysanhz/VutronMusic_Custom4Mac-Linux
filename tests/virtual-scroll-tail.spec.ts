import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('virtual list tail visibility', () => {
  test('computes viewport height from the list actual top and player bar inset', () => {
    const source = readSource('src/renderer/components/VirtualScrollNoHeight.vue')

    expect(source).toContain('const viewportTop = ref(0)')
    expect(source).toContain('const updateViewportMetrics = () =>')
    expect(source).toContain('element.getBoundingClientRect().top')
    expect(source).toContain(
      'windowHeight.value - effectiveTop - playerBarInset.value'
    )
    expect(source).toContain('updateViewportMetrics()')
  })

  test('forces the virtual window to include the final row at the real scroll bottom', () => {
    const source = readSource('src/renderer/components/VirtualScrollNoHeight.vue')

    expect(source).toContain(
      'scrollTop + currentContainerHeight >= contentHeight - 2'
    )
    expect(source).toContain(
      'const tailStartRow = Math.max(0, totalRowCount.value - visibleCount.value)'
    )
    expect(source).toContain('startRow.value = tailStartRow')
    expect(source).toContain('setStartOffset()')
  })
})
