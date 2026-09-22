<template>
  <div class="insights-page">
    <div class="hero">
      <div>
        <div class="eyebrow">NETEASE INSIGHTS</div>
        <h1>{{ t('insights.title') }}</h1>
        <p>{{ t('insights.description') }}</p>
      </div>
      <button class="refresh-button" :disabled="refreshing" @click="refreshCurrent">
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
        <div v-if="pendingNeteaseListenSeconds > 0" class="sync-status">
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

    <section v-show="activeTab === 'style'" class="panel">
      <div class="section-head">
        <div>
          <h2>{{ t('insights.style.title') }}</h2>
          <p>{{ styleDescription || t('insights.style.description') }}</p>
        </div>
        <select v-model="styleSort" :disabled="styleLoading" @change="loadStyleResources(true)">
          <option :value="0">{{ t('insights.style.hot') }}</option>
          <option :value="1">{{ t('insights.style.latest') }}</option>
        </select>
      </div>

      <div class="tag-list">
        <button
          v-for="tag in styleTags"
          :key="String(tag.id)"
          :class="{ active: String(activeStyleId) === String(tag.id) }"
          :disabled="styleLoading && String(activeStyleId) === String(tag.id)"
          @click="selectStyle(tag.id)"
        >
          <span v-if="tag.preferred">●</span>{{ tag.name }}
        </button>
      </div>

      <div class="sub-tabs">
        <button
          v-for="resource in styleResourceTabs"
          :key="resource.id"
          :class="{ active: styleResourceType === resource.id }"
          @click="switchStyleResource(resource.id)"
        >
          {{ resource.label }}
        </button>
      </div>

      <div class="results-header">
        <span>{{
          styleLoading ? t('common.loading') : t('common.items', { count: currentStyleCount })
        }}</span>
      </div>

      <div class="stable-results" :class="{ loading: styleLoading }">
        <InsightsTrackList
          v-show="styleResourceType === 'song'"
          :items="styleTracks"
          :empty-text="t('insights.style.noSong')"
        />
        <InsightsResourceGrid
          v-show="styleResourceType === 'album'"
          :items="styleAlbums"
          type="album"
          :empty-text="t('insights.style.noAlbum')"
        />
        <InsightsResourceGrid
          v-show="styleResourceType === 'artist'"
          :items="styleArtists"
          type="artist"
          :empty-text="t('insights.style.noArtist')"
        />
        <InsightsResourceGrid
          v-show="styleResourceType === 'playlist'"
          :items="stylePlaylists"
          type="playlist"
          :empty-text="t('insights.style.noPlaylist')"
        />
      </div>

      <button
        v-if="styleCursor !== undefined && styleCursor !== null && styleCursor !== ''"
        class="load-more"
        :disabled="styleLoading"
        @click="loadStyleResources(false)"
      >
        {{ styleLoading ? t('common.loading') : t('common.loadMore') }}
      </button>
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
import InsightsResourceGrid from '../components/InsightsResourceGrid.vue'
import { useDataStore } from '../store/data'
import { useNormalStateStore } from '../store/state'
import {
  pendingNeteaseListenSeconds,
  reconcileNeteaseRemoteWeekDuration
} from '../utils/neteaseListenPending'
import { styleList, stylePreference, deleteCloudSong } from '../api/discovery'
import {
  cloudLyricGet,
  cloudMatch,
  listenRealtimeReport,
  userPlayRecord,
  listenTodaySongs,
  listenTotal,
  styleDetail,
  styleResource,
  type StyleResourceType
} from '../api/modern'
import {
  collectStyleTags,
  deepFindValue,
  extractAlbums,
  extractArtists,
  extractCalendarWeekListenSeconds,
  extractCursor,
  extractUserPlayRecord,
  extractPlaylists,
  extractRealtimeListenSeconds,
  extractTodayListenSeconds,
  extractTodaySongCount,
  extractTotalListenSeconds,
  extractTracks,
  isSuccessfulResponse,
  type StyleTag
} from '../services/neteaseModern'

const { t } = useI18n()

const tabs = computed(() => [
  { id: 'footprint' as const, label: t('insights.tabs.footprint') },
  { id: 'style' as const, label: t('insights.tabs.style') },
  { id: 'cloud' as const, label: t('insights.tabs.cloud') }
])

const styleResourceTabs = computed<Array<{ id: StyleResourceType; label: string }>>(() => [
  { id: 'song', label: t('insights.style.song') },
  { id: 'album', label: t('insights.style.album') },
  { id: 'artist', label: t('insights.style.artist') },
  { id: 'playlist', label: t('insights.style.playlist') }
])

const activeTab = ref<'footprint' | 'style' | 'cloud'>('footprint')
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

const styleTags = ref<StyleTag[]>([])
const activeStyleId = ref<number | string>('')
const styleDescription = ref('')
const styleResourceType = ref<StyleResourceType>('song')
const styleSort = ref(0)
const styleCursor = ref<number | string | undefined>(undefined)
const styleTracks = ref<any[]>([])
const styleAlbums = ref<any[]>([])
const styleArtists = ref<any[]>([])
const stylePlaylists = ref<any[]>([])
const styleLoading = ref(false)
let styleRequestRevision = 0
let styleDetailRevision = 0
const PENDING_SYNC_INTERVAL_MS = 30_000
let footprintRefreshTimer: number | null = null
let footprintSyncInterval: number | null = null
let footprintRequestInFlight = false

