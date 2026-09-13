<template>
  <div class="insights-page">
    <div class="hero">
      <div>
        <div class="eyebrow">NETEASE INSIGHTS</div>
        <h1>音乐洞察</h1>
        <p>发现、足迹和管理能力集中在一个稳定的网易云工具页。</p>
      </div>
      <button class="refresh-button" :disabled="refreshing" @click="refreshCurrent">
        {{ refreshing ? '刷新中…' : '刷新' }}
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
          <h2>听歌足迹</h2>
          <p>今日、周/月与累计收听数据；单个接口不可用时不会拖垮整个页面。</p>
        </div>
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <span>今日歌曲</span>
          <strong>{{ footprint.todayCount ?? '—' }}</strong>
        </div>
        <div class="metric-card">
          <span>本周</span>
          <strong>{{ formatListenDuration(footprint.weekSeconds) }}</strong>
        </div>
        <div class="metric-card">
          <span>本月</span>
          <strong>{{ formatListenDuration(footprint.monthSeconds) }}</strong>
        </div>
        <div class="metric-card">
          <span>累计</span>
          <strong>{{ formatListenDuration(footprint.totalSeconds) }}</strong>
        </div>
      </div>

      <div class="sub-tabs">
        <button
          :class="{ active: footprintRankMode === 'week' }"
          @click="footprintRankMode = 'week'"
        >
          本周常听
        </button>
        <button
          :class="{ active: footprintRankMode === 'month' }"
          @click="footprintRankMode = 'month'"
        >
          本月常听
        </button>
      </div>

      <div class="stable-results">
        <InsightsTrackList
          v-show="footprintRankMode === 'week'"
          :items="footprint.weekTracks"
          empty-text="当前账号暂时没有本周听歌排行。"
        />
        <InsightsTrackList
          v-show="footprintRankMode === 'month'"
          :items="footprint.monthTracks"
          empty-text="当前账号暂时没有本月听歌排行。"
        />
      </div>
    </section>

    <section v-show="activeTab === 'style'" class="panel">
      <div class="section-head">
        <div>
          <h2>曲风漫游 2.0</h2>
          <p>{{
            styleDescription || '基于网易云曲风标签与账号偏好，继续探索歌曲、专辑、歌手和歌单。'
          }}</p>
        </div>
        <select v-model="styleSort" :disabled="styleLoading" @change="loadStyleResources(true)">
          <option :value="0">综合 / 热门</option>
          <option :value="1">最新</option>
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
        <span>{{ styleLoading ? '正在加载…' : `${currentStyleCount} 项` }}</span>
      </div>

      <div class="stable-results" :class="{ loading: styleLoading }">
        <InsightsTrackList
          v-show="styleResourceType === 'song'"
          :items="styleTracks"
          empty-text="这个曲风暂时没有歌曲。"
        />
        <InsightsResourceGrid
          v-show="styleResourceType === 'album'"
          :items="styleAlbums"
          type="album"
          empty-text="这个曲风暂时没有专辑。"
        />
        <InsightsResourceGrid
          v-show="styleResourceType === 'artist'"
          :items="styleArtists"
          type="artist"
          empty-text="这个曲风暂时没有歌手。"
        />
        <InsightsResourceGrid
          v-show="styleResourceType === 'playlist'"
          :items="stylePlaylists"
          type="playlist"
          empty-text="这个曲风暂时没有歌单。"
        />
      </div>

      <button
        v-if="styleCursor !== undefined && styleCursor !== null && styleCursor !== ''"
        class="load-more"
        :disabled="styleLoading"
        @click="loadStyleResources(false)"
      >
        {{ styleLoading ? '加载中…' : '加载更多' }}
      </button>
    </section>

    <section v-show="activeTab === 'cloud'" class="panel">
      <div class="section-head">
        <div>
          <h2>云盘 Pro</h2>
          <p>在原有查看/删除之外，支持重新匹配和云盘歌词读取。</p>
        </div>
      </div>

      <div class="tool-grid">
        <label>
          <span>云盘歌曲</span>
          <select v-model="selectedCloudSongId">
            <option value="">请选择</option>
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
          <span>目标网易云歌曲 ID</span>
          <input v-model.trim="cloudTargetSongId" placeholder="例如 33894312" />
        </label>
      </div>
      <div class="action-row">
        <button @click="matchCloudSong">重新匹配</button>
        <button @click="readCloudLyric">读取云盘歌词</button>
        <button class="danger" @click="removeCloudSong">从云盘删除</button>
      </div>
      <pre v-show="cloudLyricPreview" class="preview">{{ cloudLyricPreview }}</pre>
      <div v-show="!cloudTracks.length" class="empty">当前云盘为空，或账号尚未登录。</div>
    </section>

    <section v-show="activeTab === 'playlist'" class="panel">
      <div class="section-head">
        <div>
          <h2>歌单管理增强</h2>
          <p>完整读取超长歌单，并支持歌单置顶和隐私歌单公开。</p>
        </div>
      </div>

      <div class="tool-grid one-line">
        <label>
          <span>我的歌单</span>
          <select v-model="selectedPlaylistId">
            <option value="">请选择</option>
            <option
              v-for="playlist in ownPlaylists"
              :key="playlist.id"
              :value="String(playlist.id)"
            >
              {{ playlist.name }} · {{ playlist.trackCount ?? 0 }} 首
            </option>
          </select>
        </label>
      </div>
      <div class="action-row">
        <button @click="loadFullPlaylist">完整加载歌曲</button>
        <button @click="pinPlaylistFirst">置顶当前歌单</button>
        <button v-show="selectedPlaylist?.privacy === 10" @click="makePlaylistPublic"
          >公开此歌单</button
        >
      </div>

      <InsightsTrackList
        :items="fullPlaylistTracks"
        empty-text="选择一个自己的歌单后，可以完整读取歌曲。"
      />
    </section>

    <section v-show="activeTab === 'insight'" class="panel">
      <div class="section-head">
        <div>
          <h2>歌曲洞察与私人 DJ</h2>
          <p>读取歌曲百科、音乐详情、红心数、动态封面、相似歌曲和私人 DJ。</p>
        </div>
      </div>

      <div class="tool-grid one-line">
        <label>
          <span>歌曲 ID</span>
          <input v-model.trim="insightTrackId" placeholder="播放歌曲后会自动填入" />
        </label>
      </div>
      <div class="action-row">
        <button @click="loadSongInsight">读取歌曲洞察</button>
        <button @click="loadAiDj">刷新私人 DJ</button>
      </div>

      <div class="metric-grid compact">
        <div class="metric-card">
          <span>红心数量</span>
          <strong>{{ songInsight.redCount ?? '—' }}</strong>
        </div>
        <div class="metric-card wide">
          <span>歌曲信息</span>
          <strong class="summary-text">{{ songInsight.summary || '暂无' }}</strong>
        </div>
      </div>
      <img
        v-show="songInsight.cover"
        :src="songInsight.cover"
        class="dynamic-cover"
        alt="动态封面"
      />

      <h3>相似歌曲</h3>
      <InsightsTrackList :items="similarTracks" empty-text="暂时没有相似歌曲。" />

      <h3>私人 DJ</h3>
      <InsightsTrackList :items="aiDjTracks" empty-text="私人 DJ 当前没有返回可播放歌曲。" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import InsightsTrackList from '../components/InsightsTrackList.vue'
