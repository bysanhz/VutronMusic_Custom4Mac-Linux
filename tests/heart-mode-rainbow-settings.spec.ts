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

test('heart-mode navigation uses compact labels and each rainbow tab has a defined accent', () => {
  const view = readSource('src/renderer/components/HeartModeAssistant.vue')
  const rainbow = readSource('src/renderer/assets/css/rainbow-theme.scss')

  for (const label of [
    "profileSettings: '设置'",
    "guideTitle: '说明'",
    "profileSettings: '設定'",
    "guideTitle: '說明'",
    "profileSettings: 'Settings'",
    "guideTitle: 'Guide'"
  ]) {
    expect(view).toContain(label)
  }

  expect(view).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));')
  for (const index of [1, 2, 3, 4]) {
    expect(view).toContain(`rainbow-heart-tab-${index}`)
    expect(rainbow).toContain(`.rainbow-heart-tab-${index} {`)
  }
  expect(rainbow).toContain('--rainbow-heart-tab-color: var(--rainbow-2);')
})

test('blocklist has theme-scoped colored surfaces and accessible blocked states', () => {
  const view = readSource('src/renderer/components/HeartModeAssistant.vue')
  const rainbow = readSource('src/renderer/assets/css/rainbow-theme.scss')
  const solid = readSource('src/renderer/assets/css/monochrome-theme.scss')

  for (const card of ['current', 'songs', 'artists']) {
    expect(view).toContain(`class="settings-card blocklist-card blocklist-card-${card}"`)
    expect(rainbow).toContain(`.blocklist-card-${card} {`)
  }

  expect(view).toContain('class="blocklist-action blocklist-action-song"')
  expect(view).toContain('class="blocklist-action blocklist-action-artist"')
  expect(view).toContain(':aria-pressed="currentSongBlocked"')
  expect(view).toContain(':aria-pressed="artist.blocked"')

  for (const selector of [
    '.blocklist-shortcut',
    '.blocklist-page > .blocklist-hint',
    '.blocklist-page > .blocklist-card',
    '.blocklist-page .blocklist-action',
    '.blocklist-card .blocklist-remove'
  ]) {
    expect(rainbow).toContain(selector)
  }

  expect(rainbow).toContain('--blocklist-hue: var(--rainbow-1)')
  expect(rainbow).toContain('--blocklist-hue: var(--rainbow-5)')
  expect(rainbow).toContain('--heart-rainbow-paper: #242424')
  expect(solid).toContain(":root:not([data-accent-theme='rainbow']) .heart-mode-assistant")
  expect(solid).toContain('.blocklist-page > .blocklist-card')
  expect(solid).toContain('color: var(--mono-accent-ink)')
})
