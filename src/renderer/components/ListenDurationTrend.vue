<template>
  <section class="daily-trend">
    <div class="daily-trend-header">
      <h3>{{ t('insights.footprint.sevenDayTrendTitle') }}</h3>
      <div class="daily-trend-selection" aria-live="polite">
        <span>{{ selectedPoint ? formatFullDate(selectedPoint.dateKey) : '—' }}</span>
        <strong>{{ selectedPoint ? formatDuration(selectedPoint.seconds) : '—' }}</strong>
      </div>
    </div>
    <div class="daily-trend-scroll">
      <svg
        class="daily-trend-svg"
        viewBox="0 0 760 220"
        role="img"
        :aria-label="t('insights.footprint.sevenDayTrendTitle')"
      >
        <title>{{ t('insights.footprint.sevenDayTrendTitle') }}</title>
        <g v-for="tick in yTicks" :key="tick">
          <line
            :x1="left"
            :x2="right"
            :y1="pointY(tick)"
            :y2="pointY(tick)"
            class="trend-grid"
          />
          <text
            :x="left - 12"
            :y="pointY(tick) + 4"
            text-anchor="end"
            class="trend-scale"
          >
            {{ formatHours(tick) }}
          </text>
        </g>
        <g v-for="(point, index) in points" :key="`bar-${point.dateKey}`">
          <rect
            v-if="point.seconds !== null"
            :x="pointX(index) - barWidth / 2"
            :y="barTop(point.seconds)"
            :width="barWidth"
            :height="bottom - barTop(point.seconds)"
            rx="5"
            class="trend-bar"
            :class="{
              selected: selectedPoint?.dateKey === point.dateKey,
              today: index === points.length - 1
            }"
          />
        </g>
        <g v-if="averageSummary">
          <line
            :x1="left"
            :x2="right"
            :y1="pointY(averageSummary.seconds / 3600)"
            :y2="pointY(averageSummary.seconds / 3600)"
            class="trend-average"
          />
          <text
            :x="right"
            :y="Math.max(top + 12, pointY(averageSummary.seconds / 3600) - 9)"
            text-anchor="end"
            class="trend-average-label"
          >
            {{ averageLabel }}
          </text>
        </g>
        <path
          v-for="(path, index) in linePaths"
          :key="index"
          :d="path"
          class="trend-line"
          fill="none"
        />
        <g v-for="(point, index) in points" :key="point.dateKey">
          <circle
            v-if="point.seconds !== null && index === points.length - 1"
            :cx="pointX(index)"
            :cy="pointY(point.seconds / 3600)"
            r="11"
            class="trend-today-halo"
          />
          <circle
            v-if="point.seconds !== null"
            :cx="pointX(index)"
            :cy="pointY(point.seconds / 3600)"
            :r="index === points.length - 1 ? 7 : selectedPoint?.dateKey === point.dateKey ? 6.5 : 5"
            class="trend-dot"
            :class="{ today: index === points.length - 1 }"
            tabindex="0"
            role="button"
            :aria-label="pointAriaLabel(point)"
            @focus="selectedDate = point.dateKey"
            @mouseenter="selectedDate = point.dateKey"
            @click="selectedDate = point.dateKey"
            @keydown.enter.prevent="selectedDate = point.dateKey"
            @keydown.space.prevent="selectedDate = point.dateKey"
          >
            <title>{{ pointAriaLabel(point) }}</title>
          </circle>
          <path
            v-else
            :d="`M ${pointX(index) - 4} ${bottom} h 8`"
            class="trend-unavailable"
          />
          <text
            :x="pointX(index)"
            y="193"
            text-anchor="middle"
            class="trend-date"
            :class="{ today: index === points.length - 1 }"
          >
            {{ formatDate(point.dateKey) }}
          </text>
        </g>
      </svg>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  summarizeNeteaseSevenDayAverage,
  type NeteaseDailyListenPoint
} from '../utils/neteaseListenTrend'

const props = defineProps<{ points: NeteaseDailyListenPoint[] }>()
const { t, locale } = useI18n()

const left = 68
const right = 710
const top = 18
const bottom = 162
const selectedDate = ref<string | null>(null)

const selectedPoint = computed(
  () =>
    props.points.find((point) => point.dateKey === selectedDate.value) ??
    props.points.at(-1)
)
const averageSummary = computed(() => summarizeNeteaseSevenDayAverage(props.points))
const averageLabel = computed(() => {
  if (!averageSummary.value) return ''
  const key =
    averageSummary.value.knownDays === props.points.length
      ? 'insights.footprint.sevenDayTrendAverage'
      : 'insights.footprint.sevenDayTrendPartialAverage'
  return t(key, {
    duration: formatHours(averageSummary.value.seconds / 3600),
    days: averageSummary.value.knownDays
  })
})
const axisStepHours = computed(() => {
  const highest = Math.max(0, ...props.points.map((point) => (point.seconds ?? 0) / 3600))
  const target = Math.max(0.25, highest / 2)
  const power = 10 ** Math.floor(Math.log10(target))
  const multiplier = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= target) ?? 10
  return multiplier * power
})
const maxHours = computed(() => axisStepHours.value * 2)
const yTicks = computed(() => [0, axisStepHours.value, maxHours.value])
const barWidth = computed(() => Math.min(44, ((right - left) / Math.max(1, props.points.length)) * 0.55))
const pointX = (index: number): number =>
  left + (index * (right - left)) / Math.max(1, props.points.length - 1)