import InsightsResourceGrid from '../components/InsightsResourceGrid.vue'
import { useDataStore } from '../store/data'
import { usePlayerStore } from '../store/player'
import { useNormalStateStore } from '../store/state'
import { styleList, stylePreference, deleteCloudSong } from '../api/discovery'
import {
  aiDjContentRecommend,
  cloudLyricGet,
  cloudMatch,
  listenRealtimeReport,
  listenSongPlayRank,
  listenTodaySongs,
  listenTotal,
  playlistTrackAll,
  publishPrivatePlaylist,
  similarSongs,
  songDynamicCover,
  songMusicDetail,
  songRedCount,
  songWikiSummary,
  styleDetail,
  styleResource,
  updatePlaylistOrder,
  type StyleResourceType
} from '../api/modern'
import {
  collectStyleTags,
  deepFindValue,
  extractAlbums,
  extractArtists,
  extractCursor,
  extractMetric,
  extractPlaylists,
  extractTracks,
  formatListenDuration,
  isSuccessfulResponse,
  type StyleTag
} from '../services/neteaseModern'

const tabs = [
  { id: 'footprint', label: '听歌足迹' },
  { id: 'style', label: '曲风漫游' },
  { id: 'cloud', label: '云盘 Pro' },
  { id: 'playlist', label: '歌单管理' },
  { id: 'insight', label: '歌曲洞察' }
] as const

