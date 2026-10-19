import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

test('profile setting chips reuse live session colors, with an independent seed hue', () => {
  const view = readSource('src/renderer/components/HeartModeAssistant.vue')
  const css = readSource('src/renderer/assets/css/rainbow-theme.scss')
  const colors = {
    novelty: 1,
    diversity: 5,
    familiarity: 7,
    seed: 3
  }
  for (const [key, hue] of Object.entries(colors)) {
    expect(view).toContain(`rainbow-heart-param rainbow-heart-param-${key}`)
    expect(css).toContain(
      `.rainbow-heart-param-${key} { --heart-param-hue: var(--rainbow-${hue}); }`
    )
  }
  expect(css).toContain('.profile-summary > .rainbow-heart-param')
  expect(css).toContain('color: var(--heart-param-hue)')
  expect(css).toContain('opacity: 1;')
})

test('rainbow mode options are colored individually and preserve native fallback', () => {
  const view = readSource('src/renderer/components/HeartModeAssistant.vue')
  const css = readSource('src/renderer/assets/css/rainbow-theme.scss')
  expect(view).toContain('v-model="selectedProfileMode"')
  expect(view).toContain('class="profile-native-select"')
  expect(view).toContain('class="rainbow-profile-trigger"')
  expect(view).toContain('class="rainbow-profile-option"')
  expect(view).toContain('role="listbox"')
  expect(view).toContain('role="option"')
  expect(view).toContain('aria-haspopup="listbox"')
  expect(view).toContain('selectedProfileMode.value = value')
  expect(view).toContain('set: (value) => applyHeartModePreset(value)')
  expect(css).toContain(":root[data-accent-theme='rainbow'] .heart-mode-assistant")
  expect(css).toContain('.profile-field .profile-native-select {')
  expect(css).toContain('.profile-field .rainbow-profile-select {')
  expect(css).toContain('.rainbow-profile-option.selected')
  for (const key of ['continuous', 'balanced', 'diverse', 'explore', 'custom']) {
    expect(css).toContain(`.rainbow-profile-mode-${key}`)
  }
})

test('custom dropdown closes accessibly, and its listeners are cleaned up', () => {
  const view = readSource('src/renderer/components/HeartModeAssistant.vue')
  expect(view).toContain('@keydown.down.prevent="focusProfileOption(index + 1)"')
  expect(view).toContain('@keydown.up.prevent="focusProfileOption(index - 1)"')
  expect(view).toContain('@keydown.esc.stop.prevent="closeProfileDropdown(true)"')
  expect(view).toContain("document.addEventListener('pointerdown', closeProfileDropdownOnOutsideClick)")
  expect(view).toContain("document.removeEventListener('pointerdown', closeProfileDropdownOnOutsideClick)")
  expect(view.indexOf("const panelPage = ref<HeartModePanelPage>('main')")).toBeLessThan(
    view.indexOf('watch([panelOpen, panelPage]')
  )
})
