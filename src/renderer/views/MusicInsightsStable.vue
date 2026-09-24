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
      <div class="section-head footprint-head">
        <div class="section-information">
          <h2>{{ t('insights.footprint.title') }}</h2>
          <p>{{ t('insights.footprint.description') }}</p>
          <dl class="sync-status-help">
            <div>
              <dt>{{ t('insights.footprint.pendingUnsubmittedLabel') }}</dt>
              <dd>{{ t('insights.footprint.pendingUnsubmittedHelp') }}</dd>
            </div>
            <div>
              <dt>{{ t('insights.footprint.pendingSubmittedLabel') }}</dt>
              <dd>{{ t('insights.footprint.pendingSubmittedHelp') }}</dd>
            </div>
            <div>
              <dt>{{ t('insights.footprint.pendingSyncedLabel') }}</dt>
              <dd>{{ t('insights.footprint.pendingSyncedHelp') }}</dd>
            </div>
          </dl>
        </div>
        <div class="sync-status-panel">
          <strong class="sync-status-title">{{ t('insights.footprint.syncStatusTitle') }}</strong>
          <div class="sync-status-stack">
            <template v-if="visiblePendingNeteaseListenSeconds > 0">
              <div class="sync-status" :class="{ inactive: pendingUnsubmittedSeconds <= 0 }">
                {{
                  t('insights.footprint.pendingUnsubmitted', {
                    duration: formatPendingListenDuration(pendingUnsubmittedSeconds)
                  })
                }}
              </div>
              <div class="sync-status" :class="{ inactive: submittedNeteaseListenSeconds <= 0 }">
                {{
                  t('insights.footprint.pendingSubmitted', {
                    duration: formatPendingListenDuration(submittedNeteaseListenSeconds)
                  })
                }}
              </div>
            </template>
            <div v-else class="sync-status synced">
              {{ t('insights.footprint.pendingSynced') }}
            </div>
          </div>
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
          <div class="metric-foot">
            <small>{{
              t('insights.footprint.todayListen', {
                duration: formatDisplayListenDuration(displayTodaySeconds)
              })
            }}</small>
            <small v-if="todayDataConflict" class="metric-warning">{{
              t('insights.footprint.todayDataConflict')
            }}</small>
          </div>
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

      <div class="cloud-single-tools">
        <div class="cloud-tools-heading">
          <div>
            <h3>{{ t('insights.cloud.singleToolsTitle') }}</h3>
            <p>{{ t('insights.cloud.singleToolsDescription') }}</p>
          </div>
        </div>

        <div ref="cloudTrackPickerRef" class="cloud-track-select">
          <span class="cloud-track-label">{{ t('insights.cloud.track') }}</span>
          <button
            class="cloud-track-picker-trigger"
            type="button"
            :aria-expanded="cloudTrackPickerOpen"
            @click.stop="toggleCloudTrackPicker"
          >
            <span class="cloud-track-picker-value">
              {{
                selectedCloudTrack
                  ? `${cloudSongName(selectedCloudTrack)} · ${cloudSongId(selectedCloudTrack)}`
                  : t('insights.cloud.select')
              }}
            </span>
            <SvgIcon icon-class="dropdown" />
          </button>

          <div
            v-if="cloudTrackPickerOpen"
            class="cloud-track-picker-panel"
            @click.stop
            @keydown.esc.stop.prevent="closeCloudTrackPicker"
          >
            <div class="cloud-track-search">
              <SvgIcon icon-class="search" />
              <input
                ref="cloudTrackSearchInputRef"
                v-model="cloudSingleKeyword"
                type="search"
                :placeholder="
                  t('localMusic.search', {
                    target: t('insights.cloud.track')
                  })
                "
              />
            </div>

            <div class="cloud-track-picker-results">
              <button
                v-for="track in filteredCloudTracks"
                :key="cloudSongId(track)"
                type="button"
                class="cloud-track-picker-option"
                :class="{ active: cloudSongId(track) === selectedCloudSongId }"
                @click="selectCloudTrack(track)"
              >
                <span>{{ cloudSongName(track) }}</span>
                <small>{{ cloudSongId(track) }}</small>
              </button>
              <div v-if="!filteredCloudTracks.length" class="cloud-track-picker-empty">
                {{ t('insights.cloud.empty') }}
              </div>
            </div>
          </div>
        </div>

        <div class="cloud-tool-actions">
          <div class="cloud-tool-card">
            <div class="cloud-tool-card-copy">
              <strong>{{ t('insights.cloud.lyricToolTitle') }}</strong>
              <span>{{ t('insights.cloud.lyricToolDescription') }}</span>
            </div>
            <button :disabled="!selectedCloudSongId" @click="readCloudLyric">
              {{ t('insights.cloud.readLyric') }}
            </button>
          </div>

          <div class="cloud-tool-card cloud-rematch-card">
            <div class="cloud-tool-card-copy">
              <strong>{{ t('insights.cloud.rematch') }}</strong>
              <span>{{ t('insights.cloud.rematchDescription') }}</span>
            </div>
            <div class="cloud-rematch-controls">
              <label>
                <span>{{ t('insights.cloud.targetId') }}</span>
                <input
                  v-model.trim="cloudTargetSongId"
                  :placeholder="t('insights.cloud.targetPlaceholder')"
                />
                <small>{{ t('insights.cloud.targetIdHint') }}</small>
              </label>
              <button
                :disabled="!selectedCloudSongId || !cloudTargetSongId"
                @click="matchCloudSong"
              >
                {{ t('insights.cloud.rematch') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="cloud-delete-entry">
        <div>
          <strong>{{ t('insights.cloud.deleteToolTitle') }}</strong>
          <span>{{ t('insights.cloud.deleteToolDescription') }}</span>
        </div>
        <button
          class="danger secondary-danger"
          :class="{ active: cloudBatchMode }"
          :disabled="cloudBatchDeleting || !cloudTracks.length"
          @click="toggleCloudBatchMode"
        >
          {{ cloudBatchMode ? t('insights.cloud.batchClose') : t('insights.cloud.batchDelete') }}
        </button>
      </div>

      <div v-show="cloudBatchMode && cloudTracks.length" class="cloud-batch-panel">
        <div class="cloud-batch-sticky-tools">
          <div class="cloud-batch-search">
            <SvgIcon icon-class="search" />
            <input
              v-model="cloudBatchKeyword"
              type="search"
              :placeholder="
                t('localMusic.search', {
                  target: t('insights.cloud.track')
                })
              "
            />
          </div>

          <div class="cloud-batch-toolbar">
            <label class="cloud-batch-select-all">
              <input
                type="checkbox"
                :checked="cloudBatchAllSelected"
                :disabled="cloudBatchDeleting"
                @change="toggleCloudBatchAll"
              />
              <span>{{ t('insights.cloud.batchSelectAll') }}</span>
            </label>
            <span class="cloud-batch-count">
              {{ t('insights.cloud.batchSelected', { count: cloudBatchSongIds.length }) }}
            </span>
            <button
              class="cloud-batch-clear"
              :disabled="cloudBatchDeleting || !cloudBatchSongIds.length"
              @click="clearCloudBatchSelection"
            >
              {{ t('insights.cloud.batchClearSelection') }}
            </button>
            <button
              class="danger cloud-batch-delete"
              :disabled="cloudBatchDeleting || !cloudBatchSongIds.length"
              @click="removeCloudSongs"
            >
              {{
                cloudBatchDeleting
                  ? t('insights.cloud.batchDeleting', { count: cloudBatchSongIds.length })
                  : t('insights.cloud.batchDeleteSelected', { count: cloudBatchSongIds.length })
              }}
            </button>
          </div>

          <div class="cloud-batch-range">
            <span class="cloud-batch-range-label">
              {{ t('insights.cloud.batchRange') }}
            </span>
            <span class="cloud-batch-range-hint">
              {{ t('insights.cloud.batchRangeHint') }}
            </span>
            <button
              :disabled="cloudBatchDeleting || cloudBatchSongIds.length < 2"
              @click="selectCloudBatchRange"
            >
              {{ t('insights.cloud.batchRangeSelect') }}
            </button>
          </div>
        </div>

        <div class="cloud-batch-list">
          <label
            v-for="(track, index) in filteredCloudBatchTracks"
            :key="`batch-${cloudSongId(track)}`"
            class="cloud-batch-item"
          >
            <input
              v-model="cloudBatchSongIds"
              type="checkbox"
              :value="cloudSongId(track)"
              :disabled="cloudBatchDeleting"
            />
            <span class="cloud-batch-index">{{ index + 1 }}</span>
            <span class="cloud-batch-name">{{ cloudSongName(track) }}</span>
            <span class="cloud-batch-id">{{ cloudSongId(track) }}</span>
          </label>
          <div v-if="!filteredCloudBatchTracks.length" class="cloud-batch-empty">
            {{ t('insights.cloud.searchNoResults') }}
          </div>
        </div>
      </div>

      <pre v-show="cloudLyricPreview" class="preview">{{ cloudLyricPreview }}</pre>
      <div v-show="!cloudTracks.length" class="empty">{{ t('insights.cloud.empty') }}</div>
    </section>

    <button
      class="insights-scroll-top"
      :title="t('localMusic.scrollToTop')"
      :aria-label="t('localMusic.scrollToTop')"
      @click="scrollToInsightsTop"
    >
      <SvgIcon icon-class="arrow-up-alt" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import InsightsTrackList from '../components/InsightsTrackList.vue'
import SvgIcon from '../components/SvgIcon.vue'
import { useDataStore } from '../store/data'
import { usePlayerStore } from '../store/player'
import { useNormalStateStore } from '../store/state'
import {
  getNeteaseListenLedgerTotals,
  localDateKey,
  neteaseListenEntries,
  provisionalNeteaseListen,
  reconcileNeteaseListenReport,
  setActiveNeteaseListenAccount
} from '../utils/neteaseListenLedger'
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
const playerStore = usePlayerStore()
const stateStore = useNormalStateStore()
const { liked, user } = storeToRefs(dataStore)
const { showToast } = stateStore
const scrollMainTo = inject<(top: number, behavior?: string) => void>('scrollMainTo', () => {})
const scrollToInsightsTop = (): void => scrollMainTo(0, 'smooth')

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
const clockNow = ref(Date.now())
const accountId = computed(() => String(user.value.userId || 'anonymous'))

const startOfToday = computed(() => {
  const value = new Date(clockNow.value)
  value.setHours(0, 0, 0, 0)
  return value.getTime()
})
const endOfToday = computed(() => {
  const value = new Date(startOfToday.value)
  value.setHours(23, 59, 59, 999)
  return value.getTime()
})
const startOfWeek = computed(() => {
  const value = new Date(startOfToday.value)
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7))
  return value.getTime()
})
const startOfMonth = computed(() => {
  const value = new Date(startOfToday.value)
  value.setDate(1)
  return value.getTime()
})