const styleResourceTabs: Array<{ id: StyleResourceType; label: string }> = [
  { id: 'song', label: '歌曲' },
  { id: 'album', label: '专辑' },
  { id: 'artist', label: '歌手' },
  { id: 'playlist', label: '歌单' }
]

const activeTab = ref<(typeof tabs)[number]['id']>('footprint')
const dataStore = useDataStore()
const playerStore = usePlayerStore()
const stateStore = useNormalStateStore()
const { liked, user } = storeToRefs(dataStore)
const { currentTrack } = storeToRefs(playerStore)
const { showToast } = stateStore

const refreshing = ref(false)
const footprint = reactive<{
  todayCount?: number
  weekSeconds?: number
  monthSeconds?: number
  totalSeconds?: number
  weekTracks: any[]
  monthTracks: any[]
}>({ weekTracks: [], monthTracks: [] })
const footprintRankMode = ref<'week' | 'month'>('week')

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

const selectedCloudSongId = ref('')
const cloudTargetSongId = ref('')
const cloudLyricPreview = ref('')
const cloudTracks = computed(() => liked.value.cloudDisk ?? [])

const ownPlaylists = computed(() =>
  (liked.value.playlists ?? []).filter(
    (playlist: any) => String(playlist?.creator?.userId) === String(user.value.userId)
  )
)
const selectedPlaylistId = ref('')
const fullPlaylistTracks = ref<any[]>([])
const selectedPlaylist = computed(() =>
  ownPlaylists.value.find((playlist: any) => String(playlist.id) === selectedPlaylistId.value)
)

const insightTrackId = ref('')
const songInsight = reactive<{ redCount?: number; summary: string; cover: string }>({
  summary: '',
  cover: ''
})
const similarTracks = ref<any[]>([])
const aiDjTracks = ref<any[]>([])

const currentStyleCount = computed(() => {
  if (styleResourceType.value === 'song') return styleTracks.value.length
  if (styleResourceType.value === 'album') return styleAlbums.value.length
  if (styleResourceType.value === 'artist') return styleArtists.value.length
  return stylePlaylists.value.length
})

const normalizeDuration = (value?: number): number | undefined => {
  if (!Number.isFinite(value)) return undefined
  const number = Number(value)
  return number > 315_360_000 ? number / 1000 : number
}

const safeRequest = async <T,>(request: Promise<T> | T, label: string): Promise<T | undefined> => {
  try {
    return await request
  } catch (error) {
    console.warn(`[MusicInsights] ${label} 失败：`, error)
    return undefined
  }
}

