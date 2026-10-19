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

test('player tool dialogs use opaque white in light mode and opaque dark in dark mode', () => {
  const modal = readFileSync(resolve(process.cwd(), 'src/renderer/components/BaseModal.vue'), 'utf8')
  expect(modal).toContain('.shade.player-tool-modal {')
  expect(modal).toMatch(/\.shade\.player-tool-modal\s*\{[\s\S]*?background: #fff;/)
  expect(modal).toContain("[data-theme='dark'] .shade.player-tool-modal .modal")
  expect(modal).toContain('background: #242424;')
})

test('equalizer displays active preset in exactly the corresponding chip color', () => {
  const view = readFileSync(resolve(process.cwd(), 'src/renderer/components/ModalConvolver.vue'), 'utf8')
  const css = readFileSync(resolve(process.cwd(), 'src/renderer/assets/css/rainbow-theme.scss'), 'utf8')
  expect(view).toContain('class="preset-current-name"')
  expect(view).toContain("'--preset-hue': activePresetHue")
  expect(view).toContain("'--preset-hue': presetHue(index)")
  expect(view).toContain("'--preset-hue': presetHue(freqsPreset.length + index)")
  expect(css).toContain('.preset-current-name')
  expect(css).toContain('.modal .content .preset button.button:not(:disabled)')
  expect(css).toContain('color: var(--preset-hue) !important;')
})
