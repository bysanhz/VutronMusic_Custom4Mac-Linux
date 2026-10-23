import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const mono = () => source('src/renderer/assets/css/monochrome-theme.scss')

test('solid palettes and custom accent share one theme without changing rainbow styles', () => {
  const css = mono()
  const settings = source('src/renderer/store/settings.ts')
  const entry = source('src/renderer/main.ts')

  expect(entry).toContain("import './assets/css/rainbow-theme.scss'")
  expect(entry).toContain("import './assets/css/monochrome-theme.scss'")
  expect(entry.indexOf("import './assets/css/monochrome-theme.scss'"))
    .toBeGreaterThan(entry.indexOf("import './assets/css/rainbow-theme.scss'"))

  for (const name of ['blue', 'purple', 'orange', 'cyan', 'green', 'red', 'pink', 'gold', 'Customize']) {
    expect(settings).toContain(`name: '${name}'`)
  }
  expect(settings).toContain("selectedColor?.name === 'rainbow'")
  expect(settings).toContain("document.documentElement.removeAttribute('data-accent-theme')")
  expect(css).toContain(":root:not([data-accent-theme='rainbow'])")
  expect(css).toContain('--mono-accent-ink: color-mix(in srgb, var(--color-primary)')
  expect(css).not.toContain(":root[data-accent-theme='rainbow']")
  expect(css).not.toContain('--rainbow-1:')
})

test('sidebar, web tabs and Explore controls share the active monochrome palette', () => {
  const css = mono()
  for (const selector of [
    '.side-nav > .rainbow-nav',
    'nav .rainbow-explore-tabs > .rainbow-explore-tab',
    '.explore-page .rainbow-explore-filter > .button',
    '.rainbow-web-tab',
    '.system-settings .slideBar > .rainbow-settings-tab'
  ]) {
    expect(css).toContain(selector)
  }
  expect(css).toContain('box-shadow: inset 0 -3px var(--mono-accent-ink)')
  expect(css).toContain(':is(.active, .playHistory-button--selected)')
  expect(css).toContain(':is(:hover, :focus-visible)')
})

test('dark-mode monochrome controls have colored faces and neutral lower shadows', () => {
  const css = mono()
  expect(css).toContain(":root:not([data-accent-theme='rainbow']) body[data-theme='dark']")
  expect(css).toContain('--mono-accent-face: color-mix(in srgb, var(--mono-accent-ink) 78%')
  expect(css).toContain('color: #20242a !important;')
  expect(css).toContain('background: var(--mono-accent-face) !important;')
  expect(css).toContain('inset 0 -3px #60636b')
  expect(css).toContain('inset 0 -4px #54575f')
  expect(css).toContain('.side-nav > .rainbow-nav .icon')
})

test('app controls and charts follow the solid hue while fullscreen actions remain neutral', () => {
  const css = mono()
  for (const needle of [
    '.rainbow-metric-card', '.rainbow-surface-hero',
    '.rainbow-surface-overview', '.rainbow-surface-profile',
    '.daily-trend .trend-average', '.rainbow-skip-control',
    '.rainbow-queue-control', '.playback-speed-button',
    '.sleep-timer-button', '.rainbow-lyric-advance',
    '.rainbow-lyric-recovery', '.rainbow-lyric-delay'
  ]) {
    expect(css).toContain(needle)
  }
  expect(css).toContain('var(--mono-accent-ink)')
  expect(css).toContain('var(--mono-glass)')
  expect(css).toContain('@media (prefers-reduced-motion: reduce)')
})

test('bottom player buttons have no background in solid themes, including hover and active states', () => {
  const css = mono()
  const bottom = css.slice(
    css.indexOf('/* Bottom-player icons retain the chosen solid hue'),
    css.indexOf('/* Solid-color themes: fullscreen song detail buttons')
  )
  const player = source('src/renderer/components/PlayerBar.vue')
  const icon = source('src/renderer/components/ButtonIcon.vue')
  const sleep = source('src/renderer/components/SleepTimerButton.vue')
  const speed = source('src/renderer/components/PlaybackSpeedButton.vue')

  expect(bottom).toContain(":root:not([data-accent-theme='rainbow'])")
  expect(bottom).toContain('#app .player .controls .button-icon')
  expect(bottom).toContain('background: transparent !important')
  expect(bottom).toContain('background-image: none !important')
  expect(bottom).toContain('border-color: transparent !important')
  expect(bottom).toContain('box-shadow: none !important')
  expect(bottom).toContain(':hover, :focus-visible, :active, .active, .liked, .rainbow-enabled')
  expect(bottom).toContain('.is-active, .is-adjusted, .disabled')
  expect(bottom).toContain('outline: 2px solid var(--mono-accent-ink)')
  expect(bottom).toContain('color: var(--mono-accent-ink) !important')
  expect(bottom).not.toContain('background: color-mix')
  expect(player).toContain('<div class="controls"')
  expect(player).toContain('class="rainbow-queue-control"')
  expect(player).toContain('class="rainbow-repeat-control"')
  expect(player).toContain('class="rainbow-shuffle-control"')
  expect(icon).toContain('class="button-icon"')
  expect(sleep).toContain('class="sleep-timer-button"')
  expect(speed).toContain('class="playback-speed-button"')
  // The rule applies only to buttons, never to the player bar, seek track,
  // floating volume slider or other themed surfaces.
  expect(bottom).not.toContain('.player .progress-bar')
  expect(bottom).not.toContain('.volume-slider')
})

