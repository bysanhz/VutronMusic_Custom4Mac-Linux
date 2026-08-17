<template>
  <BaseModal
    :show="trackLyricOffsetModalVisible"
    :title="text.title"
    width="min(30rem, 94vw)"
    min-width="min(22rem, 94vw)"
    :close-fn="close"
  >
    <template #default>
      <div class="track-summary">
        <span class="track-name">{{ trackLyricOffsetTrackName || text.noTrack }}</span>
        <span class="effective-offset"
          >{{ text.effective }} {{ formatOffset(effectiveTrackLyricOffset) }}</span
        >
      </div>

      <div class="offset-overview">
        <div class="offset-card">
          <span>{{ text.trackOffset }}</span>
          <strong>{{ formatOffset(trackLyricOffset) }}</strong>
        </div>
        <div class="offset-card">
          <span>{{ text.globalOffset }}</span>
          <strong>{{ formatOffset(globalLyricOffset) }}</strong>
        </div>
      </div>

      <div class="offset-controls" role="group" :aria-label="text.title">
        <label class="offset-input">
          <input
            v-model.number="draftOffset"
            type="number"
            min="-30"
            max="30"
            step="0.1"
            :aria-label="text.trackOffset"
            @change="commitDraft"
            @keydown.enter.prevent="commitDraft"
          />
          <span>s</span>
        </label>

        <div class="step-controls">
          <button type="button" @click="adjust(-0.5)">-0.5s</button>
          <button type="button" @click="adjust(-0.1)">-0.1s</button>
          <button type="button" @click="adjust(0.1)">+0.1s</button>
          <button type="button" @click="adjust(0.5)">+0.5s</button>
        </div>
      </div>

      <p class="offset-hint">{{ text.hint }}</p>
    </template>

    <template #footer>
      <div class="modal-actions">
        <button type="button" class="reset-button" @click="reset">{{ text.resetTrack }}</button>
        <button type="button" class="primary" @click="close">{{ text.done }}</button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import { globalLyricOffset } from '../utils/globalLyricOffset'
import {
  adjustTrackLyricOffset,
  effectiveTrackLyricOffset,
  normalizeTrackLyricOffset,
  resetTrackLyricOffset,
  setTrackLyricOffset,
  trackLyricOffset,
  trackLyricOffsetModalVisible,
  trackLyricOffsetTrackName
} from '../utils/trackLyricOffset'
import { resolveFeatureLanguage } from '../utils/v327FeatureShared'

const TEXTS = {
  zh: {
    title: '本曲歌词时间校正',
    trackOffset: '本曲',
    globalOffset: '全局',
    effective: '实际偏移',
    resetTrack: '重置本曲',
    done: '完成',
    noTrack: '当前没有歌曲',
    hint: '正值表示歌词提前，负值表示歌词延后；本曲校正会与全局校正相加。'
  },
  zht: {
    title: '本曲歌詞時間校正',
    trackOffset: '本曲',
    globalOffset: '全域',
    effective: '實際偏移',
    resetTrack: '重設本曲',
    done: '完成',
    noTrack: '目前沒有歌曲',
    hint: '正值表示歌詞提前，負值表示歌詞延後；本曲校正會與全域校正相加。'
  },
  en: {
    title: 'Track Lyric Timing',
    trackOffset: 'Track',
    globalOffset: 'Global',
    effective: 'Effective',
    resetTrack: 'Reset track',
    done: 'Done',
    noTrack: 'No current track',
    hint: 'Positive values advance lyrics; negative values delay them. Track and global offsets are combined.'
  }
} as const

const text = computed(() => TEXTS[resolveFeatureLanguage()])
const draftOffset = ref(trackLyricOffset.value)

watch(trackLyricOffset, (value) => {
  draftOffset.value = value
})

watch(trackLyricOffsetModalVisible, (visible) => {
  if (visible) draftOffset.value = trackLyricOffset.value
})

const formatOffset = (value: number): string => {
  const normalized = normalizeTrackLyricOffset(Number(value))
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(1)}s`
}

const adjust = (delta: number) => {
  draftOffset.value = adjustTrackLyricOffset(delta)
}

const commitDraft = () => {
  draftOffset.value = setTrackLyricOffset(Number(draftOffset.value))
}

const reset = () => {
  resetTrackLyricOffset()
  draftOffset.value = 0
}

const close = () => {
  commitDraft()
  trackLyricOffsetModalVisible.value = false
}
</script>

<style scoped lang="scss">
.track-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--color-secondary-bg-for-transparent);
}

.track-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}

.effective-offset {
  min-width: 0;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.offset-overview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.offset-card {
  min-width: 0;
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 9px 8px;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
  border-radius: 9px;
  text-align: center;

  span {
    color: color-mix(in srgb, var(--color-text), transparent 42%);
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
  }

  strong {
    max-width: 100%;
    overflow: hidden;
    color: var(--color-text);
    font-size: 14px;
    font-weight: 650;
    line-height: 1.2;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
}

.offset-controls {
  display: grid;
  gap: 8px;
}

.offset-input,
.step-controls button {
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 86%);
  border-radius: 9px;
  background: var(--color-secondary-bg-for-transparent);
}

.offset-input {
  min-width: 0;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 12px;
  overflow: hidden;
  font-variant-numeric: tabular-nums;

  input {
    width: 6ch;
    min-width: 0;
    flex: 0 1 6ch;
    appearance: textfield;
    border: 0;
    outline: 0;
    color: var(--color-text);
    background: transparent;
    text-align: right;
    font-family: inherit;
    font-size: 15px;
    font-weight: 650;
    line-height: 1;
    font-variant-numeric: tabular-nums;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      margin: 0;
      appearance: none;
    }
  }

  span {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--color-text), transparent 42%);
    font-size: 11px;
    line-height: 1;
  }
}

.step-controls {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  button {
    min-width: 0;
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 0 4px;
    color: var(--color-text);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;

    &:hover {
      border-color: color-mix(in srgb, var(--color-primary), transparent 35%);
    }
  }
}

.offset-hint {
  margin: 10px 2px 0;
  color: color-mix(in srgb, var(--color-text), transparent 48%);
  font-size: 11px;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;

  button {
    min-width: 88px;
  }
}

@media (max-width: 360px) {
  .track-summary {
    grid-template-columns: minmax(0, 1fr);
    gap: 5px;
  }

  .effective-offset {
    justify-self: start;
  }

  .step-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
