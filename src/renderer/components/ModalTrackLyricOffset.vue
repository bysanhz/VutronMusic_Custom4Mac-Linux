<template>
  <BaseModal
    :show="trackLyricOffsetModalVisible"
    :title="text.title"
    width="25vw"
    min-width="calc(min(24rem, 92vw))"
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
        <div>
          <span>{{ text.trackOffset }}</span>
          <strong>{{ formatOffset(trackLyricOffset) }}</strong>
        </div>
        <div>
          <span>{{ text.globalOffset }}</span>
          <strong>{{ formatOffset(globalLyricOffset) }}</strong>
        </div>
      </div>

      <div class="offset-controls" role="group" :aria-label="text.title">
        <button type="button" @click="adjust(-0.5)">-0.5s</button>
        <button type="button" @click="adjust(-0.1)">-0.1s</button>
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
        <button type="button" @click="adjust(0.1)">+0.1s</button>
        <button type="button" @click="adjust(0.5)">+0.5s</button>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  flex-shrink: 0;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 650;
}

.offset-overview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;

  div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--color-text), transparent 88%);
    border-radius: 9px;
    font-size: 12px;
  }

  span {
    color: color-mix(in srgb, var(--color-text), transparent 42%);
  }
}

.offset-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(78px, 1.2fr) repeat(2, minmax(0, 1fr));
  gap: 6px;

  button,
  .offset-input {
    min-height: 38px;
    border: 1px solid color-mix(in srgb, var(--color-text), transparent 86%);
    border-radius: 9px;
    background: var(--color-secondary-bg-for-transparent);
  }

  button:hover {
    border-color: color-mix(in srgb, var(--color-primary), transparent 35%);
  }
}

.offset-input {
  display: flex;
  align-items: center;
  padding: 0 8px;

  input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: 0;
    color: var(--color-text);
    background: transparent;
    text-align: right;
    font: inherit;
    font-weight: 650;
  }

  span {
    color: color-mix(in srgb, var(--color-text), transparent 42%);
    font-size: 12px;
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
</style>
