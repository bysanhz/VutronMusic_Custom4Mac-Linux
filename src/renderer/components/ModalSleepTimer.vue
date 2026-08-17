<template>
  <BaseModal
    :show="sleepTimerModalVisible"
    :title="text.title"
    width="25vw"
    min-width="calc(min(23rem, 92vw))"
    :close-fn="close"
  >
    <template #default>
      <section class="timer-section">
        <div class="section-label">{{ text.when }}</div>
        <div class="quick-time-grid">
          <button
            v-for="minutes in quickMinuteOptions"
            :key="minutes"
            type="button"
            :class="{ active: selectedOption === minutes }"
            @click="selectQuickTime(minutes)"
          >
            <strong>{{ minutes }}</strong
            ><span>{{ text.minutes }}</span>
          </button>
        </div>

        <label
          class="custom-time-row"
          :class="{
            active: selectedOption === 'custom',
            invalid: customMinutesInvalid && customMinutesTouched
          }"
        >
          <span>{{ text.customTime }}</span>
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
          class="inline-error"
          role="alert"
        >
          {{ text.customRange }}
        </div>

        <div class="end-mode-grid">
          <button
            type="button"
            :class="{ active: selectedOption === 'trackEnd' }"
            @click="selectedOption = 'trackEnd'"
          >
            <strong>{{ text.trackTitle }}</strong>
            <span>{{ text.trackDescription }}</span>
          </button>
          <button
            type="button"
            :class="{ active: selectedOption === 'queueEnd' }"
            @click="selectedOption = 'queueEnd'"
          >
            <strong>{{ text.queueTitle }}</strong>
            <span>{{ text.queueDescription }}</span>
          </button>
        </div>
      </section>

      <section class="timer-section compact-settings">
        <div class="section-label">{{ text.actionTitle }}</div>
        <div class="action-row">
          <div class="segmented-control" role="group" :aria-label="text.actionTitle">
            <button
              type="button"
              :class="{ active: selectedAction === 'pause' }"
              @click="selectedAction = 'pause'"
            >
              {{ text.pause }}
            </button>
            <button
              type="button"
              :class="{ active: selectedAction === 'quit' }"
              @click="selectedAction = 'quit'"
            >
              {{ text.quit }}
            </button>
          </div>

          <label class="fade-select">
            <span>{{ text.fade }}</span>
            <select v-model.number="selectedFadeSeconds">
              <option v-for="seconds in fadeOptions" :key="seconds" :value="seconds">
                {{ seconds === 0 ? text.noFade : `${seconds}s` }}
              </option>
            </select>
          </label>
        </div>
      </section>

      <div class="sleep-timer-status" :class="{ active: sleepTimerActive }" role="status">
        <span class="status-dot" aria-hidden="true"></span>
        <span>{{ statusText }}</span>
      </div>
    </template>

    <template #footer>
      <div class="sleep-timer-footer">
        <button v-if="sleepTimerActive" type="button" class="cancel-button" @click="cancel">
          {{ text.cancel }}
        </button>
        <button
          type="button"
          class="primary"
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
  saveSleepTimerPreferences,
  sleepTimerAction,
  sleepTimerActive,
  sleepTimerFadeSeconds,
  sleepTimerModalVisible,
  sleepTimerMode,
  sleepTimerNotice,
  sleepTimerRemainingSeconds,
  startSleepTimer,
  type SleepTimerAction,
  type SleepTimerSelection
} from '../utils/sleepTimerSettings'
import { resolveFeatureLanguage } from '../utils/v327FeatureShared'

type SleepTimerChoice = '15' | '30' | '60' | '90' | 'custom' | 'trackEnd' | 'queueEnd'

const CUSTOM_MINUTES_STORAGE_KEY = 'vutronmusic-sleep-timer-custom-minutes'
const MIN_CUSTOM_MINUTES = 1
const MAX_CUSTOM_MINUTES = 1440

const TEXTS = {
  zh: {
    title: '睡眠定时器',
    when: '结束时间',
    minutes: '分钟',
    customTime: '自定义时间',
    customRange: '请输入 1–1440 分钟之间的整数',
    actionTitle: '结束动作',
    pause: '暂停播放',
    quit: '退出应用',
    fade: '淡出',
    noFade: '不淡出',
    inactive: '未启用',
    countdown: '剩余 {time}',
    waitingTrack: '等待当前歌曲结束',
    waitingQueue: '等待当前队列结束',
    completed: '定时动作已完成',
    canceledByTrackChange: '手动切歌，单曲结束定时已取消',
    noTrack: '当前没有可播放的歌曲',
    start: '启用',
    replace: '替换当前定时',
    cancel: '取消定时',
    trackTitle: '本曲结束',
    trackDescription: '当前歌曲播完',
    queueTitle: '队列结束',
    queueDescription: '当前队列全部播完'
  },
  zht: {
    title: '睡眠定時器',
    when: '結束時間',
    minutes: '分鐘',
    customTime: '自訂時間',
    customRange: '請輸入 1–1440 分鐘之間的整數',
    actionTitle: '結束動作',
    pause: '暫停播放',
    quit: '結束應用程式',
    fade: '淡出',
    noFade: '不淡出',
    inactive: '未啟用',
    countdown: '剩餘 {time}',
    waitingTrack: '等待目前歌曲結束',
    waitingQueue: '等待目前佇列結束',
    completed: '定時動作已完成',
    canceledByTrackChange: '手動切歌，單曲結束定時已取消',
    noTrack: '目前沒有可播放的歌曲',
    start: '啟用',
    replace: '取代目前定時',
    cancel: '取消定時',
    trackTitle: '本曲結束',
    trackDescription: '目前歌曲播完',
    queueTitle: '佇列結束',
    queueDescription: '目前佇列全部播完'
  },
  en: {
    title: 'Sleep Timer',
    when: 'End time',
    minutes: 'min',
    customTime: 'Custom time',
    customRange: 'Enter a whole number from 1 to 1440 minutes.',
    actionTitle: 'End action',
    pause: 'Pause',
    quit: 'Quit app',
    fade: 'Fade',
    noFade: 'None',
    inactive: 'Inactive',
    countdown: '{time} remaining',
    waitingTrack: 'Waiting for the current track to end',
    waitingQueue: 'Waiting for the current queue to end',
    completed: 'Scheduled action completed',
    canceledByTrackChange: 'Track-end timer canceled after a manual change',
    noTrack: 'No track is currently available',
    start: 'Start',
    replace: 'Replace timer',
    cancel: 'Cancel timer',
    trackTitle: 'Track end',
    trackDescription: 'After the current track',
    queueTitle: 'Queue end',
    queueDescription: 'After the current queue'
  }
} as const

