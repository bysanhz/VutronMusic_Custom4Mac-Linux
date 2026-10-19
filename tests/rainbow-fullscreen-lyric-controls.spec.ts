import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (name: string) => readFileSync(resolve(process.cwd(), name), 'utf8')

test('rainbow fullscreen controls map collapse and three lyric timing actions to distinct colors', () => {
  const player = source('src/renderer/views/PlayPage.vue')
  const lyrics = source('src/renderer/components/LyricPage.vue')
  const rainbow = source('src/renderer/assets/css/rainbow-theme.scss')

  expect(player).toContain('class="player-button close-button rainbow-player-collapse"')
  expect(rainbow).toContain('.close-button.rainbow-player-collapse')
  expect(rainbow).toContain('--player-rainbow-hue: var(--player-rainbow-violet);')

  const actions = [
    { cls: 'rainbow-lyric-advance', icon: 'back5s', hue: 'rose', handler: 'setOffset(+0.5, $event)' },
    { cls: 'rainbow-lyric-recovery', icon: 'recovery', hue: 'green', handler: 'setOffset(0)' },
    { cls: 'rainbow-lyric-delay', icon: 'forward5s', hue: 'orange', handler: 'setOffset(-0.5, $event)' }
  ]
  for (const action of actions) {
    expect(lyrics).toContain(action.cls)
    expect(lyrics).toContain(`icon-class="${action.icon}"`)
    expect(lyrics).toContain(action.handler)
    expect(rainbow).toContain(`.offset > .${action.cls} {`)
    expect(rainbow).toContain(`--player-rainbow-hue: var(--player-rainbow-${action.hue});`)
  }
})

test('timing controls use themed icons, contrast and focus without disturbing other themes', () => {
  const rainbow = source('src/renderer/assets/css/rainbow-theme.scss')
  const block = rainbow.slice(
    rainbow.indexOf('/* Three lyric timing controls beside the fullscreen lyrics'),
    rainbow.indexOf('/* Small, themed feedback without adding persistent shadows')
  )
  expect(block).toContain(":root[data-accent-theme='rainbow']")
  expect(block).toContain('.rainbow-lyric-advance,')
  expect(block).toContain('.rainbow-lyric-recovery,')
  expect(block).toContain('.rainbow-lyric-delay')
  expect(block).toContain('color: var(--player-rainbow-hue) !important;')
  expect(block).toContain('opacity: 0.94 !important;')
  expect(block).toContain(':focus-visible')
  expect(block).not.toContain('setOffset(')
})
