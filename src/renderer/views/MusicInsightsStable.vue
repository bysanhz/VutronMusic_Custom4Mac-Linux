<template>
  <div class="insights-page">
    <div class="hero">
      <div>
        <div class="eyebrow">NETEASE INSIGHTS</div>
        <h1>{{ t('insights.title') }}</h1>
        <p>{{ t('insights.description') }}</p>
      </div>
      <button
        class="refresh-button"
        :disabled="refreshing"
        :title="activeTab === 'footprint' ? t('insights.footprint.refreshHint') : ''"
        @click="refreshCurrent"
      >
        {{ refreshing ? t('common.refreshing') : t('common.refresh') }}
      </button>
    </div>

    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-show="activeTab === 'footprint'" class="panel">
      <div class="section-head">
        <div>
          <h2>{{ t('insights.footprint.title') }}</h2>
          <p>{{ t('insights.footprint.description') }}</p>
        </div>
        <div
          v-if="pendingNeteaseListenSeconds > 0"
          class="sync-status"
          :title="t('insights.footprint.pendingHint')"
        >
          {{
            t('insights.footprint.pending', {
              duration: formatPendingListenDuration(pendingNeteaseListenSeconds)
            })
          }}
        </div>
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <span>{{ t('insights.footprint.todayMetric') }}</span>
          <strong>{{
            footprint.todayCount !== undefined
              ? t('insights.footprint.todayCount', { count: footprint.todayCount })
              : '—'
          }}</strong>
          <small>{{
            t('insights.footprint.todayListen', {
              duration: formatDisplayListenDuration(displayTodaySeconds)
            })
          }}</small>
        </div>
        <div class="metric-card">
          <span>{{ t('insights.footprint.week') }}</span>
          <strong>{{ formatDisplayListenDuration(displayWeekSeconds) }}</strong>
        </div>
        <div class="metric-card">
          <span>{{ t('insights.footprint.month') }}</span>
          <strong>{{ formatDisplayListenDuration(displayMonthSeconds) }}</strong>
        </div>
        <div class="metric-card">
          <span>{{ t('insights.footprint.total') }}</span>
          <strong>{{ formatDisplayListenDuration(displayTotalSeconds) }}</strong>
        </div>
      </div>

      <div class="sub-tabs">
        <button
          :class="{ active: footprintRankMode === 'week' }"
          @click="footprintRankMode = 'week'"
        >
          {{ t('insights.footprint.weekTop') }}
        </button>
        <button :class="{ active: footprintRankMode === 'all' }" @click="footprintRankMode = 'all'">
          {{ t('insights.footprint.historyTop') }}
        </button>
      </div>

      <div class="stable-results">
        <InsightsTrackList
          v-show="footprintRankMode === 'week'"
          :items="footprint.weekTracks"
          :empty-text="t('insights.footprint.noWeek')"
        />
        <InsightsTrackList
          v-show="footprintRankMode === 'all'"
          :items="footprint.allTracks"
          :empty-text="t('insights.footprint.noHistory')"
        />
      </div>
    </section>

    <section v-show="activeTab === 'cloud'" class="panel">
      <div class="section-head">
        <div>
          <h2>{{ t('insights.cloud.title') }}</h2>
          <p>{{ t('insights.cloud.description') }}</p>
        </div>
      </div>

      <div class="tool-grid">
        <label>
          <span>{{ t('insights.cloud.track') }}</span>
          <select v-model="selectedCloudSongId">
            <option value="">{{ t('insights.cloud.select') }}</option>
            <option
              v-for="track in cloudTracks"
              :key="cloudSongId(track)"
              :value="cloudSongId(track)"
            >
              {{ cloudSongName(track) }} · {{ cloudSongId(track) }}
            </option>
          </select>
        </label>
        <label>
          <span>{{ t('insights.cloud.targetId') }}</span>
          <input
            v-model.trim="cloudTargetSongId"
            :placeholder="t('insights.cloud.targetPlaceholder')"
          />
        </label>
      </div>
      <div class="action-row">
        <button @click="matchCloudSong">{{ t('insights.cloud.rematch') }}</button>
        <button @click="readCloudLyric">{{ t('insights.cloud.readLyric') }}</button>
        <button class="danger" @click="removeCloudSong">{{ t('insights.cloud.delete') }}</button>
      </div>
      <pre v-show="cloudLyricPreview" class="preview">{{ cloudLyricPreview }}</pre>
      <div v-show="!cloudTracks.length" class="empty">{{ t('insights.cloud.empty') }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import InsightsTrackList from '../components/InsightsTrackList.vue'
import { useDataStore } from '../store/data'
import { useNormalStateStore } from '../store/state'
import {
  pendingNeteaseListenSeconds,
  reconcileNeteaseRemoteWeekDuration
} from '../utils/neteaseListenPending'
import { deleteCloudSong } from '../api/discovery'
import {
  cloudLyricGet,
  cloudMatch,
  listenRealtimeReport,
  userPlayRecord,
  listenTodaySongs,
  listenTotal
} from '../api/modern'
import {
  deepFindValue,
  extractCalendarWeekListenSeconds,
  extractUserPlayRecord,
  extractRealtimeListenSeconds,
  extractTodayListenSeconds,
  extractTodaySongCount,
  extractTotalListenSeconds,
  isSuccessfulResponse
} from '../services/neteaseModern'

const { t } = useI18n()

const tabs = computed(() => [
  { id: 'footprint' as const, label: t('insights.tabs.footprint') },
  { id: 'cloud' as const, label: t('insights.tabs.cloud') }
])

const activeTab = ref<'footprint' | 'cloud'>('footprint')
const dataStore = useDataStore()
const stateStore = useNormalStateStore()
const { liked, user } = storeToRefs(dataStore)
const { showToast } = stateStore

const refreshing = ref(false)
const footprint = reactive<{
  todayCount?: number
  todaySeconds?: number
  weekSeconds?: number
  monthSeconds?: number
  totalSeconds?: number
  weekTracks: any[]
  allTracks: any[]
}>({ weekTracks: [], allTracks: [] })
const footprintRankMode = ref<'week' | 'all'>('week')

const addPendingListenSeconds = (remoteSeconds?: number): number | undefined => {
  const remote = Number(remoteSeconds)
  const pending = Math.max(0, pendingNeteaseListenSeconds.value)
  if (!Number.isFinite(remote)) return pending > 0 ? pending : undefined
  return remote + pending
}

const displayTodaySeconds = computed(() => addPendingListenSeconds(footprint.todaySeconds))
const displayWeekSeconds = computed(() => addPendingListenSeconds(footprint.weekSeconds))
const displayMonthSeconds = computed(() => addPendingListenSeconds(footprint.monthSeconds))
const displayTotalSeconds = computed(() => addPendingListenSeconds(footprint.totalSeconds))

const formatPendingListenDuration = (seconds: number): string => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(value / 60)
  const restSeconds = value % 60
  if (minutes > 0) {
    return t('insights.footprint.durationMinutesSeconds', {
      minutes,
      seconds: restSeconds
    })
  }
  return t('insights.footprint.durationSeconds', { seconds: restSeconds })
}

