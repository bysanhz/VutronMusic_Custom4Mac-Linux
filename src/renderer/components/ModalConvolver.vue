<template>
  <BaseModal
    class="convolver-modal"
    :show="setConvolverModal"
    :title="$t('player.converlution.title')"
    width="min(500px, calc(100vw - 40px))"
    min-width="0"
    :show-footer="false"
    :close-fn="closeFn"
  >
    <template #default>
      <div class="effect-section">
        <div class="convolution" role="radiogroup" :aria-label="$t('player.converlution.scene')">
          <label
            class="scene-option"
            :class="{ selected: convolverParams.fileName === '' }"
            :title="$t('player.converlution.off')"
          >
            <input
              type="radio"
              name="convolution-scene"
              value=""
              :checked="convolverParams.fileName === ''"
              @change="updateConvolution('')"
            />
            <span>{{ $t('player.converlution.off') }}</span>
          </label>
          <label
            v-for="item in convolutions"
            :key="item.name"
            class="scene-option"
            :class="{ selected: convolverParams.fileName === item.source }"
            :title="$t(`player.converlution.${item.name}`)"
          >
            <input
              type="radio"
              name="convolution-scene"
              :value="item.source"
              :checked="convolverParams.fileName === item.source"
              @change="updateConvolution(item.source)"
            />
            <span>{{ $t(`player.converlution.${item.name}`) }}</span>
          </label>
        </div>
        <div class="gain-controls">
          <div class="gain-control">
            <div class="range-row">
              <label for="convolver-main-gain" class="gain-label">{{
                $t('player.converlution.mainGain')
              }}</label>
              <span class="range-end">0%</span>
              <input
                id="convolver-main-gain"
                v-model.number="convolverParams.mainGain"
                class="range-input gain-range"
                type="range"
                min="0"
                max="5"
                step="0.1"
                :style="{ '--range-fill': `${convolverParams.mainGain * 20}%` }"
                :disabled="convolverParams.fileName === ''"
                :title="$t('player.frequad.wheelHint')"
                @wheel="adjustGainOnWheel($event, 'mainGain')"
              />
              <span class="range-end">500%</span>
              <output for="convolver-main-gain" class="gain-value"
                >{{ Math.round(convolverParams.mainGain * 100) }}%</output
              >
            </div>
          </div>
          <div class="gain-control">
            <div class="range-row">
              <label for="convolver-send-gain" class="gain-label">{{
                $t('player.converlution.sendGain')
              }}</label>
              <span class="range-end">0%</span>
              <input
                id="convolver-send-gain"
                v-model.number="convolverParams.sendGain"
                class="range-input gain-range"
                type="range"
                min="0"
                max="5"
                step="0.1"
                :style="{ '--range-fill': `${convolverParams.sendGain * 20}%` }"
                :disabled="convolverParams.fileName === ''"
                :title="$t('player.frequad.wheelHint')"
                @wheel="adjustGainOnWheel($event, 'sendGain')"
              />
              <span class="range-end">500%</span>
              <output for="convolver-send-gain" class="gain-value"
                >{{ Math.round(convolverParams.sendGain * 100) }}%</output
              >
            </div>
          </div>
        </div>
      </div>
      <div class="freqsContainer">
        <div class="title">
          <strong>{{ $t('player.frequad.title') }}</strong>
          <span class="equalizer-scale">−15 dB · 0 · +15 dB</span>
          <button type="button" class="reset button" @click="resetFreqs">{{
            $t('player.frequad.reset')
          }}</button>
        </div>
        <div class="biquadContainer">
          <div v-for="(item, index) in freqsKeyList" :key="item" class="biquader">
            <label :for="`equalizer-${item}`" class="frequency-label">{{
              freqLabels[index]
            }}</label>
            <div class="equalizer-range-wrap">
              <input
                :id="`equalizer-${item}`"
                v-model.number="biquadParams[item]"
                class="range-input equalizer-range"
                type="range"
                min="-15"
                max="15"
                step="1"
                :aria-valuetext="`${biquadParams[item]} dB`"
                :title="$t('player.frequad.wheelHint')"
                @wheel="adjustEqualizerOnWheel($event, item)"
              />
            </div>
            <output :for="`equalizer-${item}`" class="frequency-value">{{
              formatDecibels(biquadParams[item])
            }}</output>
          </div>
        </div>
        <details class="preset-disclosure">
          <summary>{{ $t('player.frequad.presets') }} · {{ activePresetName }}</summary>
          <div class="preset">
            <button
              v-for="item in freqsPreset"
              :key="item.name"
              type="button"
              class="button"
              :class="{ active: matchedFreqs(item) }"
              @click="setFreqs(item)"
              >{{ $t(`player.frequad.${item.name}`) }}</button
            >
            <button
              v-for="(item, index) in biquadUser"
              :key="index"
              type="button"
              class="button"
              :class="{ active: matchedFreqs(Object.entries(item)[0][1]) }"
              @click="setFreqs(Object.entries(item)[0][1])"
              @contextmenu.prevent="removeFreqs(item)"
              >{{ Object.entries(item)[0][0] }}</button
            >
            <button v-show="!showInput" type="button" class="button" @click="addBiquad">+</button>
            <div v-show="showInput" class="button">
              <input
                ref="inputRef"
                v-model="inputText"
                class="input"
                type="text"
                :placeholder="$t('player.frequad.newPreset')"
                @blur="giveUpInput"
                @keyup.enter="handleInput"
              />
            </div>
          </div>
        </details>
        <details class="frequency-guide">
          <summary>{{ $t('player.frequad.guide.title') }}</summary>
          <p>{{ $t('player.frequad.guide.intro') }}</p>
          <div class="frequency-guide-grid">
            <div v-for="(item, index) in freqsKeyList" :key="item" class="frequency-guide-item">
              <strong>{{ freqLabels[index] }}</strong>
              <span>{{ $t(`player.frequad.guide.bands.hz${item}`) }}</span>
            </div>
          </div>
        </details>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import BaseModal from './BaseModal.vue'
