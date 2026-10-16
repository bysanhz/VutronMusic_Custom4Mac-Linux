import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_COVER_IMAGE_URL,
  getCoverImageSources
} from '../src/renderer/utils/coverImageSources'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('cover image recovery', () => {
  test('routes failed NetEase covers through the existing main-process proxy', () => {
    const sources = getCoverImageSources('http://p3.music.126.net/example/cover.jpg')
    expect(sources).toHaveLength(3)
    expect(sources[0]).toBe('https://p3.music.126.net/example/cover.jpg')
    expect(sources[1]).toBe(`atom://get-image/${encodeURIComponent(sources[0])}`)
    expect(sources[2]).toBe(DEFAULT_COVER_IMAGE_URL)
  })

  test('avoids proxying third-party images and duplicate placeholders', () => {
    expect(getCoverImageSources('')).toEqual([DEFAULT_COVER_IMAGE_URL])
    expect(getCoverImageSources(DEFAULT_COVER_IMAGE_URL)).toEqual([DEFAULT_COVER_IMAGE_URL])
    expect(getCoverImageSources('https://example.com/cover.jpg')).toEqual([
      'https://example.com/cover.jpg',
      DEFAULT_COVER_IMAGE_URL
    ])
  })

  test('shared cover component advances on errors and resets for changed URLs', () => {
    const source = readSource('src/renderer/components/CoverBox.vue')
    expect(source).toContain(':src="displayImageUrl"')
    expect(source).toContain('getCoverImageSources(props.imageUrl)')
    expect(source).toContain('imageSourceIndex.value += 1')
    expect(source).toContain('imageSourceIndex.value = 0')
    expect(source).toContain('imageFailed.value = true')
    expect(source).toContain('class="cover-error-fallback"')
    expect(source).toContain("'no-referrer'")
  })
})
