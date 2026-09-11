<template>
  <div class="insights-page">
    <div class="hero">
      <div>
        <div class="eyebrow">NETEASE INSIGHTS</div>
        <h1>音乐洞察</h1>
        <p>把网易云的新接口集中成真正可用的发现、足迹和管理工具。</p>
      </div>
      <button class="refresh-button" @click="refreshCurrent">刷新</button>
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

    <section v-if="activeTab === 'footprint'" class="panel">
      <div class="section-head">
        <div>
          <h2>听歌足迹</h2>
          <p>今日、周/月和累计收听信息统一展示；接口不可用时自动降级为空态。</p>
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
        <button :class="{ active: footprintRankMode === 'week' }" @click="footprintRankMode = 'week'">
          本周常听
        </button>
        <button
          :class="{ active: footprintRankMode === 'month' }"
          @click="footprintRankMode = 'month'"
        >
          本月常听
        </button>
      </div>
      <TrackList
        v-if="activeRankTracks.length"
        :id="`listen-rank-${footprintRankMode}`"
        :items="activeRankTracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
      />
      <div v-else class="empty">当前账号暂时没有可展示的听歌排行。</div>
    </section>

    <section v-else-if="activeTab === 'style'" class="panel">
      <div class="section-head">
        <div>
          <h2>曲风漫游 2.0</h2>
          <p>{{ styleDescription || '基于网易云曲风标签和账号偏好，按歌曲、专辑、歌手、歌单继续探索。' }}</p>
        </div>
        <select v-model="styleSort" @change="loadStyleResources(true)">
          <option :value="0">综合 / 热门</option>
          <option :value="1">最新</option>
        </select>
      </div>

      <div class="tag-list">
        <button
          v-for="tag in styleTags"
          :key="String(tag.id)"
          :class="{ active: String(activeStyleId) === String(tag.id) }"
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

      <TrackList
        v-if="styleResourceType === 'song' && styleTracks.length"
        :id="`style-pro-${activeStyleId}`"
        :items="styleTracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
      />
      <CoverRow
        v-else-if="styleResourceType === 'album' && styleAlbums.length"
        :items="styleAlbums"
        type="album"
        sub-text="artist"
        :colunm-number="5"
        :is-end="true"
      />
      <CoverRow
        v-else-if="styleResourceType === 'artist' && styleArtists.length"
        :items="styleArtists"
        type="artist"
        sub-text="artist"
        :colunm-number="5"
        :is-end="true"
      />
      <CoverRow
        v-else-if="styleResourceType === 'playlist' && stylePlaylists.length"
        :items="stylePlaylists"
        type="playlist"
        sub-text="creator"
        :colunm-number="5"
        :is-end="true"
      />
      <div v-else class="empty">这个曲风暂时没有可展示的资源。</div>

      <button v-if="styleCursor !== undefined" class="load-more" @click="loadStyleResources(false)">
        加载更多
      </button>
    </section>

    <section v-else-if="activeTab === 'cloud'" class="panel">
      <div class="section-head">
        <div>
          <h2>云盘 Pro</h2>
          <p>在原有查看/删除之外，增加重新匹配和云盘歌词读取。</p>
        </div>
      </div>

      <div class="tool-grid">
        <label>
          <span>云盘歌曲</span>
          <select v-model="selectedCloudSongId">
            <option value="">请选择</option>
            <option v-for="track in cloudTracks" :key="cloudSongId(track)" :value="cloudSongId(track)">
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
      <pre v-if="cloudLyricPreview" class="preview">{{ cloudLyricPreview }}</pre>
      <div v-if="!cloudTracks.length" class="empty">当前云盘为空，或账号尚未登录。</div>
    </section>

    <section v-else-if="activeTab === 'playlist'" class="panel">
      <div class="section-head">
        <div>
          <h2>歌单管理增强</h2>
          <p>使用完整歌曲接口读取超长歌单，并补充隐私歌单公开与歌单顺序调整。</p>
        </div>
      </div>

      <div class="tool-grid one-line">
        <label>
          <span>我的歌单</span>
          <select v-model="selectedPlaylistId">
            <option value="">请选择</option>
            <option v-for="playlist in ownPlaylists" :key="playlist.id" :value="String(playlist.id)">
              {{ playlist.name }} · {{ playlist.trackCount ?? 0 }} 首
            </option>
          </select>
        </label>
      </div>
      <div class="action-row">
        <button @click="loadFullPlaylist">完整加载歌曲</button>
        <button @click="pinPlaylistFirst">置顶当前歌单</button>
        <button v-if="selectedPlaylist?.privacy === 10" @click="makePlaylistPublic">公开此歌单</button>
      </div>
      <TrackList
        v-if="fullPlaylistTracks.length"
        :id="`full-playlist-${selectedPlaylistId}`"
        :items="fullPlaylistTracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
      />
      <div v-else class="empty">选择一个自己的歌单后，可以完整读取歌曲。</div>
    </section>

    <section v-else class="panel">
      <div class="section-head">
        <div>
          <h2>歌曲洞察与私人 DJ</h2>
          <p>针对当前歌曲读取百科、音乐详情、红心数量、动态封面、相似歌曲，并加载私人 DJ。</p>
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
      <img v-if="songInsight.cover" :src="songInsight.cover" class="dynamic-cover" alt="动态封面" />

      <h3 v-if="similarTracks.length">相似歌曲</h3>
      <TrackList
        v-if="similarTracks.length"
        id="insight-similar-tracks"
        :items="similarTracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
      />

      <h3 v-if="aiDjTracks.length">私人 DJ</h3>
      <TrackList
        v-if="aiDjTracks.length"
        id="private-ai-dj"
        :items="aiDjTracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
      />
      <div v-if="!similarTracks.length && !aiDjTracks.length" class="empty">
        播放一首网易云歌曲，或输入歌曲 ID 后开始探索。
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import TrackList from '../components/VirtualTrackList.vue'
import CoverRow from '../components/VirtualCoverRow.vue'
import { useDataStore } from '../store/data'
import { usePlayerStore } from '../store/player'
import { useNormalStateStore } from '../store/state'
import { styleList, stylePreference, deleteCloudSong } from '../api/discovery'
import {
  aiDjContentRecommend,
  cloudLyricGet,
  cloudMatch,
  homepageBlockPage,
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

const footprint = reactive<{
  todayCount?: number
  weekSeconds?: number
  monthSeconds?: number
  totalSeconds?: number
  weekTracks: any[]
  monthTracks: any[]
}>({
  weekTracks: [],
  monthTracks: []
})
const footprintRankMode = ref<'week' | 'month'>('week')
const activeRankTracks = computed(() =>
  footprintRankMode.value === 'week' ? footprint.weekTracks : footprint.monthTracks
)

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

const normalizeDuration = (value?: number) => {
  if (!Number.isFinite(value)) return undefined
  const number = Number(value)
  return number > 315_360_000 ? number / 1000 : number
}

const loadFootprint = async () => {
  const [today, week, month, total, weekRank, monthRank] = await Promise.all([
    listenTodaySongs(),
    listenRealtimeReport('week'),
    listenRealtimeReport('month'),
    listenTotal(),
    listenSongPlayRank({ type: 'week' }),
    listenSongPlayRank({ type: 'month' })
  ])

  const todayTracks = extractTracks(today, 500)
  footprint.todayCount =
    extractMetric(today, ['songCount', 'count', 'listenSongCount', 'playCount']) ?? todayTracks.length
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

const loadStyleCatalog = async () => {
  const [listResult, preferenceResult] = await Promise.all([styleList(), stylePreference()])
  styleTags.value = collectStyleTags(listResult, preferenceResult).slice(0, 100)
  if (!activeStyleId.value && styleTags.value.length) {
    const preferred = styleTags.value.find((tag) => tag.preferred) ?? styleTags.value[0]
    await selectStyle(preferred.id)
  }
}

const clearStyleResources = () => {
  styleTracks.value = []
  styleAlbums.value = []
  styleArtists.value = []
  stylePlaylists.value = []
  styleCursor.value = undefined
}

const loadStyleResources = async (reset = true) => {
  if (!activeStyleId.value) return
  if (reset) clearStyleResources()

  const result = await styleResource(styleResourceType.value, {
    tagId: activeStyleId.value,
    cursor: reset ? 0 : styleCursor.value,
    size: 40,
    sort: styleSort.value
  })

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
  styleCursor.value = extractCursor(result)
}

const selectStyle = async (id: number | string) => {
  activeStyleId.value = id
  const detail = await styleDetail(id)
  styleDescription.value =
    String(deepFindValue(detail, ['desc', 'description', 'tagDesc', 'intro']) ?? '')
  await loadStyleResources(true)
}

const switchStyleResource = async (type: StyleResourceType) => {
  if (styleResourceType.value === type) return
  styleResourceType.value = type
  await loadStyleResources(true)
}

const cloudSongId = (track: any) =>
  String(track?.songId ?? track?.simpleSong?.id ?? track?.id ?? '')
const cloudSongName = (track: any) => track?.simpleSong?.name ?? track?.songName ?? track?.name ?? '未知歌曲'

const matchCloudSong = async () => {
  const uid = user.value.userId
  if (!uid || !selectedCloudSongId.value || !cloudTargetSongId.value) {
    showToast('请选择云盘歌曲并填写目标歌曲 ID')
    return
  }
  const result = await cloudMatch({
    uid,
    sid: selectedCloudSongId.value,
    asid: cloudTargetSongId.value
  })
  if (!isSuccessfulResponse(result)) {
    showToast('云盘重新匹配失败')
    return
  }
  await dataStore.fetchCloudDisk()
  showToast('云盘歌曲已重新匹配')
}

const readCloudLyric = async () => {
  const uid = user.value.userId
  if (!uid || !selectedCloudSongId.value) {
    showToast('请先选择云盘歌曲')
    return
  }
  const result = await cloudLyricGet({ uid, sid: selectedCloudSongId.value })
  cloudLyricPreview.value = String(
    deepFindValue(result, ['lyric', 'lrc', 'yrc', 'content']) ?? '没有找到云盘歌词'
  ).slice(0, 3000)
}

const removeCloudSong = async () => {
  if (!selectedCloudSongId.value) {
    showToast('请先选择云盘歌曲')
    return
  }
  if (!confirm('确定从网易云云盘删除这首歌曲吗？')) return
  const result = await deleteCloudSong(Number(selectedCloudSongId.value))
  if (!isSuccessfulResponse(result)) {
    showToast('云盘删除失败')
    return
  }
  selectedCloudSongId.value = ''
  cloudLyricPreview.value = ''
  await dataStore.fetchCloudDisk()
  showToast('已从云盘删除')
}

const loadFullPlaylist = async () => {
  if (!selectedPlaylistId.value) {
    showToast('请先选择歌单')
    return
  }
  const result = await playlistTrackAll({ id: selectedPlaylistId.value, limit: 5000 })
  fullPlaylistTracks.value = extractTracks(result, 5000)
  if (!fullPlaylistTracks.value.length) showToast('完整歌曲读取失败或歌单为空')
}

const pinPlaylistFirst = async () => {
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
  const result = await updatePlaylistOrder(ordered)
  if (!isSuccessfulResponse(result)) {
    showToast('歌单顺序更新失败')
    return
  }
  await dataStore.fetchLikedPlaylist()
  showToast('已将歌单置顶')
}

const makePlaylistPublic = async () => {
  if (!selectedPlaylistId.value) return
  const result = await publishPrivatePlaylist(selectedPlaylistId.value)
  if (!isSuccessfulResponse(result)) {
    showToast('公开歌单失败')
    return
  }
  await dataStore.fetchLikedPlaylist()
  showToast('歌单已公开')
}

const loadSongInsight = async () => {
  const id = Number(insightTrackId.value)
  if (!Number.isFinite(id) || id <= 0) {
    showToast('请输入有效歌曲 ID')
    return
  }
  const [wiki, detail, red, cover, simi] = await Promise.all([
    songWikiSummary(id),
    songMusicDetail(id),
    songRedCount(id),
    songDynamicCover(id),
    similarSongs(id)
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

const loadAiDj = async () => {
  const result = await aiDjContentRecommend()
  aiDjTracks.value = extractTracks(result, 50)
  if (!aiDjTracks.value.length) showToast('私人 DJ 当前没有返回可播放歌曲')
}

const refreshCurrent = async () => {
  if (activeTab.value === 'footprint') return loadFootprint()
  if (activeTab.value === 'style') return loadStyleCatalog()
  if (activeTab.value === 'cloud') return dataStore.fetchCloudDisk()
  if (activeTab.value === 'playlist') return dataStore.fetchLikedPlaylist()
  await Promise.all([loadSongInsight(), loadAiDj()])
}

watch(
  () => currentTrack.value?.id,
  (id) => {
    if (id) insightTrackId.value = String(id)
  },
  { immediate: true }
)

watch(activeTab, async (tab) => {
  if (tab === 'style' && !styleTags.value.length) await loadStyleCatalog()
  if (tab === 'cloud' && !cloudTracks.value.length) await dataStore.fetchCloudDisk()
  if (tab === 'playlist' && !ownPlaylists.value.length) await dataStore.fetchLikedPlaylist()
})

onMounted(async () => {
  await Promise.all([loadFootprint(), homepageBlockPage({ refresh: false })])
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
  max-height: 150px;
  overflow: auto;
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
