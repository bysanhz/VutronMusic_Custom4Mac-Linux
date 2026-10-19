import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string): string => readFileSync(resolve(process.cwd(), file), 'utf8')

test('compact BaseModal shell applies only to three specific player tools', () => {
  const modal = source('src/renderer/components/BaseModal.vue')
  expect(modal).toContain('.shade.player-tool-modal:is(')
  for (const name of ['lyric-offset-modal', 'playback-history-modal', 'sleep-timer-modal']) {
    expect(modal).toContain(`.${name}`)
  }
  expect(modal).toContain('margin: 0 18px 8px;')
  expect(modal).toContain('margin: 8px 18px 0;')
  expect(modal).toContain('background: #fff;')
})

test('lyric correction uses one-row controls with a narrow screen fallback', () => {
  const view = source('src/renderer/components/ModalTrackLyricOffset.vue')
  expect(view).toContain('player-tool-modal lyric-offset-modal')
  expect(view).toContain('grid-template-columns: 84px minmax(0, 1fr)')
  expect(view).toContain('@media (max-width: 430px)')
  expect(view).toContain('adjust(-0.5)')
  expect(view).toContain('adjust(0.5)')
  expect(view).toContain('commitDraft()')
})

test('playback history remains scrollable without a minimum blank panel', () => {
  const view = source('src/renderer/components/ModalPlaybackHistory.vue')
  expect(view).toContain('player-tool-modal playback-history-modal')
  expect(view).toContain('min-height: 0;')
  expect(view).toContain('max-height: min(34vh, 260px)')
  expect(view).toContain('overflow: auto;')
  expect(view).toContain('restore(snapshot)')
  expect(view).toContain('deleteQueueSnapshot(snapshot.id)')
})

test('sleep timer keeps all trigger and action choices while reducing card height', () => {
  const view = source('src/renderer/components/ModalSleepTimer.vue')
  expect(view).toContain('player-tool-modal sleep-timer-modal')
  expect(view).toContain('min-height: 56px;')
  for (const value of ['trackEnd', 'queueEnd', 'pause', 'quit']) {
    expect(view).toContain(value)
  }
  expect(view).toContain('startSleepTimer(selection)')
})
