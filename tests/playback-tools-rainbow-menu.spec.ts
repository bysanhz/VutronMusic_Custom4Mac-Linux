import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('rainbow menu styling is scoped to playback tools and retains interaction states', () => {
  const menu = readFileSync(resolve(process.cwd(), 'src/renderer/components/ContextMenu.vue'), 'utf8')
  const style = menu.slice(menu.indexOf('/* Rainbow roles are scoped'))
  expect(style).toContain('.context-menu.player-tools-menu')
  expect(style).toContain('--tool-rainbow')
  expect(style).toContain('nth-child(7n + 1)')
  expect(style).toContain('&:focus-visible')
  expect(style).toContain("data-theme='dark'")
  expect(style).not.toContain('.context-menu:not(.player-tools-menu)')
})