const loadFootprint = async (): Promise<void> => {
  const [today, week, month, total, weekRank, monthRank] = await Promise.all([
    safeRequest(listenTodaySongs(), '今日听歌'),
    safeRequest(listenRealtimeReport('week'), '本周听歌'),
    safeRequest(listenRealtimeReport('month'), '本月听歌'),
    safeRequest(listenTotal(), '累计听歌'),
    safeRequest(listenSongPlayRank({ type: 'week' }), '本周排行'),
    safeRequest(listenSongPlayRank({ type: 'month' }), '本月排行')
  ])

  const todayTracks = extractTracks(today, 500)
  footprint.todayCount =
    extractMetric(today, ['songCount', 'count', 'listenSongCount', 'playCount']) ??
    todayTracks.length
  footprint.weekSeconds = normalizeDuration(
    extractMetric(week, ['listenTime', 'totalTime', 'duration', 'playTime', 'time'])
  )
  footprint.monthSeconds = normalizeDuration(
    extractMetric(month, ['listenTime', 'totalTime', 'duration', 'playTime', 'time'])
  )
  footprint.totalSeconds = normalizeDuration(
    extractMetric(total, ['listenTime', 'totalTime', 'duration', 'playTime', 'time'])
  )
  footprint.weekTracks = extractTracks(weekRank, 20)
  footprint.monthTracks = extractTracks(monthRank, 20)
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
    if (revision === styleRequestRevision) showToast('曲风资源加载失败，请稍后重试')
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
  track?.simpleSong?.name ?? track?.songName ?? track?.name ?? '未知歌曲'

const matchCloudSong = async (): Promise<void> => {
  const uid = user.value.userId
  if (!uid || !selectedCloudSongId.value || !cloudTargetSongId.value) {
    showToast('请选择云盘歌曲并填写目标歌曲 ID')
    return
  }

  const result = await safeRequest(
    cloudMatch({ uid, sid: selectedCloudSongId.value, asid: cloudTargetSongId.value }),
    '云盘重新匹配'
  )
  if (!isSuccessfulResponse(result)) {
    showToast('云盘重新匹配失败')
    return
  }
  await safeRequest(dataStore.fetchCloudDisk(), '刷新云盘')
  showToast('云盘歌曲已重新匹配')
}

const readCloudLyric = async (): Promise<void> => {
  const uid = user.value.userId
  if (!uid || !selectedCloudSongId.value) {
    showToast('请先选择云盘歌曲')
    return
  }
  const result = await safeRequest(
    cloudLyricGet({ uid, sid: selectedCloudSongId.value }),
    '读取云盘歌词'
  )
  cloudLyricPreview.value = String(
    deepFindValue(result, ['lyric', 'lrc', 'yrc', 'content']) ?? '没有找到云盘歌词'
  ).slice(0, 3000)
}

const removeCloudSong = async (): Promise<void> => {
  if (!selectedCloudSongId.value) {
    showToast('请先选择云盘歌曲')
    return
  }
  if (!confirm('确定从网易云云盘删除这首歌曲吗？')) return

  const result = await safeRequest(
    deleteCloudSong(Number(selectedCloudSongId.value)),
    '删除云盘歌曲'
  )
  if (!isSuccessfulResponse(result)) {
    showToast('云盘删除失败')
    return
  }
  selectedCloudSongId.value = ''
  cloudLyricPreview.value = ''
  await safeRequest(dataStore.fetchCloudDisk(), '刷新云盘')
  showToast('已从云盘删除')
}

const loadFullPlaylist = async (): Promise<void> => {
  if (!selectedPlaylistId.value) {
    showToast('请先选择歌单')
    return
  }
  const result = await safeRequest(
    playlistTrackAll({ id: selectedPlaylistId.value, limit: 5000 }),
    '完整读取歌单'
  )
  fullPlaylistTracks.value = extractTracks(result, 5000)
  if (!fullPlaylistTracks.value.length) showToast('完整歌曲读取失败或歌单为空')
}

const pinPlaylistFirst = async (): Promise<void> => {
  if (!selectedPlaylistId.value) {
    showToast('请先选择歌单')
    return
  }
  const ordered = [
    selectedPlaylistId.value,
    ...ownPlaylists.value
      .map((playlist: any) => String(playlist.id))
      .filter((id: string) => id !== selectedPlaylistId.value)
  ]
  const result = await safeRequest(updatePlaylistOrder(ordered), '更新歌单顺序')
  if (!isSuccessfulResponse(result)) {
    showToast('歌单顺序更新失败')
    return
  }
  await safeRequest(dataStore.fetchLikedPlaylist(), '刷新歌单')
  showToast('已将歌单置顶')
}

const makePlaylistPublic = async (): Promise<void> => {
  if (!selectedPlaylistId.value) return
  const result = await safeRequest(publishPrivatePlaylist(selectedPlaylistId.value), '公开歌单')
  if (!isSuccessfulResponse(result)) {
    showToast('公开歌单失败')
    return
  }
  await safeRequest(dataStore.fetchLikedPlaylist(), '刷新歌单')
  showToast('歌单已公开')
}

const loadSongInsight = async (): Promise<void> => {
  const id = Number(insightTrackId.value)
  if (!Number.isFinite(id) || id <= 0) {
    showToast('请输入有效歌曲 ID')
    return
  }

  const [wiki, detail, red, cover, simi] = await Promise.all([
    safeRequest(songWikiSummary(id), '歌曲百科'),
    safeRequest(songMusicDetail(id), '歌曲音乐详情'),
    safeRequest(songRedCount(id), '歌曲红心数'),
    safeRequest(songDynamicCover(id), '歌曲动态封面'),
    safeRequest(similarSongs(id), '相似歌曲')
  ])

  songInsight.redCount = extractMetric(red, ['count', 'redCount', 'likeCount', 'likedCount'])
  songInsight.summary = String(
    deepFindValue(wiki, ['summary', 'content', 'desc', 'description', 'text']) ??
      deepFindValue(detail, ['summary', 'content', 'desc', 'description', 'text']) ??
      ''
  ).slice(0, 500)
  songInsight.cover = String(
    deepFindValue(cover, ['url', 'coverUrl', 'picUrl', 'imageUrl', 'videoUrl']) ?? ''
  )
  similarTracks.value = extractTracks(simi, 30)
}

const loadAiDj = async (): Promise<void> => {
  const result = await safeRequest(aiDjContentRecommend(), '私人 DJ')
  aiDjTracks.value = extractTracks(result, 50)
  if (!aiDjTracks.value.length) showToast('私人 DJ 当前没有返回可播放歌曲')
}

const refreshCurrent = async (): Promise<void> => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    if (activeTab.value === 'footprint') await loadFootprint()
    else if (activeTab.value === 'style') await loadStyleCatalog()
    else if (activeTab.value === 'cloud') await safeRequest(dataStore.fetchCloudDisk(), '刷新云盘')
    else if (activeTab.value === 'playlist') {
      await safeRequest(dataStore.fetchLikedPlaylist(), '刷新歌单')
    } else {
      await Promise.all([loadSongInsight(), loadAiDj()])
    }
  } finally {
    refreshing.value = false
  }
}