const todayPeriodKey = computed(() => `today:${localDateKey(startOfToday.value)}`)
const weekPeriodKey = computed(() => `week:${localDateKey(startOfWeek.value)}`)
const monthPeriodKey = computed(() => `month:${localDateKey(startOfMonth.value).slice(0, 7)}`)
const totalPeriodKey = 'total'

const ledgerTotals = (start: number, end: number, periodKey: string) => {
  // 显式读取两个 ref，使日期范围和账本变化都能触发 computed 更新。
  void neteaseListenEntries.value
  void provisionalNeteaseListen.value
  return getNeteaseListenLedgerTotals(accountId.value, start, end, periodKey)
}
const todayLedger = computed(() =>
  ledgerTotals(startOfToday.value, endOfToday.value, todayPeriodKey.value)
)
const weekLedger = computed(() =>
  ledgerTotals(startOfWeek.value, endOfToday.value, weekPeriodKey.value)
)
const monthLedger = computed(() =>
  ledgerTotals(startOfMonth.value, endOfToday.value, monthPeriodKey.value)
)
const totalLedger = computed(() =>
  ledgerTotals(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, totalPeriodKey)
)
const ledgerUnconfirmedSeconds = (value: {
  pending: number
  accepted: number
  provisional: number
}) => value.pending + value.accepted + value.provisional
// 状态栏以 month 实时报表及其逐日明细为准。listen/total 的累计值通常更新更慢，
// 只用于累计卡片的本机补偿，不能再把已经由实时报表确认的时长显示成“待确认”。
const visiblePendingNeteaseListenSeconds = computed(() =>
  Math.max(
    ledgerUnconfirmedSeconds(todayLedger.value),
    ledgerUnconfirmedSeconds(weekLedger.value),
    ledgerUnconfirmedSeconds(monthLedger.value)
  )
)
const backgroundPendingNeteaseListenSeconds = computed(() =>
  Math.max(visiblePendingNeteaseListenSeconds.value, ledgerUnconfirmedSeconds(totalLedger.value))
)

