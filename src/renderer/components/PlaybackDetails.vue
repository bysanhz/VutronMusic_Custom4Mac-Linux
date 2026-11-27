<template>
  <details
    v-if="currentTrack?.name"
    ref="root"
    class="playback-details"
    @click.stop
    @toggle="opened = Boolean(root?.open)"
    @keydown.esc.stop="close"
  >
    <summary :title="t('playbackInfo.details')" :aria-label="t('playbackInfo.details')">
      <span>{{ badge }}</span
      ><span class="source-label"> · {{ t(`playbackInfo.source.${info.source}`) }}</span>
    </summary>
    <section v-if="opened" class="playback-popover" :aria-label="t('playbackInfo.details')">
      <header
        ><strong>{{ t('playbackInfo.details') }}</strong
        ><button type="button" :aria-label="t('playbackInfo.close')" @click="close"
          >×</button
        ></header
      >
      <p class="actual-quality">{{
        info.actual ? t(`playbackInfo.quality.${info.actual}`) : t('playbackInfo.unknownQuality')
      }}</p>
      <p
        >{{ t(`playbackInfo.source.${info.source}`)
        }}<template v-if="info.provider"> · {{ info.provider }}</template></p
      >
      <p v-if="info.substituted" class="quality-note">{{
        t('playbackInfo.substituted', {
          requested: t(`playbackInfo.quality.${info.requested}`),
          actual: t(`playbackInfo.quality.${info.actual}`)
        })
      }}</p>
      <p v-else-if="!info.actual" class="quality-note">{{
        t('playbackInfo.unknownQualityHint')
      }}</p>
      <p class="audio-format">{{ formatDetails || '—' }}</p>
      <PlaybackDiagnostics />
      <button type="button" class="settings-link" @click="openSettings">{{
        t('playbackInfo.openSettings')
      }}</button>
    </section>
  </details>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '../store/player'
import { playbackInfo } from '../../shared/playbackInfo'
import PlaybackDiagnostics from './PlaybackDiagnostics.vue'
const { t } = useI18n()
const router = useRouter()
const { currentTrack, playbackRecovery } = storeToRefs(usePlayerStore())
const root = ref<HTMLDetailsElement | null>(null)
const opened = ref(false)
const info = computed(() => playbackInfo(currentTrack.value))
const badge = computed(() =>
  ['loading', 'retrying'].includes(playbackRecovery.value.phase)
    ? t(`playbackInfo.issue.${playbackRecovery.value.phase}`)
    : info.value.actual
      ? t(`playbackInfo.quality.${info.value.actual}`)
      : info.value.format || t('playbackInfo.qualityUnknownShort')
)
const formatDetails = computed(() =>
  [
    info.value.format,
    info.value.bitrate ? `${Math.round(info.value.bitrate / 1000)} kbps` : '',
    info.value.sampleRate ? `${info.value.sampleRate / 1000} kHz` : '',
    info.value.bitDepth ? `${info.value.bitDepth} bit` : ''
  ]
    .filter(Boolean)
    .join(' · ')
)
const close = () => {
  if (root.value) root.value.open = false
}
const outside = (event: PointerEvent) => {
  if (root.value && !root.value.contains(event.target as Node)) close()
}
const openSettings = () => {
  close()
  void router.push({ path: '/settings', query: { section: 'music' } })
}
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>

<style scoped lang="scss">
.playback-details {
  flex: 0 0 auto;
  position: relative;
  min-width: 0;
  font-size: 11px;
  margin-right: 8px;
}
summary {
  display: block;
  max-width: 150px;
  padding: 5px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  cursor: pointer;
  color: var(--color-secondary);
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
summary:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.playback-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 18px);
  width: min(340px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 110px));
  overflow: auto;
  padding: 18px;
  box-sizing: border-box;
  border-radius: 14px;
  background: var(--color-body-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  box-shadow: 0 8px 32px #0003;
  font-size: 13px;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
button {
  background: transparent;
  border: 0;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
}
header button {
  font-size: 22px;
}
p {
  margin: 10px 0;
  line-height: 1.6;
}
.actual-quality {
  font-size: 20px;
  font-weight: 600;
}
.quality-note,
.audio-format {
  color: var(--color-secondary);
  font-size: 12px;
}
.settings-link {
  padding: 6px 0;
}
@media (max-width: 1100px) {
  .source-label {
    display: none;
  }
  summary {
    max-width: 82px;
  }
}
</style>