test('fullscreen player buttons have neutral icons and no background in solid themes', () => {
  const css = mono()
  const start = css.indexOf('/* Solid-color themes: fullscreen song detail buttons')
  const end = css.indexOf('/* Honor the system\'s reduced-motion request')
  const fullscreen = css.slice(start, end)
  const main = css.slice(0, start)

  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  expect(fullscreen).toContain('--mono-player-ink: var(--color-text)')
  expect(fullscreen).not.toContain('--mono-player-glass')
  expect(fullscreen).not.toContain('var(--mono-accent-ink)')
  expect(fullscreen).not.toContain('var(--color-primary)')
  expect(fullscreen).not.toContain('var(--rainbow-1)')
  for (const selector of [
    '.play-page .top-right .buttons > .button-icon',
    '.play-page .top-right .buttons > .transPro',
    '.play-page .media-controls .button-icon',
    '.creative-page .player-media-control .button-icon',
    '.buttons-icons .player-button',
    '.lyric-wrapper .offset > :is(.rainbow-lyric-advance, .rainbow-lyric-recovery, .rainbow-lyric-delay)'
  ]) {
    expect(fullscreen).toContain(selector)
  }
  expect(fullscreen).toContain('background: none !important')
  expect(fullscreen).toContain('background-image: none !important')
  expect(fullscreen).toContain('border-color: transparent !important')
  expect(fullscreen).toContain('box-shadow: none !important')
  expect(fullscreen).toContain('backdrop-filter: none !important')
  expect(fullscreen).toContain('color: var(--mono-player-ink) !important')
  expect(fullscreen).toContain('):focus-visible {')
  expect(fullscreen).toContain('outline: 2px solid var(--mono-player-ink) !important')
  expect(fullscreen).toContain('opacity: 0.42 !important')
  expect(fullscreen).toContain('color: var(--color-like) !important')
  expect(main).toContain('color: var(--mono-accent-ink) !important')
})

test('liked heart, danger actions and connection quality remain semantic', () => {
  const css = mono()
  const semantic = source('src/renderer/assets/css/interaction-theme.scss')
  const side = source('src/renderer/components/SideNav.vue')

  expect(css).toContain('.like-button:not(.liked):not(.disabled)')
  expect(css).toContain('.like-button.liked:not(.disabled)')
  expect(css).toContain('color: var(--color-like) !important;')
  expect(css).toContain('.like-button.liked:not(.disabled) .svg-icon')
  expect(css).toContain('.button-icon.disabled')
  expect(css).toContain('.heart-mode-assistant .rainbow-heart-tab')
  expect(semantic).toContain('--color-danger: #d9534f;')
  expect(semantic).toContain('#app .shade .modal button.danger')
  expect(side).toContain('&.good .network-indicator')
  expect(side).toContain('&.fair .network-indicator')
  expect(side).toContain('&.offline .network-indicator')
  expect(css).not.toContain('.network-indicator {')
})

test('every built-in solid preset keeps readable text against its light and dark chips', () => {
  const css = mono()
  const settings = source('src/renderer/store/settings.ts')
  const lightPercentage = Number(
    css.match(/--mono-accent-ink: color-mix\(in srgb, var\(--color-primary\) (\d+)%, #18212e\)/)?.[1]
  ) / 100
  const darkPercentage = Number(
    css.match(/--mono-accent-ink: color-mix\(in srgb, var\(--color-primary\) (\d+)%, #fff\)/)?.[1]
  ) / 100
  const darkFacePercentage = Number(
    css.match(/--mono-accent-face: color-mix\(in srgb, var\(--mono-accent-ink\) (\d+)%, var\(--color-secondary-bg\)\)/)?.[1]
  ) / 100
  const mix = (a: number[], b: number[], amount: number) =>
    a.map((value, index) => value * amount + b[index] * (1 - amount))
  const luminance = (rgb: number[]) =>
    rgb.map((v) => v / 255)
      .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0)
  const contrast = (a: number[], b: number[]) => {
    const first = luminance(a)
    const second = luminance(b)
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  }

  expect(lightPercentage).toBeGreaterThan(0)
  expect(darkPercentage).toBeGreaterThan(0)
  expect(darkFacePercentage).toBeGreaterThan(0)

  const colors = [...settings.matchAll(
    /\{ name: '(blue|purple|orange|cyan|green|red|pink|gold)', color: 'rgba\((\d+), (\d+), (\d+), 1\)'/
  )]
  expect(colors).toHaveLength(8)

  for (const match of colors) {
    const rgb = match.slice(2, 5).map(Number)
    const lightText = mix(rgb, [24, 33, 46], lightPercentage)
    const lightChip = mix(lightText, [245, 245, 247], 0.08)
    expect(contrast(lightText, lightChip), match[1] + ' light').toBeGreaterThanOrEqual(4.5)

    const darkTextAccent = mix(rgb, [255, 255, 255], darkPercentage)
    const darkChip = mix(darkTextAccent, [44, 44, 46], darkFacePercentage)
    expect(contrast([32, 36, 42], darkChip), match[1] + ' dark').toBeGreaterThanOrEqual(4.5)
  }
})