/*
 * 四张统计卡只展示网易云服务端已经确认的账号数据。
 *
 * 本机账本属于设备局部状态；如果把 pending/accepted/provisional 直接叠加进卡片，
 * 同一账号在两台 Mac 上会因为各自 localStorage 不同而显示不同的“今日/本周/本月/累计”。
 * 未同步时长继续完整保留在右侧同步状态中，不再污染跨设备可比较的账号统计。
 */
const displayTodaySeconds = computed(() => footprint.todaySeconds)
const displayWeekSeconds = computed(() => footprint.weekSeconds)
const displayMonthSeconds = computed(() => footprint.monthSeconds)
const displayTotalSeconds = computed(() => footprint.totalSeconds)
const pendingUnsubmittedSeconds = computed(
  () => totalLedger.value.pending + totalLedger.value.provisional
)
const submittedNeteaseListenSeconds = computed(() =>
  Math.max(
    todayLedger.value.accepted,
    weekLedger.value.accepted,
    monthLedger.value.accepted
  )
)
const todayDataConflict = computed(
  () => footprint.todayCount === 0 && Number(footprint.todaySeconds) > 0
)

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
const REMOTE_SNAPSHOT_INTERVAL_MS = 60_000
let footprintSyncInterval: number | null = null
let footprintRequestInFlight = false
let footprintSnapshotInFlight = false

const selectedCloudSongId = ref('')
const cloudTrackPickerOpen = ref(false)
const cloudTrackPickerRef = ref<HTMLElement | null>(null)
const cloudTrackSearchInputRef = ref<HTMLInputElement | null>(null)
const cloudSingleKeyword = ref('')
const cloudTargetSongId = ref('')
const cloudLyricPreview = ref('')
const cloudBatchMode = ref(false)
const cloudBatchKeyword = ref('')
const cloudBatchSongIds = ref<string[]>([])
const cloudBatchDeleting = ref(false)
const cloudTracks = computed(() => liked.value.cloudDisk ?? [])

