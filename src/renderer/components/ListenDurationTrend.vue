<template>
  <section class="daily-trend">
    <div class="daily-trend-header">
      <div>
        <h3>{{ t('insights.footprint.sevenDayTrendTitle') }}</h3>
        <p>{{ t('insights.footprint.sevenDayTrendHelp') }}</p>
      </div>
      <div class="daily-trend-selection" aria-live="polite">
        <span>{{ selectedPoint ? formatDate(selectedPoint.dateKey) : '—' }}</span>
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
            {{ Math.round(tick) }}m
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
            v-if="point.seconds !== null"
            :cx="pointX(index)"
            :cy="pointY(point.seconds / 60)"
            :r="selectedPoint?.dateKey === point.dateKey ? 6.5 : 5"
            class="trend-dot"
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
          <text :x="pointX(index)" y="193" text-anchor="middle" class="trend-date">
            {{ formatDate(point.dateKey) }}
          </text>
        </g>
      </svg>
    </div>
    <p class="daily-trend-note">{{ t('insights.footprint.sevenDayTrendNote') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NeteaseDailyListenPoint } from '../utils/neteaseListenTrend'

const props = defineProps<{ points: NeteaseDailyListenPoint[] }>()
const { t } = useI18n()

const left = 58
const right = 730
const top = 18
const bottom = 162
const selectedDate = ref<string | null>(null)

const selectedPoint = computed(
  () =>
    props.points.find((point) => point.dateKey === selectedDate.value) ??
    props.points.at(-1)
)
const maxMinutes = computed(() => {
  const topValue = Math.max(
    0,
    ...props.points.map((point) => (point.seconds ?? 0) / 60)
  )
  return Math.max(30, Math.ceil(topValue / 30) * 30)
})
const yTicks = computed(() => [0, maxMinutes.value / 2, maxMinutes.value])
const pointX = (index: number): number =>
  left + (index * (right - left)) / Math.max(1, props.points.length - 1)
const pointY = (minutes: number): number =>
  bottom - (minutes / maxMinutes.value) * (bottom - top)

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
    const y = pointY(point.seconds / 60)
    path += `${path ? ' L' : 'M'} ${x} ${y}`
  })
  if (path) segments.push(path)
  return segments
})
const formatDate = (key: string): string => key.slice(5).replace('-', '/')
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

.daily-trend-header p,
.daily-trend-note {
  margin: 0;
  color: var(--color-text);
  opacity: 0.6;
  font-size: 12px;
  line-height: 1.55;
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

.trend-dot:focus-visible {
  outline: none;
  fill: var(--color-primary);
  stroke-width: 4;
}

.trend-unavailable {
  stroke: var(--color-text);
  stroke-opacity: 0.35;
  stroke-width: 2;
  stroke-linecap: round;
}

.daily-trend-note {
  margin-top: 3px;
}
</style>