watch(
  () => currentTrack.value?.id,
  (id) => {
    if (id) insightTrackId.value = String(id)
  },
  { immediate: true }
)

watch(activeTab, (tab) => {
  if (tab === 'style' && !styleTags.value.length) void loadStyleCatalog()
  if (tab === 'cloud' && !cloudTracks.value.length) {
    void safeRequest(dataStore.fetchCloudDisk(), '加载云盘')
  }
  if (tab === 'playlist' && !ownPlaylists.value.length) {
    void safeRequest(dataStore.fetchLikedPlaylist(), '加载歌单')
  }
})

onMounted(() => {
  void loadFootprint()
})
</script>

<style scoped lang="scss">
.insights-page {
  max-width: 1380px;
  margin: 0 auto;
  padding: 10px 0 60px;
}

.hero,
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}

.hero {
  padding: 28px 32px;
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
  margin: 24px 0;
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
  padding: 26px 28px;
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
  gap: 14px;
  margin: 24px 0;
}

.metric-grid.compact {
  grid-template-columns: minmax(170px, 0.3fr) minmax(0, 1fr);
}

.metric-card {
  min-height: 105px;
  padding: 17px;
  border-radius: 14px;
  background: var(--color-body-bg);
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  span {
    font-size: 12px;
    opacity: 0.58;
  }

  strong {
    font-size: 25px;
  }
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
  margin: 18px 0;
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