const cloudTrackSearchText = (track: any): string => {
  const song = track?.simpleSong ?? track
  const artists = song?.ar ?? song?.artists ?? track?.ar ?? track?.artists ?? []
  const aliases = song?.alia ?? song?.alias ?? track?.alia ?? track?.alias ?? []
  const album = song?.al ?? song?.album ?? track?.al ?? track?.album

  return [
    cloudSongName(track),
    cloudSongId(track),
    album?.name,
    ...artists.map((artist: any) => artist?.name),
    ...(Array.isArray(aliases) ? aliases : [aliases])
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

const filteredCloudTracks = computed(() => {
  const keyword = cloudSingleKeyword.value.trim().toLocaleLowerCase()
  if (!keyword) return cloudTracks.value
  return cloudTracks.value.filter((track) => cloudTrackSearchText(track).includes(keyword))
})

const selectedCloudTrack = computed(
  () => cloudTracks.value.find((track) => cloudSongId(track) === selectedCloudSongId.value) ?? null
)

const filteredCloudBatchTracks = computed(() => {
  const keyword = cloudBatchKeyword.value.trim().toLocaleLowerCase()
  if (!keyword) return cloudTracks.value
  return cloudTracks.value.filter((track) => cloudTrackSearchText(track).includes(keyword))
})

const closeCloudTrackPicker = (): void => {
  cloudTrackPickerOpen.value = false
}

const toggleCloudTrackPicker = (): void => {
  cloudTrackPickerOpen.value = !cloudTrackPickerOpen.value
  if (!cloudTrackPickerOpen.value) return
  void nextTick(() => {
    cloudTrackSearchInputRef.value?.focus()
    cloudTrackSearchInputRef.value?.select()
  })
}

const selectCloudTrack = (track: any): void => {
  selectedCloudSongId.value = cloudSongId(track)
  cloudSingleKeyword.value = ''
  cloudTrackPickerOpen.value = false
}

const handleCloudTrackPickerOutsidePointer = (event: PointerEvent): void => {
  if (!cloudTrackPickerOpen.value) return
  const target = event.target
  if (target instanceof Node && cloudTrackPickerRef.value?.contains(target)) return
  closeCloudTrackPicker()
}

const cloudBatchAllSelected = computed(() => {
  const ids = filteredCloudBatchTracks.value.map(cloudSongId).filter(Boolean)
  if (!ids.length) return false
  const selected = new Set(cloudBatchSongIds.value)
  return ids.every((id) => selected.has(id))
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
    const nextTodayCount = extractTodaySongCount(today, week)
    footprint.todayCount = nextTodayCount
    footprint.todaySeconds = extractTodayListenSeconds(month) ?? extractTodayListenSeconds(week)

    // UI 的“本周”固定定义为周一 00:00 至今天，不直接采用网易云 week 周期边界。
    const nextRemoteWeekSeconds =
      extractCalendarWeekListenSeconds(month) ?? extractRealtimeListenSeconds(week)
    footprint.weekSeconds = nextRemoteWeekSeconds
    footprint.monthSeconds = extractRealtimeListenSeconds(month)

    reconcileNeteaseListenReport({
      accountId: accountId.value,
      periodKey: weekPeriodKey.value,
      rangeStart: startOfWeek.value,
      rangeEnd: endOfToday.value,
      remoteSeconds: nextRemoteWeekSeconds
    })
    footprint.totalSeconds = extractTotalListenSeconds(total)

    reconcileNeteaseListenReport({
      accountId: accountId.value,
      periodKey: todayPeriodKey.value,
      rangeStart: startOfToday.value,
      rangeEnd: endOfToday.value,
      remoteSeconds: footprint.todaySeconds
    })
    reconcileNeteaseListenReport({
      accountId: accountId.value,
      periodKey: monthPeriodKey.value,
      rangeStart: startOfMonth.value,
      rangeEnd: endOfToday.value,
      remoteSeconds: footprint.monthSeconds
    })
    reconcileNeteaseListenReport({
      accountId: accountId.value,
      periodKey: totalPeriodKey,
      rangeStart: Number.NEGATIVE_INFINITY,
      rangeEnd: Number.POSITIVE_INFINITY,
      remoteSeconds: footprint.totalSeconds
    })

    footprint.weekTracks = extractUserPlayRecord(weekRecord, 'week')
    footprint.allTracks = extractUserPlayRecord(allRecord, 'all')
  } finally {
    footprintRequestInFlight = false
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * 轻量刷新网易云账号统计快照。
 *
 * 今日歌曲数也必须跟随轻量轮询刷新；否则页面打开后它只在手动刷新/重新进入页面时更新，
 * 两台设备即使登录同一账号，也可能长时间显示不同的首数。
 *
 * 这里不请求两份播放排行，只更新今日歌曲数、今日/本周/本月时长及累计时长。
 */
const refreshPendingRemoteDuration = async (): Promise<void> => {
  if (footprintSnapshotInFlight) return
  footprintSnapshotInFlight = true

  try {
    const [today, month, total] = await Promise.all([
      safeRequest(listenTodaySongs(), '刷新今日听歌'),
      safeRequest(listenRealtimeReport('month'), '确认听歌时长同步'),
      safeRequest(listenTotal(), '确认累计听歌时长同步')
    ])

    const nextTodayCount = extractTodaySongCount(today)
    if (nextTodayCount !== undefined) footprint.todayCount = nextTodayCount

    const nextTotalSeconds = extractTotalListenSeconds(total)
    if (nextTotalSeconds !== undefined) {
      footprint.totalSeconds = nextTotalSeconds
      reconcileNeteaseListenReport({
        accountId: accountId.value,
        periodKey: totalPeriodKey,
        rangeStart: Number.NEGATIVE_INFINITY,
        rangeEnd: Number.POSITIVE_INFINITY,
        remoteSeconds: nextTotalSeconds
      })
    }
    if (!month) return

    let nextRemoteWeekSeconds = extractCalendarWeekListenSeconds(month)
    const nextMonthSeconds = extractRealtimeListenSeconds(month)
    const nextTodaySeconds = extractTodayListenSeconds(month)

    // month 缺逐日明细，或今日专用接口临时不可用时，才补请求 week report。
    // 这样既保留自然周兜底，也能避免今日首数因为单个接口失败长期停留在旧值。
    if (nextRemoteWeekSeconds === undefined || nextTodayCount === undefined) {
      const week = await safeRequest(listenRealtimeReport('week'), '确认本周听歌时长同步')
      if (nextRemoteWeekSeconds === undefined) {
        nextRemoteWeekSeconds = extractRealtimeListenSeconds(week)
      }
      if (nextTodayCount === undefined) {
        const fallbackCount = extractTodaySongCount(today, week)
        if (fallbackCount !== undefined) footprint.todayCount = fallbackCount
      }
    }

    if (nextRemoteWeekSeconds !== undefined) {
      footprint.weekSeconds = nextRemoteWeekSeconds
      reconcileNeteaseListenReport({
        accountId: accountId.value,
        periodKey: weekPeriodKey.value,
        rangeStart: startOfWeek.value,
        rangeEnd: endOfToday.value,
        remoteSeconds: nextRemoteWeekSeconds
      })
    }
    if (nextMonthSeconds !== undefined) {
      footprint.monthSeconds = nextMonthSeconds
      reconcileNeteaseListenReport({
        accountId: accountId.value,
        periodKey: monthPeriodKey.value,
        rangeStart: startOfMonth.value,
        rangeEnd: endOfToday.value,
        remoteSeconds: nextMonthSeconds
      })
    }
    if (nextTodaySeconds !== undefined) {
      footprint.todaySeconds = nextTodaySeconds
      reconcileNeteaseListenReport({
        accountId: accountId.value,
        periodKey: todayPeriodKey.value,
        rangeStart: startOfToday.value,
        rangeEnd: endOfToday.value,
        remoteSeconds: nextTodaySeconds
      })
    }
  } finally {
    footprintSnapshotInFlight = false
  }
}

/**
 * 手动刷新时先 checkpoint 当前歌曲尚未提交的有效收听增量，再完整刷新并进行
 * 一小段“远端确认突发轮询”。网易云写入存在最终一致性，单次立即读取经常仍是旧值；
 * 后续切歌/自然结束只补交本次播放会话剩余增量，不会重复计算已经 checkpoint 的时长。
 */
const refreshFootprintWithConfirmation = async (): Promise<void> => {
  // “刷新”不仅重新读取网易云，还先把当前歌曲尚未提交的真实收听增量做一次 checkpoint。
  // 这样无需等切歌/自然结束，已经听过的当前歌曲时长也会立即进入远端同步流程。
  await playerStore.syncCurrentNeteaseListenCheckpoint()
  await loadFootprint()
  if (visiblePendingNeteaseListenSeconds.value <= 0) return

  for (const delay of [900, 1800, 3200]) {
    await wait(delay)
    await refreshPendingRemoteDuration()
    if (visiblePendingNeteaseListenSeconds.value <= 0) return
  }

  showToast(t('insights.footprint.pendingRefreshNotice'))
}

const cloudSongId = (track: any): string =>
  String(track?.songId ?? track?.simpleSong?.id ?? track?.id ?? '')
const cloudSongName = (track: any): string =>
  track?.simpleSong?.name ?? track?.songName ?? track?.name ?? t('insights.cloud.unknownTrack')

const toggleCloudBatchMode = (): void => {
  if (cloudBatchDeleting.value) return
  cloudBatchMode.value = !cloudBatchMode.value
  if (!cloudBatchMode.value) {
    cloudBatchKeyword.value = ''
    cloudBatchSongIds.value = []
  }
}

const toggleCloudBatchAll = (): void => {
  if (cloudBatchDeleting.value) return

  const visibleIds = filteredCloudBatchTracks.value.map(cloudSongId).filter(Boolean)
  if (!visibleIds.length) return

  const nextSelected = new Set(cloudBatchSongIds.value)
  if (cloudBatchAllSelected.value) {
    visibleIds.forEach((id) => nextSelected.delete(id))
  } else {
    visibleIds.forEach((id) => nextSelected.add(id))
  }
  cloudBatchSongIds.value = Array.from(nextSelected)
}

const clearCloudBatchSelection = (): void => {
  if (cloudBatchDeleting.value) return
  cloudBatchSongIds.value = []
}

const selectCloudBatchRange = (): void => {
  if (cloudBatchDeleting.value) return

  const selectedIds = new Set(cloudBatchSongIds.value)
  const selectedIndexes = filteredCloudBatchTracks.value
    .map((track, index) => (selectedIds.has(cloudSongId(track)) ? index : -1))
    .filter((index) => index >= 0)

  if (selectedIndexes.length < 2) {
    showToast(t('insights.cloud.batchRangeNeedEndpoints'))
    return
  }

  // Treat the first and last checked songs in the current list as the two
  // endpoints, then add every song between them to the existing selection.
  const from = Math.min(...selectedIndexes)
  const to = Math.max(...selectedIndexes)
  const nextSelected = new Set(cloudBatchSongIds.value)

  for (const track of filteredCloudBatchTracks.value.slice(from, to + 1)) {
    const id = cloudSongId(track)
    if (id) nextSelected.add(id)
  }

  cloudBatchSongIds.value = Array.from(nextSelected)
}

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

const removeCloudSongs = async (): Promise<void> => {
  const ids = Array.from(
    new Set(
      cloudBatchSongIds.value.filter((id) => {
        const numericId = Number(id)
        return Boolean(id) && Number.isFinite(numericId) && numericId > 0
      })
    )
  )

  if (!ids.length) {
    showToast(t('insights.cloud.batchSelectFirst'))
    return
  }
  if (!confirm(t('insights.cloud.batchDeleteConfirm', { count: ids.length }))) return

  cloudBatchDeleting.value = true
  const failedIds: string[] = []
  let successCount = 0

  try {
    // Keep a small concurrency window: bulk deletion stays responsive without
    // flooding the NetEase endpoint when a cloud library contains many tracks.
    const DELETE_CONCURRENCY = 3
    for (let offset = 0; offset < ids.length; offset += DELETE_CONCURRENCY) {
      const batch = ids.slice(offset, offset + DELETE_CONCURRENCY)
      const results = await Promise.all(
        batch.map(async (id) => {
          const result = await safeRequest(deleteCloudSong(Number(id)), `批量删除云盘歌曲 ${id}`)
          return { id, ok: isSuccessfulResponse(result) }
        })
      )

      for (const result of results) {
        if (result.ok) successCount += 1
        else failedIds.push(result.id)
      }
    }

    selectedCloudSongId.value = failedIds.includes(selectedCloudSongId.value)
      ? selectedCloudSongId.value
      : ''
    if (!selectedCloudSongId.value) cloudLyricPreview.value = ''

    await safeRequest(dataStore.fetchCloudDisk(), '刷新云盘')
    cloudBatchSongIds.value = failedIds

    if (failedIds.length) {
      showToast(
        t('insights.cloud.batchPartial', {
          success: successCount,
          failed: failedIds.length
        })
      )
    } else {
      // Keep batch mode open after a successful deletion so the user can
      // immediately choose the next range without reopening the batch UI.
      showToast(t('insights.cloud.batchDeleted', { count: successCount }))
    }
  } finally {
    cloudBatchDeleting.value = false
  }
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
    backgroundPendingNeteaseListenSeconds.value <= 0
  ) {
    return
  }

  footprintSyncInterval = window.setInterval(() => {
    if (
      activeTab.value !== 'footprint' ||
      backgroundPendingNeteaseListenSeconds.value <= 0
    ) {
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
  cloudTracks,
  (tracks) => {
    const availableIds = new Set(tracks.map(cloudSongId).filter(Boolean))
    cloudBatchSongIds.value = cloudBatchSongIds.value.filter((id) => availableIds.has(id))
    if (!tracks.length) cloudBatchMode.value = false
  },
  { deep: false }
)

watch(
  () => [activeTab.value, backgroundPendingNeteaseListenSeconds.value] as const,
  ([tab, pendingSeconds]) => {
    if (tab === 'footprint' && pendingSeconds > 0) startPendingSyncPolling()
    else stopPendingSyncPolling()

    if (tab === 'cloud' && !cloudTracks.value.length) {
      void safeRequest(dataStore.fetchCloudDisk(), '加载云盘')
    }
  }
)

watch(accountId, () => {
  setActiveNeteaseListenAccount(accountId.value)
  void loadFootprint()
})

let dateBoundaryTimer: number | null = null

onMounted(() => {
  setActiveNeteaseListenAccount(accountId.value)
  window.addEventListener('vutronmusic-netease-scrobble', handleNeteaseScrobble)
  window.addEventListener('pointerdown', handleCloudTrackPickerOutsidePointer)
  void loadFootprint()
  startPendingSyncPolling()
  dateBoundaryTimer = window.setInterval(() => {
    const previousDate = localDateKey(clockNow.value)
    clockNow.value = Date.now()
    if (localDateKey(clockNow.value) !== previousDate) {
      void loadFootprint()
      return
    }

    // 即使本机没有 pending，也定期拉一次轻量服务端快照。
    // 这样另一台设备产生的听歌记录会在一分钟内反映到当前页面。
    if (activeTab.value === 'footprint' && !refreshing.value) {
      void refreshPendingRemoteDuration()
    }
  }, REMOTE_SNAPSHOT_INTERVAL_MS)
})

onBeforeUnmount(() => {
  window.removeEventListener('vutronmusic-netease-scrobble', handleNeteaseScrobble)
  window.removeEventListener('pointerdown', handleCloudTrackPickerOutsidePointer)
  stopPendingSyncPolling()
  if (dateBoundaryTimer !== null) window.clearInterval(dateBoundaryTimer)
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

.footprint-head {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(280px, 3fr);
  align-items: start;
}

.section-information {
  min-width: 0;
}

.hero {
  position: relative;
  overflow: hidden;
  padding: 32px 36px;
  border-radius: 22px;
  background:
    radial-gradient(
      circle at 88% 18%,
      color-mix(in srgb, var(--color-primary) 14%, transparent) 0,
      transparent 34%
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-primary) 11%, var(--color-secondary-bg)),
      color-mix(in srgb, #8fa7ff 7%, var(--color-secondary-bg))
    );
  border: 1px solid color-mix(in srgb, var(--color-primary) 11%, transparent);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--color-text) 6%, transparent);

  h1 {
    margin: 4px 0 10px;
    font-size: 38px;
    line-height: 1.06;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    max-width: 760px;
    font-size: 15px;
    line-height: 1.65;
    opacity: 0.66;
  }

  .refresh-button {
    position: relative;
    z-index: 1;
    background: color-mix(in srgb, var(--color-body-bg) 82%, transparent);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--color-text) 5%, transparent);
  }
}

.eyebrow {
  display: inline-block;
  margin-bottom: 4px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 9%, transparent);
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

  .metric-foot {
    display: grid;
    gap: 3px;
  }

  .metric-warning {
    color: #d97706;
    opacity: 0.9;
  }
}

.sync-status-panel {
  display: grid;
  gap: 8px;
  box-sizing: border-box;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 14%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-body-bg));
}