const formatDisplayListenDuration = (seconds?: number): string => {
  if (!Number.isFinite(seconds) || Number(seconds) < 0) return '—'
  const value = Number(seconds)
  const days = Math.floor(value / 86400)
  const hours = Math.floor((value % 86400) / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (days > 0) return t('insights.footprint.durationDaysHours', { days, hours })
  if (hours > 0) return t('insights.footprint.durationHoursMinutes', { hours, minutes })
  return t('insights.footprint.durationMinutes', {
    minutes: Math.max(value === 0 ? 0 : 1, minutes)
  })
}

const PENDING_SYNC_INTERVAL_MS = 10_000
let footprintSyncInterval: number | null = null
let footprintRequestInFlight = false

const selectedCloudSongId = ref('')
const cloudTargetSongId = ref('')
const cloudLyricPreview = ref('')
const cloudTracks = computed(() => liked.value.cloudDisk ?? [])

const safeRequest = async <T,>(request: Promise<T> | T, label: string): Promise<T | undefined> => {
  try {
    return await request
  } catch (error) {
    console.warn(`[MusicInsights] ${label} 失败：`, error)
    return undefined
  }
}

const loadFootprint = async (): Promise<void> => {
  if (footprintRequestInFlight) return
  footprintRequestInFlight = true

  try {
    const uid = user.value.userId
    const [today, week, month, total, weekRecord, allRecord] = await Promise.all([
      safeRequest(listenTodaySongs(), '今日听歌'),
      safeRequest(listenRealtimeReport('week'), '本周听歌'),
      safeRequest(listenRealtimeReport('month'), '本月听歌'),
      safeRequest(listenTotal(), '累计听歌'),
      uid ? safeRequest(userPlayRecord(uid, 1), '本周真实播放记录') : Promise.resolve(undefined),
      uid ? safeRequest(userPlayRecord(uid, 0), '历史真实播放记录') : Promise.resolve(undefined)
    ])

    // 今日歌曲数继续使用专用接口；时长从 month 的逐日详情读取，避免周边界歧义。
    footprint.todayCount = extractTodaySongCount(today, week)
    footprint.todaySeconds = extractTodayListenSeconds(month) ?? extractTodayListenSeconds(week)

    // UI 的“本周”固定定义为周一 00:00 至今天，不直接采用网易云 week 周期边界。
    const nextRemoteWeekSeconds =
      extractCalendarWeekListenSeconds(month) ?? extractRealtimeListenSeconds(week)
    footprint.weekSeconds = nextRemoteWeekSeconds
    footprint.monthSeconds = extractRealtimeListenSeconds(month)

    // 只有 UI 实际使用的“本周时长”增长，才抵扣本机 pending。
    reconcileNeteaseRemoteWeekDuration(nextRemoteWeekSeconds)
    footprint.totalSeconds = extractTotalListenSeconds(total)

    footprint.weekTracks = extractUserPlayRecord(weekRecord, 'week')
    footprint.allTracks = extractUserPlayRecord(allRecord, 'all')
  } finally {
    footprintRequestInFlight = false
  }
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * 只刷新网易云用于“待同步”确认的远端时长。
 *
 * 与完整 loadFootprint() 不同，这里优先只请求 month realtime report：
 * 它同时包含今日、本月以及按自然周汇总所需的逐日数据，因此适合高频确认，
 * 不需要每 10 秒把今日/周/月/累计/两份播放排行全部请求一遍。
 */
const refreshPendingRemoteDuration = async (): Promise<void> => {
  const month = await safeRequest(listenRealtimeReport('month'), '确认听歌时长同步')
  if (!month) return

  let nextRemoteWeekSeconds = extractCalendarWeekListenSeconds(month)
  const nextMonthSeconds = extractRealtimeListenSeconds(month)
  const nextTodaySeconds = extractTodayListenSeconds(month)

  // 少数账号/接口版本的 month report 不带逐日明细，无法计算自然周；
  // 此时才额外请求 week report，避免待同步状态永远无法被抵扣。
  if (nextRemoteWeekSeconds === undefined) {
    const week = await safeRequest(listenRealtimeReport('week'), '确认本周听歌时长同步')
    nextRemoteWeekSeconds = extractRealtimeListenSeconds(week)
  }

  if (nextRemoteWeekSeconds !== undefined) {
    footprint.weekSeconds = nextRemoteWeekSeconds
    reconcileNeteaseRemoteWeekDuration(nextRemoteWeekSeconds)
  }
  if (nextMonthSeconds !== undefined) footprint.monthSeconds = nextMonthSeconds
  if (nextTodaySeconds !== undefined) footprint.todaySeconds = nextTodaySeconds
}

/**
 * 手动刷新时，在完整刷新之后进行一小段“远端确认突发轮询”。
 * 网易云写入存在最终一致性，单次立即读取经常仍是旧值；短时复查比原先
 * 固定等 30 秒更符合“刷新”按钮的用户预期，同时不会重复 scrobble 当前歌曲。
 */
const refreshFootprintWithConfirmation = async (): Promise<void> => {
  await loadFootprint()
  if (pendingNeteaseListenSeconds.value <= 0) return

  for (const delay of [900, 1800, 3200]) {
    await wait(delay)
    await refreshPendingRemoteDuration()
    if (pendingNeteaseListenSeconds.value <= 0) return
  }

  showToast(t('insights.footprint.pendingHint'))
}

const cloudSongId = (track: any): string =>
  String(track?.songId ?? track?.simpleSong?.id ?? track?.id ?? '')
const cloudSongName = (track: any): string =>
  track?.simpleSong?.name ?? track?.songName ?? track?.name ?? t('insights.cloud.unknownTrack')

const matchCloudSong = async (): Promise<void> => {
  const uid = user.value.userId
  if (!uid || !selectedCloudSongId.value || !cloudTargetSongId.value) {
    showToast(t('insights.cloud.selectAndTarget'))
    return
  }

  const result = await safeRequest(
    cloudMatch({ uid, sid: selectedCloudSongId.value, asid: cloudTargetSongId.value }),
    '云盘重新匹配'
  )
  if (!isSuccessfulResponse(result)) {
    showToast(t('insights.cloud.rematchFailed'))
    return
  }
  await safeRequest(dataStore.fetchCloudDisk(), '刷新云盘')
  showToast(t('insights.cloud.rematched'))
}

const readCloudLyric = async (): Promise<void> => {
  const uid = user.value.userId
  if (!uid || !selectedCloudSongId.value) {
    showToast(t('insights.cloud.selectFirst'))
    return
  }
  const result = await safeRequest(
    cloudLyricGet({ uid, sid: selectedCloudSongId.value }),
    '读取云盘歌词'
  )
  cloudLyricPreview.value = String(
    deepFindValue(result, ['lyric', 'lrc', 'yrc', 'content']) ?? t('insights.cloud.noLyric')
  ).slice(0, 3000)
}

const removeCloudSong = async (): Promise<void> => {
  if (!selectedCloudSongId.value) {
    showToast(t('insights.cloud.selectFirst'))
    return
  }
  if (!confirm(t('insights.cloud.deleteConfirm'))) return

  const result = await safeRequest(
    deleteCloudSong(Number(selectedCloudSongId.value)),
    '删除云盘歌曲'
  )
  if (!isSuccessfulResponse(result)) {
    showToast(t('insights.cloud.deleteFailed'))
    return
  }
  selectedCloudSongId.value = ''
  cloudLyricPreview.value = ''
  await safeRequest(dataStore.fetchCloudDisk(), '刷新云盘')
  showToast(t('insights.cloud.deleted'))
}

const refreshCurrent = async (): Promise<void> => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    if (activeTab.value === 'footprint') await refreshFootprintWithConfirmation()
    else await safeRequest(dataStore.fetchCloudDisk(), '刷新云盘')
  } finally {
    refreshing.value = false
  }
}

