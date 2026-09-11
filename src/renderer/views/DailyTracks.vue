<template>
  <div v-show="show">
    <div class="special-playlist1">
      <div class="title gradient">每日歌曲推荐</div>
      <div class="subtitle">
        {{
          mode === 'today' ? '根据你的音乐口味生成 · 每天6:00更新' : `历史日推 · ${selectedDate}`
        }}
      </div>
      <div class="mode-row">
        <button :class="{ active: mode === 'today' }" @click="switchMode('today')">今日推荐</button>
        <button :class="{ active: mode === 'history' }" @click="switchMode('history')"
          >历史日推</button
        >
      </div>
      <div v-if="mode === 'history' && historyDates.length" class="history-dates">
        <button
          v-for="date in historyDates"
          :key="date"
          :class="{ active: date === selectedDate }"
          @click="loadHistoryDate(date)"
        >
          {{ formatDate(date) }}
        </button>
      </div>
      <div class="buttons">
        <ButtonTwoTone class="play-button" icon-class="play" color="grey" @click="play">
          {{ $t('common.play') }}
        </ButtonTwoTone>
        <SearchBox ref="pSearchBoxRef" :placeholder="$t('playlist.search')" />
      </div>
      <div v-if="mode === 'today'" class="feedback-hint"
        >右键歌曲可选择“不感兴趣”，反馈会同步给网易云推荐。</div
      >
    </div>

    <TrackList
      :id="mode === 'today' ? '/daily/songs' : `/daily/history/${selectedDate}`"
      :items="filterTracks"
      :all-items="activeTracks"
      :colunm-number="1"
      type="url"
      :is-end="true"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, provide } from 'vue'
import { useNormalStateStore } from '../store/state'
import { storeToRefs } from 'pinia'
import TrackList from '../components/VirtualTrackList.vue'
import ButtonTwoTone from '../components/ButtonTwoTone.vue'
import SearchBox from '../components/SearchBox.vue'
import { dailyRecommendTracks } from '../api/playlist'
import { historyRecommendSongs, historyRecommendSongsDetail } from '../api/discovery'
import { usePlayerStore } from '../store/player'

const show = ref(false)
const mode = ref<'today' | 'history'>('today')
const historyDates = ref<string[]>([])
const selectedDate = ref('')
const historyTracks = ref<any[]>([])
const { dailyTracks } = storeToRefs(useNormalStateStore())

const playerStore = usePlayerStore()
const { _shuffle } = storeToRefs(playerStore)
const { replacePlaylist } = playerStore
const pSearchBoxRef = ref<InstanceType<typeof SearchBox>>()

const activeTracks = computed(() =>
  mode.value === 'today' ? dailyTracks.value : historyTracks.value
)
const keyword = computed(() => pSearchBoxRef.value?.keywords || '')
const filterTracks = computed(() => {
  const searchWord = keyword.value?.toLowerCase() ?? ''
  if (!searchWord) return activeTracks.value
  return activeTracks.value.filter(
    (track) =>
      (track.name && track.name.toLowerCase().includes(searchWord)) ||
      (track.alia || track.alias)?.find((alias) => alias.toLowerCase().includes(searchWord)) ||
      ((track.album?.name || track.al?.name) &&
        (track.album?.name || track.al?.name).toLowerCase().includes(searchWord)) ||
      (track.artists || track.ar || []).find(
        (artist) => artist.name && artist.name.toLowerCase().includes(searchWord)
      )
  )
})

const loadDailyTracks = async () => {
  const result = await dailyRecommendTracks()
  dailyTracks.value = result?.data?.dailySongs ?? []
  show.value = true
}

const collectDates = (value: any, dates = new Set<string>(), depth = 0): Set<string> => {
  if (depth > 6 || value == null) return dates
  if (typeof value === 'string') {
    const matched = value.match(/^\d{4}-\d{2}-\d{2}$/)
    if (matched) dates.add(matched[0])
    return dates
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDates(item, dates, depth + 1)
    return dates
  }
  if (typeof value === 'object') {
    const date = value.date ?? value.recommendDate
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date)
    for (const nested of Object.values(value)) collectDates(nested, dates, depth + 1)
  }
  return dates
}