.sync-status-title {
  color: var(--color-text);
  font-size: 13px;
}

.sync-status-stack {
  display: grid;
  gap: 6px;
}

.sync-status {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: 7px 11px;
  border-radius: 999px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-body-bg));
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-status.synced {
  color: #16803c;
  background: color-mix(in srgb, #22c55e 12%, var(--color-body-bg));
}

.sync-status.inactive {
  opacity: 0.48;
}

.sync-status-help {
  display: grid;
  gap: 5px;
  max-width: 680px;
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  font-size: 11px;
  line-height: 1.45;
}

.sync-status-help > div {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 5px;
}

.sync-status-help dt {
  font-weight: 700;
}

.sync-status-help dd {
  min-width: 0;
  margin: 0;
  opacity: 0.62;
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

.cloud-single-tools {
  margin-top: 22px;
  padding: 16px;
  border-radius: 14px;
  background: var(--color-body-bg);
  border: 1px solid color-mix(in srgb, var(--color-text) 8%, transparent);
}

.cloud-tools-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h3 {
    margin: 0 0 4px;
    font-size: 16px;
  }

  p {
    margin: 0;
    font-size: 12px;
    opacity: 0.52;
  }
}

.cloud-track-select {
  position: relative;
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
}

.cloud-track-label {
  font-size: 12px;
  opacity: 0.62;
}

.cloud-track-picker-trigger {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 11px;
  border: 1px solid color-mix(in srgb, var(--color-text) 12%, transparent);
  border-radius: 9px;
  color: var(--color-text);
  background: var(--color-secondary-bg);
  cursor: pointer;
  text-align: left;

  .svg-icon {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    opacity: 0.58;
  }
}

.cloud-track-picker-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-track-picker-panel {
  position: absolute;
  z-index: 120;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--color-text) 12%, transparent);
  border-radius: 12px;
  background: var(--color-body-bg);
  box-shadow: 0 14px 36px color-mix(in srgb, var(--color-text) 18%, transparent);
}

