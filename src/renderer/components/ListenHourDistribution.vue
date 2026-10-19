<template>
  <section class="listening-hours">
    <div class="listening-hours-header">
      <h3>{{ t('insights.footprint.hourDistributionTitle') }}</h3>
      <strong>{{ t('insights.footprint.hourDistributionTotal', { duration: formatDuration(total) }) }}</strong>
    </div>
    <div class="listening-hours-scroll">
      <svg viewBox="0 0 760 210" role="img" :aria-label="t('insights.footprint.hourDistributionTitle')">
        <title>{{ t('insights.footprint.hourDistributionTitle') }}</title>
        <g v-for="tick in [0, 0.5, 1]" :key="tick">
          <line x1="57" x2="735" :y1="bottom - tick * plotHeight" :y2="bottom - tick * plotHeight" class="hour-grid" />
          <text x="49" :y="bottom - tick * plotHeight + 4" text-anchor="end" class="hour-axis">
            {{ formatHours(maxSeconds * tick) }}
          </text>
        </g>
        <g v-for="(seconds, hour) in hours" :key="hour">
          <rect
            :x="barX(hour)"
            :y="barY(seconds)"
            width="19"
            :height="Math.max(0, bottom - barY(seconds))"
            rx="4"
            class="hour-bar"
            :class="{ selected: selectedHour === hour }"
            tabindex="0"
            role="button"
            :aria-label="hourLabel(hour, seconds)"
            @mouseenter="selectedHour = hour"
            @focus="selectedHour = hour"
            @click="selectedHour = hour"
            @keydown.enter.prevent="selectedHour = hour"
          >
            <title>{{ hourLabel(hour, seconds) }}</title>
          </rect>
          <text v-if="hour % 3 === 0" :x="barX(hour) + 9.5" y="185" text-anchor="middle" class="hour-axis">
            {{ String(hour).padStart(2, '0') }}
          </text>
        </g>
      </svg>
    </div>
    <div class="listening-hours-footer">
      <span>{{ t('insights.footprint.hourDistributionLocalOnly') }}</span>
      <strong>{{ selectedHour === null ? '' : hourLabel(selectedHour, hours[selectedHour] || 0) }}</strong>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ hours: number[] }>()
const { t } = useI18n()
const selectedHour = ref<number | null>(null)
const total = computed(() => props.hours.reduce((sum, value) => sum + Math.max(0, value || 0), 0))
const maxSeconds = computed(() => Math.max(900, ...props.hours.map((value) => Math.max(0, value || 0))))
const bottom = 158
const plotHeight = 135
const barX = (hour: number) => 61 + hour * 28
const barY = (seconds: number) => bottom - Math.max(0, seconds) / maxSeconds.value * plotHeight
const formatHours = (seconds: number) => `${Number((seconds / 3600).toFixed(1))}h`
const formatDuration = (seconds: number) => {
  const minutes = Math.round(Math.max(0, seconds) / 60)
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}
const hourLabel = (hour: number, seconds: number) =>
  `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00 · ${formatDuration(seconds)}`
</script>

<style scoped lang="scss">
.listening-hours {
  margin-top: 16px;
  border-radius: 16px;
  background: var(--color-secondary-bg);
  padding: 18px 20px 12px;
}
.listening-hours-header, .listening-hours-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.listening-hours-header h3 { margin: 0; font-size: 16px; }
.listening-hours-header strong { font-size: 13px; color: var(--color-primary); font-variant-numeric: tabular-nums; }
.listening-hours-scroll { overflow-x: auto; }
.listening-hours-scroll svg { width: 100%; min-width: 620px; display: block; }
.hour-grid { stroke: var(--color-text); stroke-opacity: 0.12; stroke-dasharray: 3 5; }
.hour-axis { fill: var(--color-text); opacity: 0.65; font-size: 12px; }
.hour-bar { fill: color-mix(in srgb, var(--color-primary) 54%, transparent); cursor: pointer; }
.hour-bar:hover, .hour-bar.selected { fill: var(--color-primary); }
.listening-hours-footer { font-size: 12px; color: var(--color-text); opacity: 0.72; }
.listening-hours-footer strong { font-variant-numeric: tabular-nums; }
</style>
