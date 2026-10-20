import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const theme = () => source('src/renderer/assets/css/rainbow-theme.scss')

test('playback history preserves actions and uses light rainbow panels instead of neutral cards', () => {
  const view = source('src/renderer/components/ModalPlaybackHistory.vue')
  const css = theme()
  expect(view).toContain('class="player-tool-modal playback-history-modal"')
  for (const action of ['saveCurrentQueue', 'restore(snapshot)', 'deleteQueueSnapshot(snapshot.id)', 'clearAll', 'playTrack(track)']) {
    expect(view).toContain(action)
  }
  expect(css).toContain('.shade.playback-history-modal {')
  expect(css).toContain('.history-list > .history-card:nth-child(7n + 1)')
  expect(css).toContain('.history-card-actions > button:not(.danger)')
  expect(css).toContain('.recent-grid > .recent-track:nth-child(7n)')
  expect(css).toContain('var(--rainbow-dialog-paper)')
})

test('lyric timing numeric values and all adjustment buttons get their own color', () => {
  const view = source('src/renderer/components/ModalTrackLyricOffset.vue')
  const css = theme()
  expect(view).toContain('class="player-tool-modal lyric-offset-modal"')
  for (const delta of ['-0.5', '-0.1', '0.1', '0.5']) {
    expect(view).toContain(`adjust(${delta})`)
  }
  expect(css).toContain('.shade.lyric-offset-modal {')
  expect(css).toContain('.offset-overview > .offset-card:first-child')
  expect(css).toContain('.offset-overview > .offset-card:last-child')
  expect(css).toContain('.offset-controls > .offset-input input')
  for (const num of [1, 2, 3, 4]) expect(css).toContain(`.step-controls > button:nth-child(${num})`)
})

test('remaining playback tool dialogs have explicitly scoped rainbow surfaces', () => {
  const mapping = [
    ['ModalSleepTimer.vue', 'sleep-timer-modal'],
    ['ModalBackground.vue', 'background-tool-modal'],
    ['ModalPlayerFont.vue', 'font-tool-modal'],
    ['ModalPlayerTheme.vue', 'theme-selection-modal'],
    ['ModalSaveTheme.vue', 'save-theme-modal']
  ] as const
  const css = theme()
  for (const [file, cls] of mapping) {
    expect(source(`src/renderer/components/${file}`)).toContain(cls)
    expect(css).toContain(`.shade.${cls}`)
  }
  expect(css).toContain('.quick-time-grid > button:nth-child(7n')
  expect(css).toContain('.item-1 > .bg-select')
  expect(css).toContain('.lyric-setting > .item')
  expect(css).toContain('.theme-list > .theme-item')
})

test('heart-mode custom sliders keep semantic colors and existing algorithm inputs', () => {
  const view = source('src/renderer/components/HeartModeAssistant.vue')
  const css = theme()
  expect(view).toContain('rainbow-profile-core-${control.key}')
  expect(view).toContain('updateProfileCore(control.key, $event)')
  expect(view).toContain("updateHeartModeProfile({ mode: 'custom', [field]: value })")
  for (const [name, hue] of [
    ['novelty', 1], ['diversity', 5], ['familiarity', 7], ['repeatTolerance', 2]
  ] as const) {
    expect(css).toContain(`.rainbow-profile-core-${name} { --heart-slider-hue: var(--rainbow-${hue}); }`)
  }
  expect(css).toContain('.profile-advanced-grid > label')
  expect(css).toContain('.guide-group:nth-child')
  expect(css).toContain('.branches > .branch-row')
})

test('rainbow-only selectors do not alter system settings or danger semantics', () => {
  const css = theme()
  const edits = css.slice(css.indexOf('/* Rainbow tool-dialog surfaces:'))
  expect(edits).toContain(":root[data-accent-theme='rainbow']")
  expect(edits).not.toContain('.system-settings')
  expect(edits).not.toContain('button.danger {')
  expect(edits).toContain('.history-card-actions > button:not(.danger)')
  expect(edits).toContain("body[data-theme='dark']")
})
