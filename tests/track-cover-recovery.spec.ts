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

test('ignores default artwork retained in legacy player snapshots', () => {
  for (const picUrl of [
    'atom://get-default-pic/',
    'https://p2.music.126.net/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg?param=512y512',
    'http://localhost:41830/assets/images/default.jpg',
    'http://localhost:41830/assets/default-AbCd1234.jpg'
  ]) {
    expect(getUsableTrackCoverUrl({ picUrl })).toBe('')
  }
  expect(getUsableTrackCoverUrl({ picUrl: 'blob:fixture-cover' })).toBe('blob:fixture-cover')
})