.cloud-track-search {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--color-secondary-bg);

  .svg-icon {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    opacity: 0.42;
  }

  input {
    min-height: 38px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
  }
}

.cloud-track-picker-results {
  max-height: min(360px, 48vh);
  margin-top: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.cloud-track-picker-option {
  width: 100%;
  min-height: 42px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  color: var(--color-text);
  background: transparent;
  cursor: pointer;
  text-align: left;

  &:hover,
  &.active {
    background: var(--color-secondary-bg);
  }

  > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    opacity: 0.46;
    font-variant-numeric: tabular-nums;
  }
}

.cloud-track-picker-empty {
  padding: 18px 10px;
  text-align: center;
  font-size: 12px;
  opacity: 0.5;
}

.cloud-tool-actions {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 12px;
}

.cloud-tool-card {
  min-width: 0;
  padding: 13px;
  border-radius: 11px;
  background: var(--color-secondary-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.cloud-tool-card-copy {
  min-width: 0;
  display: grid;
  gap: 4px;

  strong {
    font-size: 13px;
  }

  span {
    font-size: 11px;
    line-height: 1.45;
    opacity: 0.52;
  }
}

.cloud-tool-card button,
.cloud-delete-entry button {
  flex: 0 0 auto;
  padding: 9px 13px;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  color: var(--color-text);
  background: var(--color-body-bg);
  font-weight: 650;
}

.cloud-rematch-card {
  align-items: flex-end;
}

.cloud-rematch-controls {
  flex: 1 1 360px;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;

  label {
    min-width: 0;
  }

  small {
    margin-top: -1px;
    font-size: 10px;
    line-height: 1.4;
    opacity: 0.45;
  }
}

.cloud-delete-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin: 12px 0 4px;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, #d94a4a 5%, var(--color-body-bg));

  > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  strong {
    font-size: 13px;
  }

  span {
    font-size: 11px;
    opacity: 0.5;
  }

  .danger {
    color: #d94a4a;
  }
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

.action-row .danger,
.cloud-batch-toolbar .danger {
  color: #d94a4a;
}

.action-row .secondary-danger.active {
  background: color-mix(in srgb, #d94a4a 10%, var(--color-body-bg));
}

.cloud-batch-panel {
  margin: 8px 0 16px;
  padding-top: 4px;
}

.cloud-batch-sticky-tools {
  position: sticky;
  top: 8px;
  z-index: 6;
  margin: 0 -6px 6px;
  padding: 8px 6px 10px;
  border-radius: 12px;
  background: var(--color-secondary-bg);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--color-text) 7%, transparent);
}

.cloud-batch-search {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  margin-bottom: 8px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--color-body-bg);

  .svg-icon {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    opacity: 0.42;
  }

  input {
    min-height: 38px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
  }
}

