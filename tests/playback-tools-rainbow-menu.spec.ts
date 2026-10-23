import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const menuSource = (): string =>
  readFileSync(resolve(process.cwd(), 'src/renderer/components/ContextMenu.vue'), 'utf8')

test('rainbow player menu hues apply only when the Rainbow accent is selected', () => {
  const menu = menuSource()
  const rainbow = menu.slice(
    menu.indexOf("/* Rainbow roles are scoped"),
    menu.indexOf('/* Solid presets and custom colors: use a single, light tint')
  )
  expect(rainbow).toContain(":root[data-accent-theme='rainbow'] .context-menu.player-tools-menu")
  expect(rainbow).toContain('--tool-rainbow')
  expect(rainbow).toContain('nth-child(7n + 1)')
  expect(rainbow).toContain('nth-child(7n)')
  expect(rainbow).toContain('&:focus-visible')
  expect(rainbow).not.toContain(":root:not([data-accent-theme='rainbow'])")
})

test('non-rainbow player menus keep the same geometry with a light single-hue tint', () => {
  const menu = menuSource()
  const common = menu.slice(
    menu.indexOf('/* Player-tool menu geometry is shared'),
    menu.indexOf('/* Rainbow roles are scoped')
  )
  const mono = menu.slice(menu.indexOf('/* Solid presets and custom colors: use a single, light tint'))
  expect(common).toContain('.context-menu.player-tools-menu')
  expect(common).toContain('width: 252px')
  expect(common).toContain("data-theme='dark'")
  expect(common).toContain('min-height: 44px')
  expect(mono).toContain(":root:not([data-accent-theme='rainbow']) .context-menu.player-tools-menu")
  expect(mono).toContain('var(--mono-accent-ink)')
  expect(mono).toContain('var(--color-primary) 8%')
  expect(mono).toContain('var(--color-primary) 15%')
  expect(mono).toContain('var(--color-body-bg)')
  expect(mono).toContain('&:focus-visible')
  expect(mono).not.toContain('--tool-rainbow')
  expect(mono).not.toContain('nth-child(7n')
  expect(mono).not.toContain('#e66d91')
  expect(menu).not.toContain('.context-menu:not(.player-tools-menu)')
})
