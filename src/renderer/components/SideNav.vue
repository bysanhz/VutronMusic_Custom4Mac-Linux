<template>
  <div class="side-nav">
    <div class="history-navigation">
      <button
        type="button"
        class="history-button"
        :title="$t('nav.back')"
        :aria-label="$t('nav.back')"
        @click.stop="router.go(-1)"
      >
        <svg-icon class="history-icon" icon-class="arrow-left" />
      </button>
      <button
        type="button"
        class="history-button"
        :title="$t('nav.forward')"
        :aria-label="$t('nav.forward')"
        @click.stop="router.go(1)"
      >
        <svg-icon class="history-icon" icon-class="arrow-right" />
      </button>
    </div>
    <button-icon
      :class="{ active: isCurrentRoute('/') }"
      :data-tip="`${$t('nav.home')}`"
      @click="handleRoute('/')"
    >
      <svg-icon class="icon" icon-class="logo" />
    </button-icon>
    <button-icon
      :class="{ active: isCurrentRoute('/explore') }"
      :data-tip="`${$t('nav.explore')}`"
      @click="handleRoute('/explore')"
    >
      <svg-icon class="icon" icon-class="explore" style="transform: scale(1.4)" />
    </button-icon>
    <button-icon
      :class="{ active: isCurrentRoute('/library') }"
      :data-tip="`${$t('nav.library')}`"
      @click="handleRoute('/library')"
    >
      <svg-icon class="icon" icon-class="library" />
    </button-icon>
    <button-icon
      :class="{ active: isCurrentRoute('/insights') }"
      :data-tip="`${$t('nav.insights')}`"
      @click="handleRoute('/insights')"
    >
      <svg-icon class="icon" icon-class="insights" />
    </button-icon>
    <button-icon
      v-if="enable"
      :class="{ active: isCurrentRoute('/stream') }"
      :data-tip="`${$t('nav.stream')}`"
      @click="handleRoute('/stream')"
    >
      <svg-icon class="icon" icon-class="stream-icon" style="transform: scale(0.9)"></svg-icon>
    </button-icon>
    <button-icon
      v-if="isElectron && localMusic.enble"
      :class="{ active: isCurrentRoute('/localMusic') }"
      :data-tip="`${$t('nav.localMusic')}`"
      @click="handleRoute('/localMusic')"
    >
      <svg-icon class="icon" icon-class="local-music" />
    </button-icon>
    <button-icon
      :class="{ active: isCurrentRoute('/settings') }"
      :data-tip="`${$t('nav.settings')}`"
      @click="handleRoute('/settings')"
    >
      <svg-icon class="icon" icon-class="settings" style="transform: scale(0.9)" />
    </button-icon>
    <div ref="networkWidgetRef" class="network-widget">
      <button
        type="button"
        class="network-button"
        :class="networkQualityTier"
        :title="`${t('nav.networkStatus')}：${t(networkQualityLabelKey)}`"
        :aria-label="`${t('nav.networkStatus')}：${t(networkQualityLabelKey)}`"
        aria-controls="network-status-panel"
        :aria-expanded="networkWindowOpen"
        @click.stop="networkWindowOpen = !networkWindowOpen"
      >
        <svg
          class="icon network-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M2 8.5c5.5-5 14.5-5 20 0M5 12c4-3.5 10-3.5 14 0M8 15.5c2.3-2 5.7-2 8 0" />
          <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" />
        </svg>
        <span class="network-indicator" aria-hidden="true"></span>
      </button>
      <div
        v-if="networkWindowOpen"
        id="network-status-panel"
        class="network-panel"
        role="region"
        :aria-label="t('nav.networkStatus')"
      >
        <div class="network-panel-title">
          <span class="network-panel-indicator" :class="networkQualityTier"></span>
          <span>{{ t('nav.networkStatus') }}</span>
          <button
            type="button"
            class="network-test-button"
            :disabled="networkTesting"
            :title="t('nav.networkTestTitle')"
            :aria-label="t('nav.networkTestTitle')"
            @click.stop="runNetworkTest"
          >
            {{ t(networkTesting ? 'nav.networkTesting' : 'nav.networkTest') }}
          </button>
        </div>
        <div class="network-panel-row">
          <span>{{ t('nav.deviceNetwork') }}</span>
          <strong>{{
            t(networkIssue === 'offline' ? 'nav.networkDisconnected' : 'nav.networkConnected')
          }}</strong>
        </div>
        <div class="network-panel-row">
          <span>{{ t('nav.neteaseNetwork') }}</span>
          <strong>{{ t(neteaseStatusKey) }}</strong>
        </div>
        <div class="network-panel-row">
          <span>{{ t('nav.networkQuality') }}</span>
          <strong>{{ t(networkQualityLabelKey) }}</strong>
        </div>
        <div class="network-panel-row">
          <span>{{ t('nav.networkLatency') }}</span>
          <strong>{{
            networkIssue === 'offline' || qualitySummary.medianMs === null
              ? '—'
              : `${qualitySummary.medianMs} ms`
          }}</strong>
        </div>
        <div class="network-panel-row">
          <span>{{ t('nav.networkRecentFailures') }}</span>
          <strong>{{
            qualitySummary.sampleCount
              ? `${qualitySummary.failedCount}/${qualitySummary.sampleCount}`
              : '—'
          }}</strong>
        </div>
        <div class="network-panel-row">
          <span>{{ t('nav.networkAudioBuffer') }}</span>
          <strong>{{
            audioBufferSeconds === null ? '—' : `${audioBufferSeconds.toFixed(1)} s`
          }}</strong>
        </div>
        <p v-if="networkTesting || networkTestResult" class="network-test-result" role="status">
          {{
            networkTesting
              ? t('nav.networkTestingStatus')
              : t(networkTestResult?.ok ? 'nav.networkTestSuccess' : 'nav.networkTestFailed', {
                  latency: networkTestResult?.elapsedMs ?? 0
                })
          }}
        </p>
        <p class="network-panel-note">{{ t('nav.networkStatusScope') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ButtonIcon from './ButtonIcon.vue'
import SvgIcon from './SvgIcon.vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '../store/settings'
import { useStreamMusicStore } from '../store/streamingMusic'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NETEASE_REQUEST_METRIC_EVENT,
  summarizeNetworkQuality,
  type NeteaseRequestMetric,
  type NetworkQualitySample
} from '../utils/networkQuality'
import { probeNeteaseNetwork } from '../utils/request'

const props = defineProps<{
  networkIssue: 'offline' | 'netease-unavailable' | null
}>()

const { t } = useI18n()
const networkWidgetRef = ref<HTMLElement | null>(null)
const networkWindowOpen = ref(false)
const requestSamples = ref<NetworkQualitySample[]>([])
const qualityNow = ref(Date.now())
const audioBufferSeconds = ref<number | null>(null)
const networkTesting = ref(false)
const networkTestResult = ref<{ ok: boolean; elapsedMs: number } | null>(null)
let networkTestRunId = 0
let qualityTimer: number | null = null
let audioBufferTimer: number | null = null

const qualitySummary = computed(() =>
  summarizeNetworkQuality(requestSamples.value, qualityNow.value)
)
const networkQualityTier = computed(() => {
  if (props.networkIssue === 'offline') return 'offline'
  if (props.networkIssue === 'netease-unavailable') return 'poor'
  return qualitySummary.value.tier
})
const networkQualityLabelKey = computed(() => {
  if (props.networkIssue === 'offline') return 'nav.networkDisconnected'
  if (props.networkIssue === 'netease-unavailable') return 'nav.networkPoor'
  return `nav.network${networkQualityTier.value[0].toUpperCase()}${networkQualityTier.value.slice(1)}`
})
const neteaseStatusKey = computed(() => {
  if (props.networkIssue === 'offline') return 'nav.neteaseWaitingForNetwork'
  if (props.networkIssue === 'netease-unavailable') return 'nav.neteaseRequestFailed'
  if (qualitySummary.value.sampleCount === 0) return 'nav.neteaseAwaitingRequest'
  if (qualitySummary.value.failedCount > 0) return 'nav.neteaseIntermittent'
  return 'nav.neteaseNoIssue'
})

const handleNeteaseRequestMetric = (event: Event): void => {
  const metric = (event as CustomEvent<NeteaseRequestMetric>).detail
  if (!metric || !Number.isFinite(metric.elapsedMs) || typeof metric.ok !== 'boolean') return
  const now = Date.now()
  requestSamples.value = [
    ...requestSamples.value.filter((sample) => now - sample.at <= 120_000),
    { elapsedMs: metric.elapsedMs, ok: metric.ok, at: now }
  ].slice(-12)
  qualityNow.value = now
}

const refreshAudioBuffer = (): void => {
  const player = window.vutronmusic
  const track = player?.currentTrack
  const media = player?.media
  audioBufferSeconds.value =
    player?.playing && track?.type === 'online' && !track.cache && !media?.paused
      ? (media?.bufferedAhead ?? null)
      : null
}

const runNetworkTest = async (): Promise<void> => {
  if (networkTesting.value) return
  networkTesting.value = true
  networkTestResult.value = null
  const runId = ++networkTestRunId
  const result = await probeNeteaseNetwork()
  if (runId !== networkTestRunId) return
  networkTestResult.value = result
  networkTesting.value = false
}

watch(networkWindowOpen, (open) => {
  if (audioBufferTimer !== null) window.clearInterval(audioBufferTimer)
  audioBufferTimer = null
  if (open) {
    refreshAudioBuffer()
    audioBufferTimer = window.setInterval(refreshAudioBuffer, 1_500)
  } else {
    audioBufferSeconds.value = null
    networkTestRunId += 1
    networkTesting.value = false
    networkTestResult.value = null
  }
})

const closeNetworkWindowOnOutsideClick = (event: PointerEvent): void => {
  if (!networkWidgetRef.value?.contains(event.target as Node)) networkWindowOpen.value = false
}

const closeNetworkWindowOnEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') networkWindowOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', closeNetworkWindowOnOutsideClick)
  document.addEventListener('keydown', closeNetworkWindowOnEscape)
  window.addEventListener(NETEASE_REQUEST_METRIC_EVENT, handleNeteaseRequestMetric)
  qualityTimer = window.setInterval(() => {
    qualityNow.value = Date.now()
  }, 15_000)
})

