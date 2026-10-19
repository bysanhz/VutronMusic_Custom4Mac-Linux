import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('rainbow accents target player tool internals without changing system settings', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/renderer/assets/css/rainbow-theme.scss'), 'utf8')
  const block = css.slice(css.indexOf('/* Playback More Actions dialogs: internal controls'))
  expect(block).toContain(":root[data-accent-theme='rainbow'] #app .shade.player-tool-modal")
  expect(block).toContain(".shade.convolver-modal")
  expect(block).toContain('.convolution .scene-option')
  expect(block).toContain('.gain-range::-webkit-slider-thumb')
  expect(block).toContain('.biquader .frequency-value')
  expect(block).toContain('.preset .button:nth-child')
  expect(block).not.toContain('/* Outer settings: use categorical accents')
  expect(block).not.toContain("#app .system-settings")
})