.cloud-batch-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  margin-bottom: 8px;
}

.cloud-batch-select-all {
  flex-direction: row;
  align-items: center;
  gap: 7px;

  input {
    width: 16px;
    min-height: 16px;
    margin: 0;
  }

  span {
    font-size: 13px;
    opacity: 0.82;
  }
}

.cloud-batch-count {
  font-size: 12px;
  opacity: 0.58;
}

.cloud-batch-clear,
.cloud-batch-range button,
.cloud-batch-delete {
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text);
  background: var(--color-body-bg);
  font-weight: 650;
}

.cloud-batch-clear {
  margin-left: auto;
}

.cloud-batch-delete {
  background: color-mix(in srgb, #d94a4a 10%, var(--color-secondary-bg));
}

.cloud-batch-clear:disabled,
.cloud-batch-range button:disabled,
.cloud-batch-delete:disabled {
  cursor: wait;
  opacity: 0.5;
}

.cloud-batch-range {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 10px;
}

.cloud-batch-range-label {
  font-size: 12px;
  font-weight: 650;
  opacity: 0.72;
}

.cloud-batch-range-hint {
  flex: 1 1 280px;
  font-size: 12px;
  opacity: 0.52;
}

.cloud-batch-list {
  display: grid;
  gap: 4px;
}

.cloud-batch-empty {
  padding: 24px 10px;
  text-align: center;
  font-size: 12px;
  opacity: 0.5;
}

.cloud-batch-item {
  display: grid;
  grid-template-columns: auto 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: color-mix(in srgb, var(--color-text) 5%, transparent);
  }

  input {
    width: 16px;
    min-height: 16px;
    margin: 0;
  }
}

