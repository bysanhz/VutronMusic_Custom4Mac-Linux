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

test('dark rainbow equalizer presets and close controls beat neutral modal overrides', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/renderer/assets/css/rainbow-theme.scss'), 'utf8')
  const interaction = readFileSync(resolve(process.cwd(), 'src/renderer/assets/css/interaction-theme.scss'), 'utf8')
  const modal = readFileSync(resolve(process.cwd(), 'src/renderer/components/ModalConvolver.vue'), 'utf8')
  const base = readFileSync(resolve(process.cwd(), 'src/renderer/components/BaseModal.vue'), 'utf8')
  expect(interaction).toContain('#app .shade .modal button:not(.primary)')
  expect(interaction).toContain('button.close')
  expect(base).toContain('class="close"')
  expect(modal).toContain('class="convolver-modal player-tool-modal"')
  expect(modal).toContain('class="preset-current-name"')
  expect(modal).toContain('class="reset button"')
  expect(css).toContain(
    ":root[data-accent-theme='rainbow'] #app .shade.convolver-modal .modal .content .preset > button.button:not(:disabled)"
  )
  expect(css).toContain(
    ":root[data-accent-theme='rainbow'] body[data-theme='dark'] #app .shade.convolver-modal .modal .content .preset > button.button:not(:disabled)"
  )
  expect(css).toContain('color: var(--preset-hue, #f2f3f6) !important;')
  expect(css).toContain('.freqsContainer .reset.button:not(:disabled)')
  expect(css).toContain(
    ":root[data-accent-theme='rainbow'] body[data-theme='dark'] #app .shade.player-tool-modal .modal > .header > button.close"
  )
  expect(css).toContain('color: #f2f3f6 !important;')
  expect(css).toContain('background: #3a3a3a !important;')
  expect(css).toContain('button.close .svg-icon')
  expect(css).toContain('.preset-disclosure > summary')
})

test('frequency guide labels match the rainbow equalizer slider and decibel hues', () => {
  const view = readFileSync(resolve(process.cwd(), 'src/renderer/components/ModalConvolver.vue'), 'utf8')
  const css = readFileSync(resolve(process.cwd(), 'src/renderer/assets/css/rainbow-theme.scss'), 'utf8')

  // Both visual representations iterate the same fixed ordering.
  expect(view).toContain('v-for="(item, index) in freqsKeyList" :key="item" class="biquader"')
  expect(view).toContain('v-for="(item, index) in freqsKeyList" :key="item" class="frequency-guide-item"')

  // One shared set of selectors drives both, so future hue changes remain synchronized.
  expect(css).toContain(':is(.biquader, .frequency-guide-item) { --eq-hue: var(--rainbow-6); }')
  for (let i = 1; i <= 7; i++) {
    const suffix = i === 7 ? '7n' : `7n + ${i}`
    expect(css).toContain(
      `:is(.biquader, .frequency-guide-item):nth-child(${suffix}) { --eq-hue: var(--rainbow-${i}); }`
    )
  }
  expect(css).toContain('.biquader .frequency-value {\n    color: var(--eq-hue);')
  expect(css).toContain('.biquader .equalizer-range::-webkit-slider-thumb { background: var(--eq-hue); }')
  expect(css).toContain('.frequency-guide-item strong { color: var(--eq-hue); }')
})