const findTracks = (result: any): any[] => {
  const candidates = [
    result?.data?.dailySongs,
    result?.data?.songs,
    result?.data?.list,
    result?.dailySongs,
    result?.songs,
    result?.list,
    result?.data
  ]
  const raw = candidates.find((item) => Array.isArray(item)) ?? []
  return raw
    .map((item: any) => item?.song ?? item?.resource?.song ?? item?.resource ?? item?.data ?? item)
    .filter((item: any) => item?.id)
}

const loadHistoryDates = async () => {
  try {
    const result = await historyRecommendSongs()
    historyDates.value = [...collectDates(result)].sort().reverse()
    if (!selectedDate.value && historyDates.value.length) selectedDate.value = historyDates.value[0]
  } catch (error) {
    console.warn('[DailyTracks] 获取历史日推日期失败:', error)
    historyDates.value = []
  }
}

const loadHistoryDate = async (date: string) => {
  if (!date) return
  selectedDate.value = date
  show.value = false
  try {
    const result = await historyRecommendSongsDetail(date)
    historyTracks.value = findTracks(result)
  } catch (error) {
    console.warn('[DailyTracks] 获取历史日推失败:', error)
    historyTracks.value = []
  } finally {
    show.value = true
  }
}

const switchMode = async (nextMode: 'today' | 'history') => {
  if (mode.value === nextMode) return
  mode.value = nextMode
  if (nextMode === 'today') {
    if (!dailyTracks.value.length) await loadDailyTracks()
    return
  }

  if (!historyDates.value.length) await loadHistoryDates()
  if (selectedDate.value && !historyTracks.value.length) await loadHistoryDate(selectedDate.value)
}

const play = () => {
  const trackIDs = activeTracks.value.map((track) => track.id).filter(Boolean)
  if (!trackIDs.length) return
  const idx = _shuffle.value ? Math.floor(Math.random() * trackIDs.length) : 0
  const sourceId = mode.value === 'today' ? '/daily/songs' : `/daily/history/${selectedDate.value}`
  replacePlaylist('url', sourceId, trackIDs, idx)
}

const formatDate = (date: string) => date.replace(/-/g, '.')

provide('removeTrack', (trackId: number) => {
  if (!Number.isFinite(trackId) || trackId <= 0) return
  const target = mode.value === 'today' ? dailyTracks.value : historyTracks.value
  const index = target.findIndex((track) => Number(track.id) === Number(trackId))
  if (index >= 0) target.splice(index, 1)
})

onMounted(async () => {
  if (dailyTracks.value.length === 0) await loadDailyTracks()
  else show.value = true
  void loadHistoryDates()
})
</script>

<style scoped lang="scss">
.special-playlist1 {
  padding: 150px 0 92px;
  border-radius: 1.25em;
  text-align: center;

  @keyframes letterSpacing4 {
    from {
      letter-spacing: 0;
    }
    to {
      letter-spacing: 4px;
    }
  }

  @keyframes letterSpacing1 {
    from {
      letter-spacing: 0;
    }
    to {
      letter-spacing: 1px;
    }
  }

  .title {
    font-size: 84px;
    line-height: 1.05;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 4px;
    animation-duration: 0.8s;
    animation-name: letterSpacing4;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    font-size: 18px;
    letter-spacing: 1px;
    margin: 28px 0 18px;
    animation-duration: 0.8s;
    animation-name: letterSpacing1;
    color: var(--color-text);
  }

  .buttons,
  .mode-row,
  .history-dates {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
  }

  .mode-row {
    gap: 8px;
    margin-top: 18px;
  }

  .history-dates {
    gap: 6px;
    max-width: 760px;
    margin: 14px auto 0;
  }

  .mode-row button,
  .history-dates button {
    border: 0;
    border-radius: 999px;
    padding: 7px 14px;
    color: var(--color-text);
    background: var(--color-secondary-bg);
    cursor: pointer;

    &.active,
    &:hover {
      color: var(--color-primary);
      background: color-mix(in oklab, var(--color-primary) var(--bg-alpha), white);
    }
  }

  .history-dates button {
    padding: 5px 10px;
    font-size: 12px;
  }

  .buttons {
    margin-top: 28px;

    button {
      margin-right: 16px;
    }
  }
}

.feedback-hint {
  margin-top: 14px;
  font-size: 12px;
  opacity: 0.48;
}

.gradient {
  background: linear-gradient(to left, #dd2476, #ff512f);
}
</style>