const stopPendingSyncPolling = (): void => {
  if (footprintSyncInterval === null) return
  window.clearInterval(footprintSyncInterval)
  footprintSyncInterval = null
}

const startPendingSyncPolling = (): void => {
  if (
    footprintSyncInterval !== null ||
    activeTab.value !== 'footprint' ||
    pendingNeteaseListenSeconds.value <= 0
  ) {
    return
  }

  footprintSyncInterval = window.setInterval(() => {
    if (activeTab.value !== 'footprint' || pendingNeteaseListenSeconds.value <= 0) {
      stopPendingSyncPolling()
      return
    }
    void refreshPendingRemoteDuration()
  }, PENDING_SYNC_INTERVAL_MS)
}

const handleNeteaseScrobble = (): void => {
  if (activeTab.value !== 'footprint') return

  // scrobble 已经提交后，先快速确认一次；若仍未落库，10 秒轻量轮询会继续确认。
  window.setTimeout(() => {
    if (!refreshing.value) void refreshPendingRemoteDuration()
  }, 1200)
}

watch(
  () => [activeTab.value, pendingNeteaseListenSeconds.value] as const,
  ([tab, pendingSeconds]) => {
    if (tab === 'footprint' && pendingSeconds > 0) startPendingSyncPolling()
    else stopPendingSyncPolling()

    if (tab === 'cloud' && !cloudTracks.value.length) {
      void safeRequest(dataStore.fetchCloudDisk(), '加载云盘')
    }
  }
)

