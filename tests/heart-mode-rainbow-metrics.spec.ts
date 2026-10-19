import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('three session metric cards and matching percentage values use separate rainbow roles', () => {
  const view = file('src/renderer/components/HeartModeAssistant.vue')
  const theme = file('src/renderer/assets/css/rainbow-theme.scss')
  for (const name of ['novelty', 'diversity', 'familiarity']) {
    expect(view).toContain(`rainbow-heart-metric rainbow-heart-metric-${name}`)
    expect(theme).toContain(`.rainbow-heart-metric-${name}`)
  }
  expect(theme).toContain(":root[data-accent-theme='rainbow'] .heart-mode-assistant")
  expect(theme).toContain('background: color-mix(in srgb, var(--heart-metric-hue) 15%')
  expect(theme).toContain('.metrics > .rainbow-heart-metric strong')
  expect(theme).toContain('color: var(--heart-metric-hue)')
  expect(theme).toContain('.metrics > .rainbow-heart-metric span')
  expect(theme).toContain('opacity: 1;')
})

test('current session queue counts have colored numbers but retain semantic labels', () => {
  const view = file('src/renderer/components/HeartModeAssistant.vue')
  const theme = file('src/renderer/assets/css/rainbow-theme.scss')
  expect(view).toContain("session.playedTrackIDs.length")
  expect(view).toContain("session.enqueuedTrackIDs.length")
  expect(view).toContain("session.pendingTrackIDs.length")
  for (const name of ['played', 'queued', 'pending']) {
    expect(view).toContain(`rainbow-heart-count rainbow-heart-count-${name}`)
    expect(theme).toContain(`.rainbow-heart-count-${name}`)
  }
  expect(theme).toContain('.queue-summary .rainbow-heart-count strong')
  expect(theme).toContain('color: var(--heart-count-hue)')
  expect(theme).toContain("opacity: 1;")
})
