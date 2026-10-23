import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

test('all seven chart positions share their day color across columns, labels and selected summary', () => {
  const view = readSource('src/renderer/components/ListenDurationTrend.vue')
  const css = readSource('src/renderer/assets/css/rainbow-theme.scss')

  expect(view).toContain("'--rainbow-chart-day': `var(--rainbow-day-${index + 1})`")
  expect(view).toContain("'--rainbow-chart-day': selectedDayColor")
  expect(view).toContain("props.points.findIndex((point) => point.dateKey === selectedPoint.value?.dateKey)")
  expect(view).toContain("index >= 0 ? `var(--rainbow-day-${index + 1})`")
  expect(view).toContain('class="trend-bar-value"')
  expect(view).toContain('class="trend-date"')
  expect(css).toContain('.daily-trend .trend-bar-value {')
  expect(css).toContain('.daily-trend .trend-date,')
  expect(css).toContain('fill: var(--rainbow-chart-day) !important;')
  expect(css).toContain('.daily-trend .daily-trend-selection > span')
  expect(css).toContain('.daily-trend .daily-trend-selection > strong')
  expect(css).toContain('color: var(--rainbow-chart-day) !important;')
})

test('y-axis numbers are hidden but reference lines and average indicator are preserved', () => {
  const view = readSource('src/renderer/components/ListenDurationTrend.vue')
  const gridStart = view.indexOf('<g v-for="tick in yTicks"')
  const gridEnd = view.indexOf('</g>', gridStart)
  const gridMarkup = view.slice(gridStart, gridEnd)

  expect(gridStart).toBeGreaterThan(-1)
  expect(gridMarkup).toContain('class="trend-grid"')
  expect(gridMarkup).toContain('pointY(tick)')
  expect(gridMarkup).not.toContain('<text')
  expect(view).not.toContain('class="trend-scale"')
  expect(view).toContain('const yTicks = computed(() => [0, axisStepHours.value, maxHours.value])')
  expect(view).toContain('class="trend-average"')
  expect(view).toContain('class="trend-line"')
  expect(view).toContain('const left = 42')
})

test('daily colors are scoped to rainbow mode and today retains distinct emphasis', () => {
  const css = readSource('src/renderer/assets/css/rainbow-theme.scss')
  const view = readSource('src/renderer/components/ListenDurationTrend.vue')
  expect(css).toContain(":root[data-accent-theme='rainbow'] #app .daily-trend .trend-date")
  expect(css).toContain(":root[data-accent-theme='rainbow'] #app .daily-trend .trend-average")
  expect(view).toContain('class="trend-today-halo"')
  expect(view).toContain('today: index === points.length - 1')
  expect(view).toContain('selected: selectedPoint?.dateKey === point.dateKey')
})
