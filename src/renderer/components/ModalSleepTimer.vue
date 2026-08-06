<template>
  <BaseModal
    :show="sleepTimerModalVisible"
    :title="text.title"
    width="24vw"
    min-width="calc(min(22rem, 92vw))"
    :close-fn="close"
  >
    <template #default>
      <section class="sleep-timer-section" :aria-label="text.quickTimes">
        <div class="section-label">{{ text.quickTimes }}</div>
        <div class="quick-time-grid">
          <button
            v-for="minutes in quickMinuteOptions"
            :key="minutes"
            type="button"
            class="quick-time-button"
            :class="{ active: selectedOption === minutes }"
            @click="selectQuickTime(minutes)"
          >
            <span class="quick-time-value">{{ minutes }}</span>
            <span class="quick-time-unit">{{ text.minutes }}</span>
          </button>
        </div>
      </section>

      <section class="sleep-timer-section custom-section">
        <label
          class="custom-time-row"
          :class="{
            active: selectedOption === 'custom',
            invalid: customMinutesInvalid && customMinutesTouched
          }"
        >
          <span class="custom-time-label">{{ text.customTime }}</span>
          <span class="custom-time-input-wrap">
            <input
              v-model.number="customMinutes"
              type="number"
              inputmode="numeric"
              min="1"
              max="1440"
              step="1"
              :aria-label="text.customTime"
              @focus="selectCustomTime"
              @input="selectCustomTime"
              @blur="customMinutesTouched = true"
              @keydown.enter.prevent="start"
            />
            <span>{{ text.minutes }}</span>
          </span>
        </label>
        <div
          v-if="selectedOption === 'custom' && customMinutesInvalid && customMinutesTouched"
          class="custom-time-error"
          role="alert"
        >
          {{ text.customRange }}
        </div>
      </section>

      <button
        type="button"
        class="track-end-option"
        :class="{ active: selectedOption === 'trackEnd' }"
        @click="selectedOption = 'trackEnd'"
      >
        <span class="track-end-copy">
          <span class="track-end-title">{{ text.trackTitle }}</span>
          <span class="track-end-description">{{ text.trackDescription }}</span>
        </span>
        <span class="selection-indicator" aria-hidden="true"></span>
      </button>

      <div class="sleep-timer-status" :class="{ active: sleepTimerActive }" role="status">
        <span class="status-dot" aria-hidden="true"></span>
        <span class="status-value">{{ statusText }}</span>
      </div>
    </template>

    <template #footer>
      <div class="sleep-timer-footer">
        <button v-if="sleepTimerActive" type="button" class="cancel-button" @click="cancel">
          {{ text.cancel }}
        </button>
        <button
          type="button"
          class="primary start-button"
          :disabled="selectedOption === 'custom' && customMinutesInvalid"
          @click="start"
        >
          {{ sleepTimerActive ? text.replace : text.start }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import {
  cancelSleepTimer,
  sleepTimerActive,
  sleepTimerModalVisible,
  sleepTimerMode,
  sleepTimerNotice,
  sleepTimerRemainingSeconds,
  startSleepTimer,
  type SleepTimerSelection
} from '../utils/sleepTimerSettings'
import { resolveFeatureLanguage } from '../utils/v327FeatureShared'

type SleepTimerChoice = '15' | '30' | '60' | '90' | 'custom' | 'trackEnd'

const CUSTOM_MINUTES_STORAGE_KEY = 'vutronmusic-sleep-timer-custom-minutes'
const MIN_CUSTOM_MINUTES = 1
const MAX_CUSTOM_MINUTES = 1440

const TEXTS = {
  zh: {
    title: '睡眠定时器',
    quickTimes: '快捷时间',
    minutes: '分钟',
    customTime: '自定义',
    customRange: '请输入 1–1440 分钟之间的整数',
    inactive: '未启用',
    countdown: '剩余 {time}',
    waitingTrack: '当前歌曲结束后暂停',
    completed: '已按计划暂停播放',
    canceledByTrackChange: '手动切歌，定时已取消',
    noTrack: '当前没有可播放的歌曲',
    start: '启用',
    replace: '替换当前定时',
    cancel: '取消定时',
    trackTitle: '当前歌曲结束后',
    trackDescription: '播完即暂停，不继续下一首'
  },
  zht: {
    title: '睡眠定時器',
    quickTimes: '快速時間',
    minutes: '分鐘',
    customTime: '自訂',
    customRange: '請輸入 1–1440 分鐘之間的整數',
    inactive: '未啟用',
    countdown: '剩餘 {time}',
    waitingTrack: '目前歌曲結束後暫停',
    completed: '已依計畫暫停播放',
    canceledByTrackChange: '手動切歌，定時已取消',
    noTrack: '目前沒有可播放的歌曲',
    start: '啟用',
    replace: '取代目前定時',
    cancel: '取消定時',
    trackTitle: '目前歌曲結束後',
    trackDescription: '播完即暫停，不繼續下一首'
  },
  en: {
    title: 'Sleep Timer',
    quickTimes: 'Quick times',
    minutes: 'min',
    customTime: 'Custom',
    customRange: 'Enter a whole number from 1 to 1440 minutes.',
    inactive: 'Inactive',
    countdown: '{time} remaining',
    waitingTrack: 'Pause after the current track',
    completed: 'Playback paused as scheduled',
    canceledByTrackChange: 'Timer canceled after a manual track change',
    noTrack: 'No track is currently available',
    start: 'Start',
    replace: 'Replace timer',
    cancel: 'Cancel timer',
    trackTitle: 'After current track',
    trackDescription: 'Pause when this track ends'
  }
} as const

const readStoredCustomMinutes = (): number => {
  const value = Number(localStorage.getItem(CUSTOM_MINUTES_STORAGE_KEY) || 45)
  return Number.isInteger(value) && value >= MIN_CUSTOM_MINUTES && value <= MAX_CUSTOM_MINUTES
    ? value
    : 45
}

const quickMinuteOptions = ['15', '30', '60', '90'] as const
const selectedOption = ref<SleepTimerChoice>('30')
const customMinutes = ref(readStoredCustomMinutes())
const customMinutesTouched = ref(false)
const text = computed(() => TEXTS[resolveFeatureLanguage()])

const customMinutesInvalid = computed(
  () =>
    !Number.isInteger(customMinutes.value) ||
    customMinutes.value < MIN_CUSTOM_MINUTES ||
    customMinutes.value > MAX_CUSTOM_MINUTES
)

watch(customMinutes, (value) => {
  if (!Number.isInteger(value) || value < MIN_CUSTOM_MINUTES || value > MAX_CUSTOM_MINUTES) return
  localStorage.setItem(CUSTOM_MINUTES_STORAGE_KEY, String(value))
})

watch(sleepTimerModalVisible, (visible) => {
  if (!visible) return

  customMinutesTouched.value = false
  if (sleepTimerMode.value === 'trackEnd') {
    selectedOption.value = 'trackEnd'
    return
  }

  if (sleepTimerMode.value === 'minutes') {
    const remainingMinutes = Math.max(1, Math.ceil(sleepTimerRemainingSeconds.value / 60))
    const quickValue = String(remainingMinutes) as SleepTimerChoice
    if (quickMinuteOptions.includes(quickValue as (typeof quickMinuteOptions)[number])) {
      selectedOption.value = quickValue
    } else {
      customMinutes.value = Math.min(MAX_CUSTOM_MINUTES, remainingMinutes)
      selectedOption.value = 'custom'
    }
  }
})

const formatDuration = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  const minuteText = minutes.toString().padStart(2, '0')
  const secondText = remainingSeconds.toString().padStart(2, '0')

  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minuteText}:${secondText}`
    : `${minuteText}:${secondText}`
}

const statusText = computed(() => {
  if (sleepTimerMode.value === 'minutes') {
    return text.value.countdown.replace('{time}', formatDuration(sleepTimerRemainingSeconds.value))
  }
  if (sleepTimerMode.value === 'trackEnd') return text.value.waitingTrack

  const noticeMap = {
    inactive: text.value.inactive,
    countdown: text.value.inactive,
    waitingTrack: text.value.inactive,
    completed: text.value.completed,
    canceledByTrackChange: text.value.canceledByTrackChange,
    noTrack: text.value.noTrack
  }
  return noticeMap[sleepTimerNotice.value]
})

const selectQuickTime = (minutes: (typeof quickMinuteOptions)[number]) => {
  selectedOption.value = minutes
  customMinutesTouched.value = false
}

const selectCustomTime = () => {
  selectedOption.value = 'custom'
}

const close = () => {
  sleepTimerModalVisible.value = false
}

const start = () => {
  let selection: SleepTimerSelection

  if (selectedOption.value === 'custom') {
    customMinutesTouched.value = true
    if (customMinutesInvalid.value) return
    selection = customMinutes.value
  } else {
    selection = selectedOption.value
  }

  if (startSleepTimer(selection)) close()
}

const cancel = () => {
  cancelSleepTimer()
}
</script>

<style scoped lang="scss">
.sleep-timer-section {
  margin-bottom: 12px;
}

.section-label {
  margin-bottom: 7px;
  color: color-mix(in srgb, var(--color-text), transparent 42%);
  font-size: 12px;
  font-weight: 600;
}

.quick-time-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.quick-time-button {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 3px;
  min-height: 42px;
  padding: 7px 5px;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
  border-radius: 9px;
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);
  transition:
    border-color 0.16s,
    background-color 0.16s,
    transform 0.16s;

  &:hover {
    border-color: color-mix(in srgb, var(--color-primary), transparent 42%);
  }

  &:active {
    transform: scale(0.97);
  }

  &.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary), transparent 89%);
  }
}

.quick-time-value {
  font-size: 15px;
  font-weight: 650;
}

.quick-time-unit {
  color: color-mix(in srgb, var(--color-text), transparent 43%);
  font-size: 10px;
}

.custom-section {
  margin-bottom: 10px;
}

.custom-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
  border-radius: 9px;
  background: var(--color-secondary-bg-for-transparent);
  transition:
    border-color 0.16s,
    background-color 0.16s;

  &.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary), transparent 91%);
  }

  &.invalid {
    border-color: #d44;
  }
}

.custom-time-label {
  font-size: 13px;
  font-weight: 600;
}

.custom-time-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  color: color-mix(in srgb, var(--color-text), transparent 38%);
  font-size: 12px;

  input {
    width: 68px;
    height: 30px;
    box-sizing: border-box;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    outline: none;
    color: var(--color-text);
    background: color-mix(in srgb, var(--color-text), transparent 93%);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    text-align: right;

    &:focus {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary), transparent 55%);
    }
  }
}

.custom-time-error {
  margin-top: 5px;
  color: #d44;
  font-size: 11px;
}

.track-end-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
  border-radius: 9px;
  text-align: left;
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);
  transition:
    border-color 0.16s,
    background-color 0.16s;

  &:hover {
    border-color: color-mix(in srgb, var(--color-primary), transparent 42%);
  }

  &.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary), transparent 89%);

    .selection-indicator {
      border-color: var(--color-primary);
      box-shadow: inset 0 0 0 4px var(--color-primary);
    }
  }
}

.track-end-copy,
.track-end-title,
.track-end-description {
  display: block;
}

.track-end-title {
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 650;
}

.track-end-description {
  color: color-mix(in srgb, var(--color-text), transparent 43%);
  font-size: 11px;
  line-height: 1.3;
}

.selection-indicator {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 62%);
  border-radius: 50%;
  transition:
    border-color 0.16s,
    box-shadow 0.16s;
}

.sleep-timer-status {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 20px;
  margin-top: 11px;
  color: color-mix(in srgb, var(--color-text), transparent 42%);
  font-size: 11px;

  &.active {
    color: var(--color-primary);

    .status-dot {
      background: var(--color-primary);
    }
  }
}

.status-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-text), transparent 62%);
}

.status-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sleep-timer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

.cancel-button,
.start-button {
  min-width: 88px;
}

.start-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

@media (max-width: 480px) {
  .quick-time-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
