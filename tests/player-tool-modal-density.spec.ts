import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string): string => readFileSync(resolve(process.cwd(), file), 'utf8')

test('three player tools narrow horizontally without changing shared vertical spacing', () => {
  const modal = source('src/renderer/components/BaseModal.vue')
  const compact = modal.slice(modal.indexOf('/* Narrow only the side gutters'))
  expect(compact).toContain('.lyric-offset-modal')
  expect(compact).toContain('.playback-history-modal')
  expect(compact).toContain('.sleep-timer-modal')
  expect(compact).toContain('margin-inline: 18px')
  expect(compact).toContain('padding-inline: 18px')
  expect(compact).not.toContain('padding-top:')
  expect(compact).not.toContain('padding-bottom:')
})

test('track lyric modal keeps vertical controls but reduces its overall width', () => {
  const view = source('src/renderer/components/ModalTrackLyricOffset.vue')
  expect(view).toContain('width="min(405px, calc(100vw - 32px))"')
  expect(view).toContain('class="player-tool-modal lyric-offset-modal"')
  expect(view).toContain('.offset-controls {\n  display: grid;\n  gap: 6px;\n}')
  expect(view).toContain('adjust(-0.5)')
  expect(view).toContain('adjust(0.5)')
})

test('queue history uses a narrower modal without shrinking list height', () => {
  const view = source('src/renderer/components/ModalPlaybackHistory.vue')
  expect(view).toContain('width="min(525px, calc(100vw - 32px))"')
  expect(view).toContain('class="player-tool-modal playback-history-modal"')
  expect(view).toContain('max-height: min(42vh, 330px)')
  expect(view).toContain('overflow: auto')
  expect(view).toContain('restore(snapshot)')
})

test('sleep timer narrows without changing timer choice layout or scheduling', () => {
  const view = source('src/renderer/components/ModalSleepTimer.vue')
  expect(view).toContain('width="min(405px, calc(100vw - 32px))"')
  expect(view).toContain('class="player-tool-modal sleep-timer-modal"')
  expect(view).toContain('min-height: 74px;')
  expect(view).toContain('startSleepTimer(selection)')
})