import { useNormalStateStore } from '../store/state'
import { usePlayerStore } from '../store/player'
import { convolutions, freqsKeyList, freqsPreset } from '../utils/convolver'
import { wheelDirection } from '../utils/rangeWheel'

const stateStore = useNormalStateStore()
const { t } = useI18n()
const { setConvolverModal } = storeToRefs(stateStore)

const playerStore = usePlayerStore()
const { setConvolver } = playerStore
const { convolverParams, biquadParams, biquadUser } = storeToRefs(playerStore)

const showInput = ref(false)
const inputText = ref('')
const inputRef = ref<HTMLInputElement>()

const closeFn = () => {
  setConvolverModal.value = false
}

const freqLabels = freqsKeyList.map((item) => (item < 1000 ? `${item}Hz` : `${item / 1000}kHz`))
const formatDecibels = (value: number) => `${value > 0 ? '+' : ''}${value} dB`

const adjustGainOnWheel = (event: WheelEvent, key: 'mainGain' | 'sendGain') => {
  const direction = wheelDirection(event)
  if (direction === 0) return
  const next = Math.round(convolverParams.value[key] * 10) + direction
  convolverParams.value[key] = Math.min(50, Math.max(0, next)) / 10
}

const adjustEqualizerOnWheel = (event: WheelEvent, frequency: number) => {
  const direction = wheelDirection(event)
  if (direction === 0) return
  biquadParams.value[frequency] = Math.min(
    15,
    Math.max(-15, biquadParams.value[frequency] + direction)
  )
}

const updateConvolution = (fileName: string) => {
  const target = convolutions.find((item) => item.source === fileName)
  const empty = { name: '', source: '', mainGain: 1, sendGain: 0 }
  setConvolver(target || empty)
}

const setFreqs = (data: any) => {
  for (const [key, value] of Object.entries(data)) {
    if (key === 'name') continue
    biquadParams.value[key] = value
  }
}

const addBiquad = () => {
  showInput.value = true
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const removeFreqs = (data: any) => {
  const name = Object.entries(data)[0][0]
  const index = biquadUser.value.findIndex((item) => item[name])
  biquadUser.value.splice(index, 1)
}

const handleInput = () => {
  const newBiquad = {}
  newBiquad[inputText.value] = { ...biquadParams.value }
  biquadUser.value.push(newBiquad)
  inputText.value = ''
  showInput.value = false
}

const giveUpInput = () => {
  inputText.value = ''
  showInput.value = false
}

const resetFreqs = () => {
  for (const key in biquadParams.value) {
    biquadParams.value[key] = 0
  }
}

const matchedFreqs = (data: any) => {
  let matched = true
  for (const [key, value] of Object.entries(biquadParams.value)) {
    if (data[key] !== value) {
      matched = false
      break
    }
  }
  return matched
}

const activePresetName = computed(() => {
  const builtin = freqsPreset.find((preset) => matchedFreqs(preset))
  if (builtin) return t(`player.frequad.${builtin.name}`)
  const custom = biquadUser.value.find((preset) => matchedFreqs(Object.values(preset)[0]))
  return custom ? Object.keys(custom)[0] : t('player.frequad.custom')
})
</script>

<style lang="scss" scoped>
.convolver-modal :deep(.modal) {
  max-height: calc(100vh - 120px);
  padding-top: 16px;
  padding-bottom: 16px;
}

.convolver-modal :deep(.header) {
  margin-bottom: 12px;
}

.convolver-modal :deep(.content) {
  scrollbar-width: thin;
  scrollbar-color: var(--color-secondary) transparent;
}

.effect-section {
  display: grid;
  gap: 10px;
}

.convolution {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px 6px;
}

.scene-option {
  display: flex;
  align-items: center;
  gap: 5px;
  box-sizing: border-box;
  min-height: 23px;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: var(--color-secondary-bg);
  }

  &.selected {
    border-color: color-mix(in srgb, var(--color-primary) 22%, transparent);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  input {
    flex: 0 0 auto;
    width: 13px;
    height: 13px;
    margin: 0;
    accent-color: var(--color-primary);
  }

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px !important;
  }
}

