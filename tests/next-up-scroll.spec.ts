import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('next-up queue scrolling', () => {
  test('uses only the outer page scroller for queue sections', () => {
    const source = readSource('src/renderer/views/NextUp.vue')

    expect(source.match(/:enable-virtual-scroll="false"/g)?.length).toBe(3)
    expect(source).toContain(':padding-bottom="96"')
    expect(source).toContain('list.value.slice(currentTrackIndex.value + 1, currentTrackIndex.value + 100)')
  })
})
