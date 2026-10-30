<template>
  <section class="memory-panel" :aria-label="t('nav.runtimeMemory')">
    <p v-if="!sample" class="memory-status" role="status">
      {{ t(failed ? 'nav.memoryUnavailable' : 'nav.memoryLoading') }}
    </p>
    <template v-if="sample">
      <div class="memory-row">
        <span>{{ t('nav.memoryMain') }}</span>
        <strong>{{ formatMiB(sample.mainWorkingSetMiB) }}</strong>
      </div>
      <div class="memory-row">
        <span>{{ t('nav.memoryHeap') }}</span>
        <strong>{{
          heap ? `${heap.usedMiB.toFixed(1)} / ${formatMiB(heap.allocatedMiB)}` : '—'
        }}</strong>
      </div>
      <div v-if="sample.platform === 'win32'" class="memory-row">
        <span>{{ t('nav.memoryPrivate') }}</span>
        <strong>{{ formatMiB(sample.mainPrivateMiB) }}</strong>
      </div>
      <div class="memory-row">
        <span>{{ t('nav.memoryLyrics') }}</span>
        <strong>{{
          sample.desktopLyricsCount
            ? formatMiB(sample.desktopLyricsWorkingSetMiB)
            : t('nav.memoryNotOpen')
        }}</strong>
      </div>
      <div class="memory-row">
        <span>{{ t('nav.memoryApp') }}</span>
        <strong>{{ formatMiB(sample.appWorkingSetMiB) }}</strong>
      </div>
      <div class="memory-row">
        <span>{{ t('nav.memoryDelta') }}</span>
        <strong>{{ delta === null ? '—' : `${delta > 0 ? '+' : ''}${formatMiB(delta)}` }}</strong>
      </div>
      <div class="memory-trend">
        <div class="memory-row">
          <span>{{ t('nav.memoryTrend') }}</span>
          <small>{{ t('nav.memoryWindow', { seconds: observedSeconds }) }}</small>
        </div>
        <svg v-if="points" viewBox="0 0 260 44" role="img" :aria-label="t('nav.memoryTrend')">
          <polyline :points="points" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
        <p v-else class="memory-status">{{ t('nav.memoryTrendWaiting') }}</p>
      </div>
      <p class="memory-status" role="status">
        {{ failed ? t('nav.memoryStale') : t('nav.memoryUpdated', { time: updatedTime }) }}
      </p>
    </template>
    <button type="button" class="memory-copy" :disabled="copying" @click="copySnapshot">
      {{ t(copying ? 'nav.memoryCopying' : 'nav.memoryCopy') }}
    </button>
    <p v-if="copyStatus" class="memory-status" role="status">{{ t(copyStatus) }}</p>
    <p class="memory-note">{{ t('nav.memoryScope') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RuntimeMemorySample } from '../../types/runtimeMemory'
import { copyDiagnosticsSnapshot } from '../utils/diagnosticsSnapshotSettings'

const { t, locale } = useI18n()
const sample = ref<RuntimeMemorySample | null>(null)
const heap = ref<{ usedMiB: number; allocatedMiB: number } | null>(null)
const history = ref<Array<{ at: number; pid: number; workingSetMiB: number }>>([])
const failed = ref(false)
const copying = ref(false)
const copyStatus = ref('')
let active = true
let pending = false
let timer: number | null = null

const formatMiB = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)} MiB`)
const observedSeconds = computed(() =>
  history.value.length < 2 ? 0 : Math.round((history.value.at(-1)!.at - history.value[0].at) / 1000)
)
const delta = computed(() =>
  history.value.length < 2
    ? null
    : history.value.at(-1)!.workingSetMiB - history.value[0].workingSetMiB
)
const updatedTime = computed(() =>
  sample.value
    ? new Date(sample.value.sampledAt).toLocaleTimeString(locale.value, { hour12: false })
    : ''
)
const points = computed(() => {
  const values = history.value
  if (values.length < 2) return ''
  const min = Math.min(...values.map((item) => item.workingSetMiB))
  const max = Math.max(...values.map((item) => item.workingSetMiB))
  // At least 16 MiB vertically, so sub-MiB noise does not look like a large jump.
  const span = Math.max(16, max - min)
  const duration = Math.max(1, values.at(-1)!.at - values[0].at)
  return values
    .map(
      (item) =>
        `${2 + ((item.at - values[0].at) / duration) * 256},${42 - ((item.workingSetMiB - min) / span) * 38}`
    )
    .join(' ')
})

const clearTimer = () => {
  if (timer !== null) window.clearTimeout(timer)
  timer = null
}
const refresh = async () => {
  clearTimer()
  if (!active || pending || document.hidden) return
  pending = true
  try {
    const result: RuntimeMemorySample | undefined =
      await window.mainApi?.invoke('get-runtime-memory')
    if (!active) return
    if (!result || !Number.isFinite(result.sampledAt)) throw new Error('Memory unavailable')
    sample.value = result
    const memory = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number }
      }
    ).memory
    heap.value =
      memory && Number.isFinite(memory.usedJSHeapSize) && Number.isFinite(memory.totalJSHeapSize)
        ? {
            usedMiB: memory.usedJSHeapSize / 1048576,
            allocatedMiB: memory.totalJSHeapSize / 1048576
          }
        : null
    history.value = history.value.filter(
      (item) => item.pid === result.mainPid && result.sampledAt - item.at <= 300_000
    )
    if (result.mainWorkingSetMiB !== null) {
      history.value = [
        ...history.value,
        {
          at: result.sampledAt,
          pid: result.mainPid,
          workingSetMiB: result.mainWorkingSetMiB
        }
      ].slice(-60)
    }
    failed.value = false
  } catch {
    if (active) failed.value = true
  } finally {
    pending = false
    if (active && !document.hidden) timer = window.setTimeout(refresh, 5000)
  }
}
const visibilityChanged = () => {
  clearTimer()
  if (!document.hidden) void refresh()
}
const copySnapshot = async () => {
  if (copying.value) return
  copying.value = true
  copyStatus.value = ''
  try {
    await copyDiagnosticsSnapshot({
      memoryMonitor: {
        sample: sample.value,
        heapEstimate: heap.value,
        history: history.value.slice()
      }
    })
    if (active) copyStatus.value = 'nav.memoryCopied'
  } catch {
    if (active) copyStatus.value = 'nav.memoryCopyFailed'
  } finally {
    if (active) copying.value = false
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', visibilityChanged)
  void refresh()
})
onBeforeUnmount(() => {
  active = false
  clearTimer()
  document.removeEventListener('visibilitychange', visibilityChanged)
})
</script>

<style scoped lang="scss">
.memory-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  span,
  small {
    color: var(--color-secondary);
  }
  strong {
    flex: 0 0 auto;
    white-space: nowrap;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
}
.memory-trend {
  margin-top: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--color-border);
  svg {
    display: block;
    width: 100%;
    height: 44px;
    margin-top: 8px;
    color: var(--color-primary);
  }
}
.memory-status {
  margin: 8px 0;
  font-size: 12px;
  color: var(--color-secondary);
}
.memory-copy {
  width: 100%;
  margin-top: 10px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-secondary-bg);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
}
.memory-note {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
  color: var(--color-secondary);
  font-size: 12px;
}
</style>