const readStoredCustomMinutes = (): number => {
  const value = Number(localStorage.getItem(CUSTOM_MINUTES_STORAGE_KEY) || 45)
  return Number.isInteger(value) && value >= MIN_CUSTOM_MINUTES && value <= MAX_CUSTOM_MINUTES
    ? value
    : 45
}

const quickMinuteOptions = ['15', '30', '60', '90'] as const
const fadeOptions = [0, 5, 15, 30] as const
const selectedOption = ref<SleepTimerChoice>('30')
const customMinutes = ref(readStoredCustomMinutes())
const customMinutesTouched = ref(false)
const selectedAction = ref<SleepTimerAction>(sleepTimerAction.value)
const selectedFadeSeconds = ref(sleepTimerFadeSeconds.value)
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

  selectedAction.value = sleepTimerAction.value
  selectedFadeSeconds.value = sleepTimerFadeSeconds.value
  customMinutesTouched.value = false

  if (sleepTimerMode.value === 'trackEnd' || sleepTimerMode.value === 'queueEnd') {
    selectedOption.value = sleepTimerMode.value
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
  if (sleepTimerMode.value === 'queueEnd') return text.value.waitingQueue

  return {
    inactive: text.value.inactive,
    countdown: text.value.inactive,
    waitingTrack: text.value.inactive,
    waitingQueue: text.value.inactive,
    completed: text.value.completed,
    canceledByTrackChange: text.value.canceledByTrackChange,
    noTrack: text.value.noTrack
  }[sleepTimerNotice.value]
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

  saveSleepTimerPreferences(selectedAction.value, selectedFadeSeconds.value)
  if (startSleepTimer(selection)) close()
}

const cancel = () => {
  cancelSleepTimer()
}
</script>

<style scoped lang="scss">
.timer-section {
  margin-bottom: 12px;
}

.section-label {
  margin-bottom: 7px;
  color: color-mix(in srgb, var(--color-text), transparent 46%);
  font-size: 11px;
  font-weight: 650;
}

.quick-time-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 7px;
}

.quick-time-grid button,
.end-mode-grid button,
.segmented-control button {
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
  border-radius: 9px;
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);

  &.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary), transparent 89%);
  }
}

.quick-time-grid button {
  min-height: 38px;
  padding: 6px 4px;

  strong {
    margin-right: 2px;
    font-size: 14px;
  }

  span {
    color: color-mix(in srgb, var(--color-text), transparent 46%);
    font-size: 9px;
  }
}

.custom-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
  border-radius: 9px;
  background: var(--color-secondary-bg-for-transparent);
  font-size: 12px;

  &.active {
    border-color: var(--color-primary);
  }

  &.invalid {
    border-color: #d44;
  }
}

.custom-time-input-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
  color: color-mix(in srgb, var(--color-text), transparent 44%);

  input {
    width: 64px;
    height: 28px;
    box-sizing: border-box;
    padding: 0 7px;
    border: 0;
    border-radius: 7px;
    outline: 0;
    color: var(--color-text);
    background: color-mix(in srgb, var(--color-text), transparent 93%);
    text-align: right;
    font: inherit;
    font-weight: 650;
  }
}

.inline-error {
  margin: 4px 2px 0;
  color: #d44;
  font-size: 10px;
}

.end-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 7px;

  button {
    display: grid;
    gap: 2px;
    min-height: 48px;
    padding: 7px 9px;
    text-align: left;
  }

  strong {
    font-size: 12px;
  }

  span {
    color: color-mix(in srgb, var(--color-text), transparent 48%);
    font-size: 10px;
  }
}

.compact-settings {
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--color-text), transparent 90%);
}

.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  flex: 1;

  button {
    min-height: 34px;
    border-radius: 0;
    font-size: 11px;

    &:first-child {
      border-radius: 8px 0 0 8px;
    }

    &:last-child {
      margin-left: -1px;
      border-radius: 0 8px 8px 0;
    }
  }
}

.fade-select {
  display: flex;
  align-items: center;
  gap: 5px;
  color: color-mix(in srgb, var(--color-text), transparent 42%);
  font-size: 10px;

  select {
    height: 34px;
    padding: 0 7px;
    border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
    border-radius: 8px;
    color: var(--color-text);
    background: var(--color-secondary-bg-for-transparent);
  }
}

.sleep-timer-status {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  padding: 0 2px;
  color: color-mix(in srgb, var(--color-text), transparent 48%);
  font-size: 11px;

  &.active {
    color: var(--color-primary);
  }
}

.status-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: currentColor;
}

.sleep-timer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

@media (max-width: 520px) {
  .action-row {
    align-items: stretch;
    flex-direction: column;
  }

  .fade-select {
    justify-content: space-between;
  }
}
</style>
