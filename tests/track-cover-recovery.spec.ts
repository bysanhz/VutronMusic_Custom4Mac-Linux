import { expect, test } from '@playwright/test'
import { getUsableTrackCoverUrl } from '../src/shared/trackCover'

test('ignores placeholder covers and accepts a recovered album cover', () => {
  expect(getUsableTrackCoverUrl({ album: { picUrl: 'atom://get-default-pic' } })).toBe('')
  expect(
    getUsableTrackCoverUrl({
      album: { picUrl: 'atom://get-default-pic' },
      al: { picUrl: 'https://p1.music.126.net/recovered.jpg' }
    })
  ).toBe('https://p1.music.126.net/recovered.jpg')
})
