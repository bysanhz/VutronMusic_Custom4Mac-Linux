import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('virtual scroll viewport handoff', () => {
  test('keeps the virtual viewport height stable while scrolling', () => {
    const source = readSource('src/renderer/components/VirtualScrollNoHeight.vue')

    expect(source).toContain(
      'windowHeight.value - navBarHeight - playerBarInset.value'
    )
    expect(source).not.toContain('getBoundingClientRect().top')
    expect(source).not.toContain('viewportTop')
  })

  test('hands scroll ownership over only after the list is almost fully visible', () => {
    const source = readSource('src/renderer/components/VirtualScrollNoHeight.vue')

    expect(source).toContain(
      'entry.isIntersecting && entry.intersectionRatio >= 0.99'
    )
    expect(source).toContain('threshold: [0, 0.99, 1]')
  })

  test('excludes both fixed bars from the observer root', () => {
    const source = readSource('src/renderer/components/VirtualScrollNoHeight.vue')

    expect(source).toContain('const navBarHeight = hasCustomTitleBar.value ? 84 : 64')
    expect(source).toContain('const bottomInset = Math.max(0, Number(playerBarInset.value) || 0)')
    expect(source).toContain('rootMargin: `-${navBarHeight}px 0px -${bottomInset}px 0px`')
  })

  test('does not mutate virtual-list height from scroll-time layout reads', () => {
    const source = readSource('src/renderer/components/VirtualScrollNoHeight.vue')

    expect(source).not.toContain('updateViewportMetrics')
    expect(source).not.toContain('tailStartRow')
  })
})
