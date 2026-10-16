<template>
  <ButtonIcon
    class="sleep-timer-button"
    :class="{ 'is-active': display.active, 'is-compact': compact }"
    :title="display.title"
    :aria-label="display.title"
    @click.stop="openSleepTimer"
  >
    <span class="timer-clock" aria-hidden="true"></span>
    <span v-if="display.active || !compact" class="timer-label">
      {{ display.label }}
    </span>
  </ButtonIcon>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ButtonIcon from './ButtonIcon.vue'
import {
  sleepTimerModalVisible,
  sleepTimerMode,
  sleepTimerRemainingSeconds
} from '../utils/sleepTimerSettings'
import { getSleepTimerDisplay } from '../utils/sleepTimerDisplay'
import { resolveFeatureLanguage } from '../utils/v327FeatureShared'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const display = computed(() =>
  getSleepTimerDisplay(
    sleepTimerMode.value,
    sleepTimerRemainingSeconds.value,
    resolveFeatureLanguage()
  )
)

const openSleepTimer = () => {
  sleepTimerModalVisible.value = true
}
</script>

<style scoped lang="scss">
.sleep-timer-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-sizing: border-box;
  min-width: 34px;
  min-height: 32px;
  padding: 6px 7px;
  border: 0;
  border-radius: 9px;
  color: var(--color-text);
  background: transparent;
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
  -webkit-app-region: no-drag;

  &.is-active {
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 9%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}

.timer-clock {
  position: relative;
  flex: 0 0 15px;
  box-sizing: border-box;
  width: 15px;
  height: 15px;
  border: 1.8px solid currentColor;
  border-radius: 50%;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    background: currentColor;
    border-radius: 1px;
    transform-origin: left center;
  }

  &::before {
    width: 5px;
    height: 1.5px;
    transform: rotate(-90deg);
  }

  &::after {
    width: 4px;
    height: 1.5px;
    transform: rotate(40deg);
  }
}

.timer-label {
  white-space: nowrap;
}
</style>
