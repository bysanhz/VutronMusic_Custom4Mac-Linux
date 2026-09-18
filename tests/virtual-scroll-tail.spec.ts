import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('virtual list tail visibility', () => {
  test('keeps the virtual viewport height stable while scrolling', () => {
    const source = readSource('src/renderer/components/VirtualScrollNoHeight.vue')

    expect(source).toContain(
      'windowHeight.value - navBarHeight - playerBarInset.value'
    )
    expect(source).not.toContain('const viewportTop = ref(0)')
    expect(source).not.toContain('const updateViewportMetrics = () =>')
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

  test('applies the tail correction after the normal virtual-window update', () => {
    const source = readSource('src/renderer/components/VirtualScrollNoHeight.vue')

    expect(source).toContain(
      'onScroll()\n  onScrollToBottom()'
    )
  })
})
