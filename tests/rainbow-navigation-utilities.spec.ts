import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (file: string): string => readFileSync(resolve(process.cwd(), file), 'utf8')

test('bottom player skip pair uses the same rainbow color and expansion has its own accent', () => {
  const player = read('src/renderer/components/PlayerBar.vue')
  const css = read('src/renderer/assets/css/rainbow-theme.scss')
  expect(player.match(/class="rainbow-skip-control"/g)).toHaveLength(2)
  expect(player).toContain('class="lyrics-button rainbow-expand-control"')
  const themeRules = css.slice(css.indexOf('/* Keep previous and next in one consistent blue transport group'))
  expect(themeRules).toContain('.rainbow-skip-control .svg-icon')
  expect(themeRules).toContain('color: var(--rainbow-playback) !important;')
  expect(themeRules).toContain('.rainbow-expand-control .svg-icon')
  expect(themeRules).toContain('color: var(--rainbow-navigation) !important;')
})

test('sidebar back forward and network icons have distinct rainbow roles without overriding network quality', () => {
  const nav = read('src/renderer/components/SideNav.vue')
  const css = read('src/renderer/assets/css/rainbow-theme.scss')
  expect(nav).toContain('history-button rainbow-history-back')
  expect(nav).toContain('history-button rainbow-history-forward')
  expect(nav).toContain('network-button rainbow-network-control')
  const themeRules = css.slice(css.indexOf('/* Navigation utilities use the same categorical accents'))
  expect(themeRules).toContain('--rainbow-utility-hue: var(--rainbow-2);')
  expect(themeRules).toContain('--rainbow-utility-hue: var(--rainbow-4);')
  expect(themeRules).toContain('--rainbow-utility-hue: var(--rainbow-5);')
  expect(themeRules).toContain(":root[data-accent-theme='rainbow']")
  expect(themeRules).toContain("body[data-theme='dark']")
  expect(nav).toContain('&.excellent .network-indicator')
  expect(nav).toContain('&.poor .network-indicator')
  expect(themeRules).not.toContain('background: var(--rainbow-utility-hue);')
})
