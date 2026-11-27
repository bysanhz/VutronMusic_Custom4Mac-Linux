<template>
  <section class="playback-diagnostics" :aria-label="t('playbackInfo.diagnostics')">
    <div class="diagnostic-heading">
      <strong>{{ t('playbackInfo.diagnostics') }}</strong>
      <button type="button" :disabled="pending" @click="refresh">{{
        t('playbackInfo.refresh')
      }}</button>
    </div>
    <p role="status" class="diagnosis-result">{{ t(`playbackInfo.issue.${diagnosis.issue}`) }}</p>
    <p class="session-hint">{{
      t(user?.userId ? 'playbackInfo.sessionPresent' : 'playbackInfo.sessionUnknown')
    }}</p>
    <p v-if="failed" role="status">{{ t('playbackInfo.diagnosticsUnavailable') }}</p>
    <details>
      <summary>{{ t('playbackInfo.technicalDetails') }}</summary>
      <dl>
        <dt>{{ t('playbackInfo.retryCount') }}</dt
        ><dd>{{ diagnosis.attempt }}</dd>
        <template v-if="diagnosis.lastRequest">
          <dt>{{ t('playbackInfo.lastRequest') }}</dt
          ><dd>{{
            diagnosis.lastRequest.at ? new Date(diagnosis.lastRequest.at).toLocaleTimeString() : '—'
          }}</dd>
          <dt>HTTP / {{ t('playbackInfo.businessCode') }}</dt
          ><dd
            >{{ diagnosis.lastRequest.status ?? '—' }} /
            {{ diagnosis.lastRequest.upstreamCode ?? '—' }}</dd
          >
          <dt>{{ t('playbackInfo.requestMethod') }}</dt
          ><dd>{{ diagnosis.lastRequest.protocol?.toUpperCase() || '—' }}</dd>
        </template>
        <dt>{{ t('playbackInfo.build') }}</dt
        ><dd>{{ buildLabel }}</dd>
      </dl>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../store/player'
import { useDataStore } from '../store/data'
import { playbackDiagnosis } from '../../shared/playbackDiagnosis'
import { BUILD_INFO } from '../../shared/buildInfo'

const { t } = useI18n()
const { currentTrack, playbackRecovery } = storeToRefs(usePlayerStore())
const { user } = storeToRefs(useDataStore())
const records = ref<any[]>([])
const online = ref(navigator.onLine)
const pending = ref(false)
const failed = ref(false)
let active = true
const diagnosis = computed(() =>
  playbackDiagnosis(currentTrack.value?.id, playbackRecovery.value, records.value, online.value)
)
const buildLabel = computed(
  () =>
    `${BUILD_INFO.version} · ${BUILD_INFO.revision}${BUILD_INFO.modified ? ' *' : ''}${BUILD_INFO.builtAt ? ' · ' + new Date(BUILD_INFO.builtAt).toLocaleString() : ''}`
)
const networkChanged = () => {
  online.value = navigator.onLine
}
const refresh = async () => {
  if (pending.value) return
  pending.value = true
  try {
    const result = await window.mainApi?.invoke('get-runtime-diagnostics')
    if (!active) return
    records.value = Array.isArray(result?.audioRequests) ? result.audioRequests : []
    failed.value = !result
  } catch {
    if (active) failed.value = true
  } finally {
    if (active) pending.value = false
  }
}
onMounted(() => {
  window.addEventListener('online', networkChanged)
  window.addEventListener('offline', networkChanged)
  void refresh()
})
onBeforeUnmount(() => {
  active = false
  window.removeEventListener('online', networkChanged)
  window.removeEventListener('offline', networkChanged)
})
</script>

<style scoped lang="scss">
.playback-diagnostics {
  color: var(--color-text);
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
  font-size: 12px;
}
.diagnostic-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
button {
  color: var(--color-primary);
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
p {
  margin: 8px 0;
  line-height: 1.6;
}
.session-hint,
details {
  color: var(--color-secondary);
}
summary {
  cursor: pointer;
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 12px;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
