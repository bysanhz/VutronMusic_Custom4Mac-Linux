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

test('bars and dots share preview, pin, toggle and keyboard actions', () => {
  const view = readSource('src/renderer/components/ListenDurationTrend.vue')
  const barStart = view.indexOf('class="trend-bar-group"')
  const dotStart = view.indexOf('class="trend-dot"')
  const barArea = view.slice(barStart, dotStart)
  const dotArea = view.slice(dotStart, view.indexOf('class="trend-unavailable"', dotStart))

  expect(barStart).toBeGreaterThan(-1)
  expect(dotStart).toBeGreaterThan(barStart)
  expect(barArea).toContain('<template v-if="point.seconds !== null">')
  expect(barArea).toContain('class="trend-bar"')
  expect(barArea).toContain('class="trend-bar-hit"')
  expect(barArea).toContain(':height="Math.max(18, bottom - barTop(point.seconds))"')

  const handlers = [
    '@focus="previewFocusedDate(point.dateKey, $event)"',
    '@blur="clearFocusedDate(point.dateKey)"',
    '@mouseenter="previewPointerDate(point.dateKey)"',
    '@click="togglePointerPin(point.dateKey)"',
    '@keydown.enter.prevent="toggleKeyboardPin(point.dateKey)"',
    '@keydown.space.prevent="toggleKeyboardPin(point.dateKey)"'
  ]
  for (const handler of handlers) {
    expect(barArea).toContain(handler)
    expect(dotArea).toContain(handler)
  }
  expect(barArea).toContain(':aria-pressed="pinnedDate === point.dateKey"')
  expect(dotArea).toContain(':aria-pressed="pinnedDate === point.dateKey"')
  expect(barArea).toContain('role="button"')
  expect(dotArea).toContain('role="button"')
  expect(view).toContain('@mouseleave="clearPointerPreview"')
  expect(view).toContain('@pointerdown.capture="beginPointerInteraction"')
  expect(view).toContain('role="group"')
  expect(view).toContain('class="daily-trend-selection"')
  expect(view).toContain('selected: selectedPoint?.dateKey === point.dateKey')
  expect(view).toContain('pinned: pinnedDate === point.dateKey')
})

test('hover is transient, pin persists and a second click removes pin without stale hover', () => {
  const view = readSource('src/renderer/components/ListenDurationTrend.vue')
  expect(view).toContain('const hoveredDate = ref<string | null>(null)')
  expect(view).toContain('const focusedDate = ref<string | null>(null)')
  expect(view).toContain('const pinnedDate = ref<string | null>(null)')
  expect(view).toContain('const suppressedHoverDate = ref<string | null>(null)')
  expect(view).toContain('const suppressedFocusDate = ref<string | null>(null)')
  expect(view).toContain('hoveredDate.value = null')
  expect(view).toContain('suppressedHoverDate.value = isUnpinning ? dateKey : null')
  expect(view).toContain('hoveredDate.value = isUnpinning ? null : dateKey')
  expect(view).toContain('focusedDate.value = isUnpinning ? null : dateKey')
  expect(view).toContain("target.matches(':focus-visible')")
  expect(view).toContain('resolveTrendDisplayDate(')
  expect(view).toContain('toggleTrendPinnedDate(pinnedDate.value, dateKey)')
  expect(view).toContain("props.points.map((point) => point.dateKey).join('|')")
  expect(view).toContain('if (pinnedDate.value && !dates.has(pinnedDate.value)) pinnedDate.value = null')
})

test('bar hit targets are invisible, accessible and preserve rainbow styling', () => {
  const view = readSource('src/renderer/components/ListenDurationTrend.vue')
  const rainbow = readSource('src/renderer/assets/css/rainbow-theme.scss')
  expect(view).toContain('.trend-bar-hit {')
  expect(view).toContain('fill: transparent;')
  expect(view).toContain('pointer-events: all;')
  expect(view).toContain('cursor: pointer;')
  expect(view).toContain('.trend-bar-group:focus-within .trend-bar')
  expect(view).toContain('.trend-bar-hit:focus-visible')
  expect(view).toContain('class="trend-today-halo"')
  expect(view).toContain('.trend-bar.pinned')
  expect(view).toContain('.trend-dot.pinned')
  expect(view).toContain('class="trend-line"')
  expect(view).toContain('class="trend-average"')
  expect(rainbow).toContain(".daily-trend .trend-bar.selected")
  expect(rainbow).toContain(".daily-trend .trend-bar.today")
})
