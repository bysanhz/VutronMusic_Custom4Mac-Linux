<template>
  <BaseModal
    :show="setPitchModal"
    :title="$t('player.pitchModal.title')"
    width="min(28rem, 94vw)"
    min-width="min(22rem, 94vw)"
    :close-fn="close"
  >
    <template #default>
      <div class="preset-grid" :aria-label="$t('player.pitchModal.presets')">
        <button
          v-for="rate in pitchPresets"
          :key="rate"
          type="button"
          class="preset-button"
          :class="{ active: isSelected(rate) }"
          @click="pitch = rate"
        >
          {{ formatRate(rate) }}
        </button>
      </div>

      <div class="progress-bar">
        <div class="slider">
          <vue-slider
            v-model="pitch"
            :min="0.5"
            :max="1.5"
            :interval="0.01"
            :duration="0.5"
            :dot-size="14"
            :height="3"
            :use-keyboard="false"
            :drag-on-click="true"
            :process-style="{ background: 'var(--color-primary)' }"
            :rail-style="{ background: 'rgba(128, 128, 128, 0.22)' }"
            :dot-style="{
              background: 'var(--color-primary)',
              border: '2px solid var(--color-body-bg)',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)'
            }"
            tooltip="none"
            :lazy="false"
            :silent="true"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="playback-footer">
        <span class="current-value"
          >{{ $t('player.pitchModal.current') }}: {{ `${pitch.toFixed(2)}x` }}</span
        >
        <button type="button" class="reset button" @click="reset">
          {{ $t('player.frequad.reset') }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import VueSlider from 'vue-3-slider-component'
import BaseModal from './BaseModal.vue'
import { useNormalStateStore } from '../store/state'
import { usePlayerStore } from '../store/player'
import { storeToRefs } from 'pinia'

const stateStore = useNormalStateStore()
const { setPitchModal } = storeToRefs(stateStore)

const playerStore = usePlayerStore()
const { pitch } = storeToRefs(playerStore)

const pitchPresets = [0.5, 0.75, 1, 1.25, 1.5] as const

const formatRate = (value: number) => `${Number.isInteger(value) ? value.toFixed(1) : value}x`
const isSelected = (value: number) => Math.abs(pitch.value - value) < 0.001

const reset = () => {
  pitch.value = 1
}

const close = () => {
  setPitchModal.value = false
}
</script>

<style lang="scss" scoped>
.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 18px;
}

.preset-button {
  min-width: 0;
  min-height: 38px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 86%);
  border-radius: 9px;
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;

  &:hover {
    border-color: color-mix(in srgb, var(--color-primary), transparent 30%);
  }

  &:active {
    transform: scale(0.96);
  }

  &.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary), transparent 88%);
  }
}

.progress-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .slider {
    width: 100%;
    height: 24px;
    padding: 0 7px;
    box-sizing: border-box;
  }
}

.playback-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  .current-value {
    min-width: 0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .button {
    flex: 0 0 auto;
    border: 0;
    color: var(--color-text);
    background: var(--color-secondary-bg-for-transparent);
    padding: 5px 12px;
    font-family: inherit;
    font-size: 13px;
    border-radius: 6px;

    &:hover {
      cursor: pointer;
    }
  }
}

@media (max-width: 360px) {
  .preset-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
