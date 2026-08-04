<template>
  <BaseModal
    :show="sleepTimerModalVisible"
    :title="text.title"
    width="28vw"
    min-width="calc(min(25rem, 92vw))"
    :close-fn="close"
  >
    <template #default>
      <div class="sleep-timer-options">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="sleep-timer-option"
          :class="{ active: selectedOption === option.value }"
          @click="selectedOption = option.value"
        >
          <span class="option-title">{{ option.title }}</span>
          <span class="option-description">{{ option.description }}</span>
        </button>
      </div>

      <div class="sleep-timer-status" :class="{ active: sleepTimerActive }">
        <span class="status-label">{{ text.status }}</span>
        <span class="status-value">{{ statusText }}</span>
      </div>
    </template>

    <template #footer>
      <div class="sleep-timer-footer">
        <button
          v-if="sleepTimerActive"
          type="button"
          class="cancel-button"
          @click="cancel"
        >
          {{ text.cancel }}
        </button>
        <button type="button" class="primary start-button" @click="start">
          {{ sleepTimerActive ? text.replace : text.start }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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

const TEXTS = {
  zh: {
    title: '睡眠定时器',
    status: '当前状态',
    inactive: '未启用',
    countdown: '剩余 {time}',
    waitingTrack: '将在当前歌曲结束后暂停',
    completed: '已按计划暂停播放',
    canceledByTrackChange: '检测到手动切歌，本曲结束定时已取消',
    noTrack: '当前没有可播放的歌曲',
    start: '启用',
    replace: '替换当前定时',
    cancel: '取消定时',
    minuteTitle: '{minutes} 分钟后',
    minuteDescription: '倒计时结束后平滑暂停播放',
    trackTitle: '当前歌曲结束后',
    trackDescription: '播放完当前歌曲后暂停，不继续下一首'
  },
  zht: {
    title: '睡眠定時器',
    status: '目前狀態',
    inactive: '未啟用',
    countdown: '剩餘 {time}',
    waitingTrack: '將在目前歌曲結束後暫停',
    completed: '已依計畫暫停播放',
    canceledByTrackChange: '偵測到手動切歌，本曲結束定時已取消',
    noTrack: '目前沒有可播放的歌曲',
    start: '啟用',
    replace: '取代目前定時',
    cancel: '取消定時',
    minuteTitle: '{minutes} 分鐘後',
    minuteDescription: '倒數結束後平滑暫停播放',
    trackTitle: '目前歌曲結束後',
    trackDescription: '播放完目前歌曲後暫停，不繼續下一首'
  },
  en: {
    title: 'Sleep Timer',
    status: 'Current status',
    inactive: 'Inactive',
    countdown: '{time} remaining',
    waitingTrack: 'Playback will pause after the current track',
    completed: 'Playback paused by the sleep timer',
    canceledByTrackChange: 'Manual track change detected. The timer was canceled.',
    noTrack: 'No track is currently available.',
    start: 'Start',
    replace: 'Replace current timer',
    cancel: 'Cancel timer',
    minuteTitle: 'After {minutes} minutes',
    minuteDescription: 'Pause playback smoothly when the countdown ends',
    trackTitle: 'After current track',
    trackDescription: 'Pause after this track instead of continuing to the next one'
  }
} as const

const selectedOption = ref<SleepTimerSelection>('30')
const text = computed(() => TEXTS[resolveFeatureLanguage()])

const options = computed(() => {
  const minuteOptions: SleepTimerSelection[] = ['15', '30', '60', '90']
  return [
    ...minuteOptions.map((minutes) => ({
      value: minutes,
      title: text.value.minuteTitle.replace('{minutes}', minutes),
      description: text.value.minuteDescription
    })),
    {
      value: 'trackEnd' as SleepTimerSelection,
      title: text.value.trackTitle,
      description: text.value.trackDescription
    }
  ]
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
    return text.value.countdown.replace(
      '{time}',
      formatDuration(sleepTimerRemainingSeconds.value)
    )
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

const close = () => {
  sleepTimerModalVisible.value = false
}

const start = () => {
  if (startSleepTimer(selectedOption.value)) {
    close()
  }
}

const cancel = () => {
  cancelSleepTimer()
}
</script>

<style scoped lang="scss">
.sleep-timer-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.sleep-timer-option {
  min-height: 78px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
  border-radius: 10px;
  text-align: left;
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);
  transition:
    border-color 0.2s,
    background-color 0.2s,
    transform 0.2s;

  &:hover {
    border-color: color-mix(in srgb, var(--color-primary), transparent 35%);
  }

  &:active {
    transform: scale(0.98);
  }

  &.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary), transparent 86%);
  }

  &:last-child {
    grid-column: 1 / -1;
  }
}

.option-title,
.option-description {
  display: block;
}

.option-title {
  margin-bottom: 5px;
  font-size: 15px;
  font-weight: 600;
}

.option-description {
  color: color-mix(in srgb, var(--color-text), transparent 35%);
  font-size: 12px;
  line-height: 1.45;
}

.sleep-timer-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--color-secondary-bg-for-transparent);

  &.active {
    background: color-mix(in srgb, var(--color-primary), transparent 88%);
  }
}

.status-label {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--color-text), transparent 35%);
}

.status-value {
  text-align: right;
  font-weight: 500;
}

.sleep-timer-footer {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.cancel-button,
.start-button {
  min-width: 96px;
}

@media (max-width: 560px) {
  .sleep-timer-options {
    grid-template-columns: 1fr;
  }

  .sleep-timer-option:last-child {
    grid-column: auto;
  }
}
</style>