onMounted(() => {
  window.addEventListener('vutronmusic-netease-scrobble', handleNeteaseScrobble)
  void loadFootprint()
  startPendingSyncPolling()
})

onBeforeUnmount(() => {
  window.removeEventListener('vutronmusic-netease-scrobble', handleNeteaseScrobble)
  stopPendingSyncPolling()
})
</script>

<style scoped lang="scss">
.insights-page {
  max-width: 1380px;
  margin: 0 auto;
  padding: 4px 0 136px;
}

.hero,
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}

.hero {
  padding: 24px 28px;
  border-radius: 18px;
  background: var(--color-secondary-bg);

  h1 {
    margin: 5px 0 8px;
    font-size: 36px;
  }

  p {
    margin: 0;
    opacity: 0.62;
  }
}

.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: var(--color-primary);
}

.refresh-button,
.action-row button,
.load-more,
.tabs button,
.sub-tabs button,
.tag-list button {
  border: 0;
  cursor: pointer;
  color: var(--color-text);
  background: var(--color-secondary-bg);
}

button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.refresh-button,
.action-row button,
.load-more {
  padding: 10px 16px;
  border-radius: 9px;
  font-weight: 650;
}

.tabs {
  display: flex;
  gap: 8px;
  margin: 18px 0;
  flex-wrap: wrap;

  button {
    padding: 9px 16px;
    border-radius: 999px;
    opacity: 0.68;
  }

  button.active {
    opacity: 1;
    background: var(--color-primary);
    color: white;
  }
}

