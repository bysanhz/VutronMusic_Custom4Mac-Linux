import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('rainbow styling covers tool-dialog internals and settings without spilling to other presets', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/renderer/assets/css/rainbow-theme.scss'), 'utf8')
  const block = css.slice(css.indexOf('/* Playback More Actions dialogs: internal controls'))
  expect(block).toContain(":root[data-accent-theme='rainbow'] #app .shade.player-tool-modal")
  expect(block).toContain('.history-card:nth-child')
  expect(block).toContain('.quick-time-grid')
  expect(block).toContain('.offset-card')
  expect(block).toContain(":root[data-accent-theme='rainbow'] #app .system-settings")
  expect(block).toContain('.toggle input:checked + label:before')
  expect(block).toContain('button:not(.danger):not(.primary)')
})