.cloud-batch-index {
  text-align: right;
  font-size: 11px;
  opacity: 0.42;
  font-variant-numeric: tabular-nums;
}

.cloud-batch-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.cloud-batch-id {
  font-size: 11px;
  opacity: 0.45;
  font-variant-numeric: tabular-nums;
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

.insights-scroll-top {
  position: fixed;
  right: 24px;
  bottom: 52px;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border: 1px solid rgba(60, 60, 60, 0.08);
  border-radius: 9999px;
  color: var(--color-text);
  background: var(--color-secondary-bg);
  box-shadow: 0 8px 12px -6px rgba(0, 0, 0, 0.1);
  opacity: 0.75;
  transform: translateY(-50%);
  cursor: pointer;
  transition:
    opacity 0.3s ease,
    transform 0.2s ease;
}

.insights-scroll-top:hover {
  opacity: 0.9;
}

.insights-scroll-top:active {
  transform: translateY(-50%) scale(0.96);
}

@media (max-width: 900px) {
  .footprint-head {
    grid-template-columns: minmax(0, 7fr) minmax(240px, 3fr);
  }

  .metric-grid,
  .metric-grid.compact {
    grid-template-columns: 1fr 1fr;
  }

  .cloud-tool-actions {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .hero {
    flex-direction: column;
  }

  .footprint-head {
    grid-template-columns: minmax(0, 7fr) minmax(210px, 3fr);
    gap: 12px;
  }

  .sync-status-panel {
    padding: 10px;
  }

  .metric-grid,
  .metric-grid.compact,
  .cloud-tool-actions,
  .cloud-rematch-controls {
    grid-template-columns: 1fr;
  }

  .cloud-delete-entry,
  .cloud-tool-card {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