const pointY = (hours: number): number =>
  bottom - (hours / maxHours.value) * (bottom - top)
const barTop = (seconds: number): number =>
  Math.min(bottom - 2, pointY(seconds / 3600))
const formatHours = (hours: number): string => `${Number(hours.toFixed(2))}h`

// Splitting at unavailable dates prevents invented continuity across missing reports.
const linePaths = computed(() => {
  const segments: string[] = []
  let path = ''
  props.points.forEach((point, index) => {
    if (point.seconds === null) {
      if (path) segments.push(path)
      path = ''
      return
    }
    const x = pointX(index)
    const y = pointY(point.seconds / 3600)
    path += `${path ? ' L' : 'M'} ${x} ${y}`
  })
  if (path) segments.push(path)
  return segments
})
const formatDate = (key: string): string => key.slice(5).replace('-', '/')
const formatFullDate = (key: string): string => {
  const [year, month, day] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(year, month - 1, day))
}
const formatDuration = (value: number | null): string => {
  if (value === null) return t('insights.footprint.sevenDayTrendUnknown')
  const seconds = Math.max(0, Math.floor(value))
  if (seconds >= 3600) {
    return t('insights.footprint.sevenDayTrendHoursMinutes', {
      hours: Math.floor(seconds / 3600),
      minutes: Math.floor((seconds % 3600) / 60)
    })
  }
  return t('insights.footprint.sevenDayTrendMinutes', {
    minutes: Math.floor(seconds / 60)
  })
}
const pointAriaLabel = (point: NeteaseDailyListenPoint): string =>
  `${point.dateKey}: ${formatDuration(point.seconds)}`
</script>

<style scoped>
.daily-trend {
  min-width: 0;
  margin-bottom: 18px;
  padding: 18px 20px 13px;
  border-radius: 14px;
  background: var(--color-body-bg);
}

.daily-trend-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.daily-trend-header h3 {
  margin: 0 0 4px;
  font-size: 17px;
  line-height: 1.35;
}

.daily-trend-selection {
  display: grid;
  justify-items: end;
  gap: 2px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.daily-trend-selection span {
  font-size: 11px;
  opacity: 0.6;
}

.daily-trend-selection strong {
  font-size: 17px;
  color: var(--color-primary);
}

.daily-trend-scroll {
  width: 100%;
  overflow-x: auto;
}

.daily-trend-svg {
  display: block;
  width: 100%;
  min-width: 580px;
  height: auto;
  margin-top: 10px;
  overflow: visible;
}

.trend-grid {
  stroke: var(--color-text);
  stroke-opacity: 0.12;
  stroke-width: 1;
}

.trend-scale,
.trend-date {
  fill: var(--color-text);
  opacity: 0.62;
  font-size: 12px;
}

.trend-bar {
  fill: color-mix(in srgb, var(--color-primary) 24%, transparent);
  pointer-events: none;
}

.trend-bar.selected {
  fill: color-mix(in srgb, var(--color-primary) 38%, transparent);
}

/* The rightmost entry is always today in the seven-day rolling window.
   Today's emphasis is independent of hover/keyboard selection. */
.trend-bar.today,
.trend-bar.today.selected {
  fill: var(--color-primary);
  fill-opacity: 0.76;
  stroke: var(--color-primary);
  stroke-width: 1.5;
}

.trend-average {
  stroke: var(--color-primary);
  stroke-opacity: 1;
  stroke-width: 2.8;
  stroke-dasharray: 9 5;
  pointer-events: none;
}

.trend-average-label {
  fill: var(--color-primary);
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  paint-order: stroke;
  stroke: var(--color-body-bg);
  stroke-width: 5px;
  stroke-linejoin: round;
}

.trend-line {
  stroke: var(--color-primary);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trend-dot {
  fill: var(--color-body-bg);
  stroke: var(--color-primary);
  stroke-width: 3;
  cursor: pointer;
}

.trend-today-halo {
  fill: color-mix(in srgb, var(--color-primary) 20%, transparent);
  pointer-events: none;
}

.trend-dot.today {
  fill: var(--color-primary);
  stroke: var(--color-body-bg);
  stroke-width: 3;
}

.trend-dot:focus-visible {
  outline: none;
  fill: var(--color-primary);
  stroke-width: 4;
}

.trend-date.today {
  fill: var(--color-primary);
  opacity: 1;
  font-weight: 800;
}

.trend-unavailable {
  stroke: var(--color-text);
  stroke-opacity: 0.35;
  stroke-width: 2;
  stroke-linecap: round;
}

</style>