.scene-option:nth-last-child(-n + 2) {
  grid-column: span 2;
}

.gain-controls {
  display: grid;
  gap: 5px;
}

.gain-control {
  min-width: 0;
}

.range-row {
  display: grid;
  grid-template-columns: 112px 28px minmax(0, 1fr) 38px 44px;
  align-items: center;
  gap: 6px;
}

.gain-label,
.gain-value {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.gain-value {
  color: var(--color-primary);
  text-align: right;
}

.range-end {
  color: var(--color-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}

.range-input {
  width: 100%;
  height: 26px;
  margin: 0;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
  touch-action: none;

  &::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 999px;
    background: var(--color-border);
  }

  &::-webkit-slider-thumb {
    width: 14px;
    height: 14px;
    margin-top: -4px;
    border: 2px solid var(--color-body-bg);
    border-radius: 50%;
    appearance: none;
    -webkit-appearance: none;
    background: var(--color-primary);
    box-shadow: 0 1px 5px rgb(0 0 0 / 25%);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: 8px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.gain-range::-webkit-slider-runnable-track {
  background: linear-gradient(
    to right,
    var(--color-primary) 0 var(--range-fill),
    var(--color-border) var(--range-fill) 100%
  );
}

.button {
  background: var(--color-secondary-bg);
  border: 1px solid var(--color-border);
  padding: 4px 8px;
  font-size: 13px;
  border-radius: 8px;
  &:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, var(--color-secondary-bg));
  }
  .input {
    background: none !important;
    border: none !important;
    width: 60px;
    color: var(--color-text);
  }
}

.active {
  border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary);
}

.freqsContainer {
  border-top: 1px solid var(--color-border);
  margin-top: 10px;
  padding-top: 10px;

  .title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 4px;
    font-size: 16px;
  }
}

.equalizer-scale {
  margin-left: auto;
  color: var(--color-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.biquadContainer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px 14px;

  .biquader {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 54px;
    align-items: center;
    gap: 4px;
    min-height: 27px;
  }
}

.frequency-label {
  color: var(--color-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.frequency-value {
  padding: 2px 4px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.equalizer-range-wrap {
  position: relative;
  min-width: 0;

  &::after {
    content: '';
    position: absolute;
    top: 9px;
    left: 50%;
    width: 2px;
    height: 12px;
    transform: translateX(-50%);
    border-radius: 2px;
    background: var(--color-secondary);
    pointer-events: none;
  }
}

.reset {
  margin: 0;
}

.preset-disclosure {
  margin-top: 8px;
  border-top: 1px solid var(--color-border);

  summary {
    padding: 6px 0;
    color: var(--color-secondary);
    cursor: pointer;
    font-size: 13px;
  }
}

.preset {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 4px 0 2px;
}

.frequency-guide {
  margin-top: 2px;
  border-top: 1px solid var(--color-border);

  summary {
    padding: 7px 0;
    color: var(--color-secondary);
    cursor: pointer;
    font-size: 13px;
  }

  p {
    margin: 1px 0 8px;
    color: var(--color-secondary);
    font-size: 12px;
  }
}

.frequency-guide-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 12px;
  padding-bottom: 4px;
}

.frequency-guide-item {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 5px;
  align-items: baseline;
  font-size: 12px;

  strong {
    color: var(--color-primary);
    font-variant-numeric: tabular-nums;
  }

  span {
    color: var(--color-secondary);
  }
}

@media (max-width: 640px) {
  .biquadContainer {
    grid-template-columns: minmax(0, 1fr);
  }

  .frequency-guide-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 480px) {
  .convolution {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .scene-option:nth-last-child(-n + 2) {
    grid-column: auto;
  }

  .biquadContainer .biquader {
    grid-template-columns: 48px minmax(0, 1fr) 54px;
    gap: 4px;
  }

  .range-row {
    grid-template-columns: 98px 24px minmax(0, 1fr) 32px 40px;
    gap: 4px;
  }
}
</style>