onBeforeUnmount(() => {
  networkTestRunId += 1
  document.removeEventListener('pointerdown', closeNetworkWindowOnOutsideClick)
  document.removeEventListener('keydown', closeNetworkWindowOnEscape)
  window.removeEventListener(NETEASE_REQUEST_METRIC_EVENT, handleNeteaseRequestMetric)
  if (qualityTimer !== null) window.clearInterval(qualityTimer)
  if (audioBufferTimer !== null) window.clearInterval(audioBufferTimer)
})

const settingsStore = useSettingsStore()
const { localMusic } = storeToRefs(settingsStore)

const streamStore = useStreamMusicStore()
const { enable } = storeToRefs(streamStore)

const router = useRouter()
const route: any = useRoute()

const handleRoute = (path: string): void => {
  router.push(path)
}

const isElectron = window.env?.isElectron || false

const isCurrentRoute = (path: string): boolean => {
  return path === route.path
}
</script>

<style scoped lang="scss">
.side-nav {
  position: fixed;
  top: 50%;
  left: 20px;
  padding: 15px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-transform: uppercase;
  user-select: none;
  -webkit-app-region: drag;
  z-index: 15;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-secondary-bg) 88%, transparent);
  backdrop-filter: saturate(150%) blur(18px);
  -webkit-backdrop-filter: saturate(150%) blur(18px);
  box-shadow: 0 10px 30px rgb(0 0 0 / 7%);
  border-radius: 16px;
  transform: translate(0, -50%);
  .history-navigation {
    width: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 6px 0 4px;
    box-sizing: border-box;
    -webkit-app-region: no-drag;
    transform: translateX(-4px);
  }

  button {
    height: 40px;
    width: 60px;
    padding: 0;
    margin: 15px 0;
    -webkit-app-region: no-drag;
    font-weight: 700;
    text-decoration: none;
    border-radius: 8px;
    background: transparent;
    color: var(--color-secondary);
    transition:
      background-color 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
    -webkit-user-drag: none;
    position: relative;
    .svg-icon {
      width: 100px;
      height: 40px;
      transition: color 0.2s ease-in;
    }
    .icon {
      width: 26px;
      height: 26px;
    }
    &:hover {
      background: color-mix(in srgb, var(--color-primary) 11%, transparent);
      .icon {
        color: var(--color-primary);
      }
    }
    &:active {
      transform: scale(0.92);
      transition: 0.2s;
    }
  }
  button::before {
    content: '';
    position: absolute;
    top: 50%;
    left: calc(100% + 0px);
    border: 5px solid transparent;
    border-right-color: var(--color-secondary-bg);
    transform: translateY(-50%);
    z-index: 1;
  }
  button::after {
    content: attr(data-tip);
    background-color: var(--color-secondary-bg);
    color: var(--color-text);
    position: absolute;
    top: 50%;
    left: calc(100% + 8px);
    width: auto;
    height: 32px;
    padding: 0 12px;
    border-radius: 7px;
    white-space: nowrap;
    line-height: 32px;
    font-size: 13px;
    font-weight: 650;
    box-shadow: 0 8px 20px rgb(0 0 0 / 12%);
    transform: translateY(-50%);
  }
  button::after,
  button::before {
    display: none;
  }
  button:hover:after,
  button:hover::before {
    display: block;
  }
  .history-navigation .history-button {
    flex: 0 0 24px;
    width: 24px;
    min-width: 24px;
    max-width: 24px;
    height: 24px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    box-sizing: border-box;
    background: transparent;
    color: var(--color-text);
    display: flex;
    align-items: center;
    justify-content: center;

    .history-icon {
      width: 18px;
      height: 18px;
      color: currentColor;
      fill: currentColor;
    }

    &:hover {
      background: var(--color-secondary-bg-for-transparent);
    }

    &::before,
    &::after {
      display: none !important;
    }
  }

  button.active {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
    .icon {
      color: var(--color-primary);
    }
  }

  .network-widget {
    position: relative;
    width: var(--responsive-side-button-width, 60px);
    border-top: 1px solid var(--color-border);
    -webkit-app-region: no-drag;
  }

  .network-button {
    color: var(--color-text);

    &::before,
    &::after {
      display: none !important;
    }

    .network-icon {
      color: currentColor;
    }

    .network-indicator {
      position: absolute;
      top: 5px;
      right: 7px;
      width: 9px;
      height: 9px;
      border: 2px solid var(--color-secondary-bg);
      border-radius: 50%;
      background: #9ca3af;
    }

    &.excellent .network-indicator,
    &.good .network-indicator {
      background: #16a34a;
    }

    &.fair .network-indicator {
      background: #d97706;
    }

    &.poor .network-indicator,
    &.offline .network-indicator {
      background: #dc2626;
    }
  }

  .network-panel {
    position: absolute;
    bottom: 0;
    left: calc(100% + 24px);
    box-sizing: border-box;
    width: 250px;
    padding: 15px;
    border: 1px solid var(--color-border);
    border-radius: 14px;
    background: color-mix(in srgb, var(--color-body-bg) 88%, transparent);
    backdrop-filter: saturate(150%) blur(20px);
    -webkit-backdrop-filter: saturate(150%) blur(20px);
    box-shadow: 0 10px 28px rgb(0 0 0 / 18%);
    color: var(--color-text);
    font-size: 13px;
    line-height: 1.4;
    text-transform: none;
    user-select: text;

    .network-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      font-size: 14px;
      font-weight: 700;
    }

    .network-test-button {
      flex: 0 0 auto;
      width: 60px;
      height: 26px;
      margin: 0 0 0 auto;
      padding: 0 8px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: var(--color-secondary-bg);
      color: var(--color-text);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;

      &:hover {
        background: var(--color-secondary-bg-for-transparent);
      }

      &:disabled {
        cursor: default;
        opacity: 0.6;
      }

      &::before,
      &::after {
        display: none !important;
      }
    }

    .network-test-result {
      margin: 12px 0 0;
      font-size: 12px;
      font-weight: 600;
    }

    .network-panel-indicator {
      width: 9px;
      height: 9px;
      flex: 0 0 9px;
      border-radius: 50%;
      background: #9ca3af;

      &.excellent,
      &.good {
        background: #16a34a;
      }

      &.fair {
        background: #d97706;
      }

      &.poor,
      &.offline {
        background: #dc2626;
      }
    }

    .network-panel-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-top: 8px;

      span {
        color: var(--color-secondary);
      }

      strong {
        text-align: right;
      }
    }

    .network-panel-note {
      margin: 12px 0 0;
      padding-top: 10px;
      border-top: 1px solid var(--color-border);
      color: var(--color-secondary);
      font-size: 12px;
    }
  }
}
</style>