.panel {
  padding: 24px 26px 30px;
  border-radius: 18px;
  background: var(--color-secondary-bg);

  h2 {
    margin: 0 0 5px;
    font-size: 25px;
  }

  h3 {
    margin: 28px 0 14px;
  }

  p {
    margin: 0;
    opacity: 0.6;
  }
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 20px 0 18px;
}

.metric-grid.compact {
  grid-template-columns: minmax(170px, 0.3fr) minmax(0, 1fr);
}

.metric-card {
  min-height: 136px;
  padding: 18px 20px;
  border-radius: 14px;
  background: var(--color-body-bg);
  display: grid;
  grid-template-rows: auto 1fr auto;
  row-gap: 8px;
  align-items: end;
  box-sizing: border-box;
  min-width: 0;

  > span {
    align-self: start;
    font-size: 12px;
    line-height: 1.35;
    opacity: 0.58;
  }

  strong {
    align-self: end;
    font-size: clamp(21px, 2vw, 25px);
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  small {
    display: block;
    align-self: end;
    min-height: 18px;
    margin-top: 0;
    font-size: 12px;
    font-weight: 650;
    line-height: 1.4;
    opacity: 0.58;
  }
}

.sync-status {
  flex: 0 0 auto;
  padding: 7px 11px;
  border-radius: 999px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-body-bg));
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.metric-grid:not(.compact) .metric-card:nth-child(4) strong {
  white-space: nowrap;
  font-size: clamp(19px, 1.8vw, 24px);
}

.metric-card.wide strong,
.summary-text {
  font-size: 14px;
  line-height: 1.65;
  font-weight: 500;
}

.sub-tabs,
.tag-list,
.action-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 14px 0;
}

.sub-tabs button,
.tag-list button {
  padding: 7px 12px;
  border-radius: 8px;
  opacity: 0.66;
}

.sub-tabs button.active,
.tag-list button.active {
  opacity: 1;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 13%, var(--color-secondary-bg));
}

.tag-list {
  max-height: 168px;
  overflow: auto;
  align-content: flex-start;
}

.results-header {
  min-height: 22px;
  margin: 8px 0 10px;
  font-size: 12px;
  opacity: 0.5;
}

.stable-results {
  min-height: 80px;
  transition: opacity 0.15s ease;

  &.loading {
    opacity: 0.62;
    pointer-events: none;
  }
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 22px;
}

.tool-grid.one-line {
  grid-template-columns: minmax(0, 560px);
}

label {
  display: flex;
  flex-direction: column;
  gap: 7px;

  span {
    font-size: 12px;
    opacity: 0.62;
  }
}

select,
input {
  width: 100%;
  min-height: 40px;
  padding: 8px 11px;
  color: var(--color-text);
  background: var(--color-body-bg);
  border: 1px solid color-mix(in srgb, var(--color-text) 12%, transparent);
  border-radius: 8px;
  outline: none;
}

.action-row button {
  background: var(--color-body-bg);
}

.action-row button:hover,
.load-more:hover,
.refresh-button:hover {
  color: var(--color-primary);
}

.action-row .danger {
  color: #d94a4a;
}

.preview {
  margin-top: 16px;
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  padding: 16px;
  border-radius: 10px;
  background: var(--color-body-bg);
  font-family: inherit;
  line-height: 1.6;
}

.dynamic-cover {
  display: block;
  max-width: 360px;
  max-height: 360px;
  object-fit: cover;
  border-radius: 14px;
  margin: 20px 0;
}

.load-more {
  display: block;
  margin: 18px auto 0;
}

.empty {
  padding: 34px 0;
  text-align: center;
  opacity: 0.5;
}

@media (max-width: 900px) {
  .metric-grid,
  .metric-grid.compact,
  .tool-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .hero,
  .section-head {
    flex-direction: column;
  }

  .metric-grid,
  .metric-grid.compact,
  .tool-grid {
    grid-template-columns: 1fr;
  }
}
</style>
