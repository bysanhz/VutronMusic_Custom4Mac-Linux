<template>
  <ButtonIcon
    class="playback-speed-button"
    :class="{
      'is-adjusted': playbackRate !== 1,
      'medium-rate': formattedRate.length === 4,
      'wide-rate': formattedRate.length >= 5
    }"
    :title="`${$t('contextMenu.playBackSpeed')} · ${formattedRate}`"
    :aria-label="`${$t('contextMenu.playBackSpeed')} · ${formattedRate}`"
    @click.stop="cycleRate"
  >
    <span class="speed-label">{{ formattedRate }}</span>
  </ButtonIcon>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../store/player'
import ButtonIcon from './ButtonIcon.vue'

const { playbackRate } = storeToRefs(usePlayerStore())
const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]
const formattedRate = computed(() => `${Number(playbackRate.value.toFixed(2))}×`)

const cycleRate = () => {
  playbackRate.value = rates.find((rate) => rate > playbackRate.value + 0.001) ?? rates[0]
}
</script>

<style scoped lang="scss">
.playback-speed-button {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: clamp(10px, 1.2vw, 13px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  opacity: 1;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }
}

.speed-label {
  display: block;
  white-space: nowrap;
  line-height: 1;
}
</style>