const selectedCloudSongId = ref('')
const cloudTargetSongId = ref('')
const cloudLyricPreview = ref('')
const cloudTracks = computed(() => liked.value.cloudDisk ?? [])

const currentStyleCount = computed(() => {
  if (styleResourceType.value === 'song') return styleTracks.value.length
  if (styleResourceType.value === 'album') return styleAlbums.value.length
  if (styleResourceType.value === 'artist') return styleArtists.value.length
  return stylePlaylists.value.length
})

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

const loadStyleCatalog = async (): Promise<void> => {
  const [listResult, preferenceResult] = await Promise.all([
    safeRequest(styleList(), '曲风列表'),
    safeRequest(stylePreference(), '曲风偏好')
  ])
  const tags = collectStyleTags(listResult, preferenceResult).slice(0, 100)
  styleTags.value = tags

  if (!activeStyleId.value && tags.length) {
    const preferred = tags.find((tag) => tag.preferred) ?? tags[0]
    await selectStyle(preferred.id)
  }
}

const applyStyleResult = (result: any, reset: boolean): void => {
  if (styleResourceType.value === 'song') {
    const items = extractTracks(result, 80)
    styleTracks.value = reset ? items : [...styleTracks.value, ...items]
  } else if (styleResourceType.value === 'album') {
    const items = extractAlbums(result, 80)
    styleAlbums.value = reset ? items : [...styleAlbums.value, ...items]
  } else if (styleResourceType.value === 'artist') {
    const items = extractArtists(result, 80)
    styleArtists.value = reset ? items : [...styleArtists.value, ...items]
  } else {
    const items = extractPlaylists(result, 80)
    stylePlaylists.value = reset ? items : [...stylePlaylists.value, ...items]
  }
}

const loadStyleResources = async (reset = true): Promise<void> => {
  if (!activeStyleId.value) return

  const revision = ++styleRequestRevision
  const requestedType = styleResourceType.value
  const requestedTag = activeStyleId.value
  styleLoading.value = true

  try {
    const result = await styleResource(requestedType, {
      tagId: requestedTag,
      cursor: reset ? 0 : styleCursor.value,
      size: 40,
      sort: styleSort.value
    })

    if (
      revision !== styleRequestRevision ||
      requestedType !== styleResourceType.value ||
      String(requestedTag) !== String(activeStyleId.value)
    ) {
      return
    }

    applyStyleResult(result, reset)
    styleCursor.value = extractCursor(result)
  } catch (error) {
    console.warn('[MusicInsights] 曲风资源加载失败：', error)
    if (revision === styleRequestRevision) showToast(t('insights.style.loadFailed'))
  } finally {
    if (revision === styleRequestRevision) styleLoading.value = false
  }
}

const selectStyle = async (id: number | string): Promise<void> => {
  if (String(activeStyleId.value) === String(id) && currentStyleCount.value > 0) return

  activeStyleId.value = id
  styleCursor.value = undefined
  const detailRevision = ++styleDetailRevision

  const detailPromise = safeRequest(styleDetail(id), '曲风详情')
  const resourcesPromise = loadStyleResources(true)
  const detail = await detailPromise

  if (detailRevision === styleDetailRevision && String(activeStyleId.value) === String(id)) {
    styleDescription.value = String(
      deepFindValue(detail, ['desc', 'description', 'tagDesc', 'intro']) ?? ''
    )
  }

  await resourcesPromise
}

const switchStyleResource = async (type: StyleResourceType): Promise<void> => {
  if (styleResourceType.value === type) return
  styleResourceType.value = type
  styleCursor.value = undefined
  await loadStyleResources(true)
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
    if (activeTab.value === 'footprint') await loadFootprint()
    else if (activeTab.value === 'style') await loadStyleCatalog()
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
    void loadFootprint()
  }, PENDING_SYNC_INTERVAL_MS)
}

const handleNeteaseScrobble = (): void => {
  if (activeTab.value !== 'footprint') return
  if (footprintRefreshTimer !== null) window.clearTimeout(footprintRefreshTimer)
  // 网易云统计写入不是严格事务同步；稍等片刻再读，减少刚上报就读到旧值的概率。
  footprintRefreshTimer = window.setTimeout(() => {
    footprintRefreshTimer = null
    if (!refreshing.value) void loadFootprint()
  }, 1800)
}

watch(
  () => [activeTab.value, pendingNeteaseListenSeconds.value] as const,
  ([tab, pendingSeconds]) => {
    if (tab === 'footprint' && pendingSeconds > 0) startPendingSyncPolling()
    else stopPendingSyncPolling()

    if (tab === 'style' && !styleTags.value.length) void loadStyleCatalog()
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
  if (footprintRefreshTimer !== null) {
    window.clearTimeout(footprintRefreshTimer)
    footprintRefreshTimer = null
  }
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
