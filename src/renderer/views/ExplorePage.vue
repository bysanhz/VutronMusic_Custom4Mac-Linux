<template>
  <div class="explore-page">
    <div v-if="exploreTab === 'playlist'">
      <div class="buttons">
        <div
          v-for="category in general.enabledPlaylistCategories"
          :key="category"
          class="button"
          :class="{ active: category === activeCategory && !showCatOptions }"
          @click="goToCategory('playlist', category)"
        >
          {{ category }}
        </div>
        <div
          class="button more"
          :class="{ active: showCatOptions }"
          @click="showCatOptions = !showCatOptions"
        >
          <svg-icon icon-class="more"></svg-icon>
        </div>
      </div>

      <div v-show="showCatOptions" class="panel">
        <div v-for="bigCat in allBigCats" :key="bigCat" class="big-cat">
          <div class="name">{{ bigCat }}</div>
          <div class="cats">
            <div
              v-for="cat in getCatsByBigCat(bigCat)"
              :key="cat.name"
              class="cat"
              :class="{ active: general.enabledPlaylistCategories.includes(cat.name) }"
              @click="togglePlaylistCategory(cat.name)"
              ><span>{{ cat.name }}</span></div
            >
          </div>
        </div>
      </div>
    </div>

    <div v-if="exploreTab === 'chart'" class="chart-list">
      <div v-for="(lst, index) in showList" :key="index" class="chart-item">
        <div class="img">
          <Cover :id="lst?.id" type="playlist" :image-url="lst?.coverImgUrl" class="cover" />
          <div class="update">{{ lst?.updateFrequency }}</div>
        </div>
        <div class="track">
          <div v-for="(key, idx) in getTrack(lst?.tracks)" :key="idx" class="track-item">
            {{ key.join(' - ').slice(0, 33) }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="exploreTab === 'artist'">
      <div class="panel" style="background-color: unset">
        <div
          v-for="bigCat in artistBigCats"
          :key="bigCat"
          class="big-cat"
          style="margin-bottom: 10px"
        >
          <div class="name">{{ bigCat }}</div>
          <div class="cats">
            <div
              v-for="cat in getArtistCatsByBigCat(bigCat)"
              :key="cat.name"
              class="cat unset"
              :class="{ active: activeArtistCat.includes(cat) }"
              @click="toggleArtistCategory(cat)"
              ><span>{{ cat.name }}</span></div
            >
          </div>
        </div>
      </div>
    </div>

    <div v-if="exploreTab === 'newTrack'">
      <div class="buttons">
        <div
          v-for="category in newTrackBtn"
          :key="category"
          class="button"
          :class="{ active: category === activeCategory }"
          @click="goToCategory('newTrack', category)"
        >
          {{ category }}
        </div>
      </div>
    </div>

    <div v-if="exploreTab === 'newAlbum'" class="albumsTab">
      <div class="buttons">
        <div
          v-for="category in newTrackBtn"
          :key="category"
          class="button"
          :class="{ active: category === activeCategory }"
          @click="goToCategory('newAlbum', category)"
        >
          {{ category }}
        </div>
      </div>
      <div class="buttons">
        <div
          v-for="(itemType, index) in albumTypeBtn"
          :key="index"
          class="button"
          :class="{ active: itemType === albumType }"
          :style="{ backgroundColor: 'unset', margin: '10px 0 6px 0' }"
          @click="updateType(itemType)"
          >{{ itemType }}</div
        >
      </div>
    </div>

    <div v-if="exploreTab === 'style'" class="style-section">
      <div class="section-heading">
        <div>
          <div class="section-title">曲风漫游</div>
          <div class="section-desc">来自网易云曲风标签与账号偏好，选择曲风直接发现歌曲。</div>
        </div>
      </div>
      <div class="buttons style-buttons">
        <div
          v-for="tag in styleTags"
          :key="String(tag.id)"
          class="button"
          :class="{ active: String(tag.id) === String(activeStyleId) }"
          @click="selectStyle(tag)"
        >
          <span v-if="tag.preferred" class="preferred-dot">●</span>{{ tag.name }}
        </div>
      </div>
    </div>

    <div v-if="exploreTab === 'following'" class="following-section">
      <div class="section-heading">
        <div>
          <div class="section-title">关注歌手新作</div>
          <div class="section-desc">集中查看你已关注歌手最近发布的歌曲和 MV。</div>
        </div>
        <div class="buttons compact-buttons">
          <div
            class="button"
            :class="{ active: followingMode === 'song' }"
            @click="switchFollowingMode('song')"
            >新歌</div
          >
          <div
            class="button"
            :class="{ active: followingMode === 'mv' }"
            @click="switchFollowingMode('mv')"
            >MV</div
          >
        </div>
      </div>
    </div>

    <div v-if="exploreTab === 'newTrack'" class="playlists">
      <TrackList id="11" :items="tracks" :colunm-number="1" type="playlist" :is-end="true" />
    </div>

    <div v-else-if="exploreTab === 'newAlbum'" class="playlists">
      <div v-if="albumType === '热门' && newAlbumInfo.topAlbum.weekData.length !== 0">
        <div :style="{ margin: '20px 0', fontSize: '20px', fontWeight: '600' }">本周新碟</div>
        <CoverRow
          v-if="show"
          :items="newAlbumInfo.topAlbum.weekData"
          type="album"
          sub-text="artist"
          :show-play-button="false"
          :show-play-count="false"
          :show-position="true"
          :padding-bottom="0"
          :colunm-number="5"
          :is-end="true"
        />
      </div>
      <div>
        <div :style="{ margin: '20px 0', fontSize: '20px', fontWeight: '600' }">本月新碟</div>
        <CoverRow
          v-if="show"
          :items="
            albumType === '热门' ? newAlbumInfo.topAlbum.monthData : newAlbumInfo.newAlbums.albums
          "
          type="album"
          sub-text="artist"
          :show-play-button="false"
          :show-play-count="false"
          :show-position="true"
          :padding-bottom="0"
          :is-end="true"
          :colunm-number="5"
          :load-more="loadMore"
        />
      </div>
    </div>

    <div v-else-if="exploreTab === 'style'" class="playlists">
      <TrackList
        v-if="show && tracks.length"
        :id="`style-${activeStyleId}`"
        :items="tracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
      />
      <div v-else-if="show" class="empty-state">当前曲风暂时没有可展示的歌曲</div>
    </div>

    <div v-else-if="exploreTab === 'following'" class="playlists">
      <TrackList
        v-if="show && followingMode === 'song' && tracks.length"
        id="following-new-songs"
        :items="tracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
      />
      <MvRow
        v-else-if="show && followingMode === 'mv' && followingMvs.length"
        :mvs="followingMvs"
        :is-end="true"
      />
      <div v-else-if="show" class="empty-state">暂无关注歌手新作，或当前账号尚未登录</div>
    </div>

    <div v-else class="playlists">
      <CoverRow
        v-if="show"
        :items="playlists"
        :type="exploreTab === 'artist' ? 'artist' : 'playlist'"
        :sub-text="subText"
        :show-play-button="true"
        :show-position="true"
        :padding-bottom="0"
        :is-end="true"
        :show-play-count="activeCategory !== '排行榜' && exploreTab !== 'artist'"
        :item-height="exploreTab === 'artist' ? 224 : 270"
        :colunm-number="5"
        :load-more="loadMore"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onBeforeUnmount, reactive, watch, nextTick, inject } from 'vue'
import { storeToRefs } from 'pinia'
import { useNormalStateStore } from '../store/state'
import { useSettingsStore } from '../store/settings'
import { playlistCategories, artistCategories } from '../utils/common'
import SvgIcon from '../components/SvgIcon.vue'
import CoverRow from '../components/VirtualCoverRow.vue'
import Cover from '../components/CoverBox.vue'
import TrackList from '../components/VirtualTrackList.vue'
import MvRow from '../components/MvRow.vue'
import { tricklingProgress } from '../utils/tricklingProgress'
import { useRouter, useRoute, onBeforeRouteUpdate } from 'vue-router'
import { getRecommendPlayList } from '../utils/playlist'
import { highQualityPlaylist, topPlaylist, toplists, toplistDetail } from '../api/playlist'
import { getArtistList } from '../api/artist'
import { topAlbum, topSong } from '../api/track'
import { newAlbums } from '../api/album'
import {
  followedArtistNewMvs,
  followedArtistNewSongs,
  styleList,
  stylePreference,
  styleSongs
} from '../api/discovery'

interface StyleTag {
  id: number | string
  name: string
  preferred?: boolean
}

const router = useRouter()
const route = useRoute()
const stateStore = useNormalStateStore()
const { exploreTab } = storeToRefs(stateStore)
const { showToast } = stateStore
const settingStore = useSettingsStore()
const { general } = storeToRefs(settingStore)
const { togglePlaylistCategory } = settingStore

const playlistInfo = reactive({
  total: 0,
  more: true,
  lasttime: 0
})
const newAlbumInfo = reactive({
  newAlbums: { albums: [] as any[], total: 0 },
  topAlbum: { hasMore: true, monthData: [] as any[], weekData: [] as any[] }
})
const artistInfo = reactive({ more: true })

const activeCategory = ref('全部')
const saveCategory = ref('全部')
const showCatOptions = ref(false)
const allBigCats = ref(['语种', '风格', '场景', '情感', '主题'])
const artistBigCats = ref(['语种', '分类', '筛选'])
const playlists = ref<any[]>([])
const tracks = ref<any[]>([])
const show = ref(false)
const showList = ref<any[]>([])
const activeArtistCat = ref(artistCategories.filter((cat) => cat.enable))
const newTrackBtn = ref(['全部', '华语', '欧美', '日本', '韩国'])
const albumTypeBtn = ref(['热门', '全部'])
const albumType = ref('热门')
const styleTags = ref<StyleTag[]>([])
const activeStyleId = ref<number | string>('')
const followingMode = ref<'song' | 'mv'>('song')
const followingMvs = ref<any[]>([])

const subText = computed(() => {
  if (activeCategory.value === '排行榜') return 'updateFrequency'
  if (activeCategory.value === '推荐歌单') return 'copywriter'
  return 'none'
})

const goToCategory = (tab: string, category: string) => {
  show.value = false
  showCatOptions.value = false
  router.push({ name: 'explore', query: { tab, category } })
}

const updateType = (itemType: string) => {
  albumType.value = itemType
  router.push({
    name: 'explore',
    query: { tab: 'newAlbum', category: activeCategory.value, type: itemType }
  })
}

const toggleArtistCategory = (category: any) => {
  category.enable = true
  const idx = activeArtistCat.value.findIndex((cat) => cat.bigCat === category.bigCat)
  if (idx < 0) return
  activeArtistCat.value[idx].enable = false
  activeArtistCat.value[idx] = category
  playlists.value = []
  void getPlaylist()
}

const getCatsByBigCat = (bigCat: string) =>
  playlistCategories.filter((cat) => cat.bigCat === bigCat)
const getArtistCatsByBigCat = (bigCat: string) =>
  artistCategories.filter((cat) => cat.bigCat === bigCat)
const getTrack = (items: any[] = []) => items.map((track) => [track.first, track.second])

const updatePlaylist = (playlistList: any[] = []) => {
  tracks.value = []
  playlists.value.push(...playlistList)
  tricklingProgress.done()
  show.value = true
}

const getHighQualityPlaylist = () => {
  if (!playlistInfo.more) return
  return highQualityPlaylist({ limit: 50, before: playlistInfo.lasttime }).then((data) => {
    playlistInfo.more = data.more
    playlistInfo.lasttime = data.lasttime
    playlistInfo.total = data.total
    updatePlaylist(data.playlists)
  })
}

const loadMore = () => {
  if (!['推荐歌单', '排行榜'].includes(activeCategory.value)) void getPlaylist()
}

const getTopLists = () => {
  toplistDetail().then((data) => {
    const names = ['飙升榜', '新歌榜', '原创榜', '热歌榜']
    showList.value = names
      .map((name) => data.list.find((item) => item.name === name))
      .filter(Boolean)
  })
  return toplists().then((data) => {
    playlists.value = []
    updatePlaylist(data.list)
    playlists.value = playlists.value.slice(4)
  })
}

const getNewTrack = () => {
  const trackMap: Record<string, number> = { 全部: 0, 华语: 7, 欧美: 96, 日本: 8, 韩国: 16 }
  return topSong(trackMap[activeCategory.value] ?? 0).then((data) => {
    playlists.value = []
    tracks.value = data.data ?? []
    tricklingProgress.done()
    show.value = true
  })
}

const getNewAlbum = () => {
  const albumMap: Record<string, string> = {
    全部: 'ALL',
    华语: 'ZH',
    欧美: 'EA',
    日本: 'JP',
    韩国: 'KR'
  }
  if (albumType.value === '热门') {
    if (!newAlbumInfo.topAlbum.hasMore) return
    return topAlbum({ area: albumMap[activeCategory.value] ?? 'ALL' }).then((data) => {
      newAlbumInfo.topAlbum.hasMore = data.hasMore
      newAlbumInfo.topAlbum.weekData = data.weekData ?? []
      newAlbumInfo.topAlbum.monthData = data.monthData ?? []
      tricklingProgress.done()
      show.value = true
    })
  }
  if (
    newAlbumInfo.newAlbums.albums.length > 0 &&
    newAlbumInfo.newAlbums.albums.length === newAlbumInfo.newAlbums.total
  ) {
    return
  }
  return newAlbums({
    area: albumMap[activeCategory.value] ?? 'ALL',
    limit: 50,
    offset: newAlbumInfo.newAlbums.albums.length
  }).then((data) => {
    newAlbumInfo.newAlbums.albums.push(...(data.albums ?? []))
    newAlbumInfo.newAlbums.total = data.total ?? newAlbumInfo.newAlbums.total
    tricklingProgress.done()
    show.value = true
  })
}

const getArtists = () => {
  if (!artistInfo.more) return
  const params = {
    type: activeArtistCat.value[1].code,
    area: activeArtistCat.value[0].code,
    initial: activeArtistCat.value[2].code ?? activeArtistCat.value[2].name,
    limit: 50,
    offset: playlists.value.length
  }
  return getArtistList(params).then((data) => {
    updatePlaylist(data.artists)
    artistInfo.more = data.more
  })
}

const collectStyleTags = (value: any, output: StyleTag[] = [], depth = 0): StyleTag[] => {
  if (depth > 6 || value == null) return output
  if (Array.isArray(value)) {
    for (const item of value) collectStyleTags(item, output, depth + 1)
    return output
  }
  if (typeof value !== 'object') return output

  const id = value.tagId ?? value.id
  const name = value.tagName ?? value.name
  if (
    (typeof id === 'number' || typeof id === 'string') &&
    typeof name === 'string' &&
    name.trim()
  ) {
    if (!output.some((item) => String(item.id) === String(id))) {
      output.push({ id, name: name.trim() })
    }
  }
  for (const nested of Object.values(value)) collectStyleTags(nested, output, depth + 1)
  return output
}

const unwrapTrack = (item: any) =>
  item?.song ?? item?.resource?.song ?? item?.resource ?? item?.data ?? item
const unwrapMv = (item: any) =>
  item?.mv ?? item?.resource?.mv ?? item?.resource ?? item?.data ?? item

const findFirstArray = (source: any, keys: string[]): any[] => {
  for (const key of keys) {
    const value = key.split('.').reduce((current: any, segment) => current?.[segment], source)
    if (Array.isArray(value)) return value
  }
  return []
}

const selectStyle = (tag: StyleTag) => {
  activeStyleId.value = tag.id
  tracks.value = []
  show.value = false
  tricklingProgress.start()
  styleSongs({ tagId: tag.id, size: 100 })
    .then((result) => {
      const raw = findFirstArray(result, ['data.songs', 'data.list', 'songs', 'list', 'data'])
      tracks.value = raw.map(unwrapTrack).filter((item) => item?.id)
    })
    .catch((error) => {
      console.warn('[Explore] 加载曲风歌曲失败:', error)
      showToast('曲风歌曲加载失败，请稍后重试')
    })
    .finally(() => {
      tricklingProgress.done()
      show.value = true
    })
}

const getStyles = async () => {
  try {
    const [listResult, preferenceResult] = await Promise.allSettled([
      styleList(),
      stylePreference()
    ])
    const tags = listResult.status === 'fulfilled' ? collectStyleTags(listResult.value) : []
    const preferred =
      preferenceResult.status === 'fulfilled'
        ? new Set(collectStyleTags(preferenceResult.value).map((tag) => String(tag.id)))
        : new Set<string>()

    styleTags.value = tags
      .map((tag) => ({ ...tag, preferred: preferred.has(String(tag.id)) }))
      .sort((a, b) => Number(Boolean(b.preferred)) - Number(Boolean(a.preferred)))
      .slice(0, 80)

    if (styleTags.value.length) {
      const preferredTag = styleTags.value.find((tag) => tag.preferred) ?? styleTags.value[0]
      selectStyle(preferredTag)
      return
    }
  } catch (error) {
    console.warn('[Explore] 加载曲风列表失败:', error)
  }
  tricklingProgress.done()
  show.value = true
}

const normalizeMv = (item: any) => {
  const mv = unwrapMv(item)
  return {
    ...mv,
    id: mv?.id ?? mv?.mvId ?? mv?.vid,
    name: mv?.name ?? mv?.title ?? 'MV',
    cover: mv?.cover ?? mv?.coverUrl ?? mv?.imgurl16v9 ?? mv?.picUrl ?? '',
    artistName: mv?.artistName ?? mv?.artist?.name ?? mv?.artists?.[0]?.name ?? '',
    artistId: mv?.artistId ?? mv?.artist?.id ?? mv?.artists?.[0]?.id ?? 0
  }
}

const getFollowingWorks = async () => {
  show.value = false
  tricklingProgress.start()
  try {
    if (followingMode.value === 'song') {
      const result = await followedArtistNewSongs({ limit: 100 })
      const raw = findFirstArray(result, [
        'data.newWorks',
        'data.list',
        'data.songs',
        'newWorks',
        'list',
        'songs',
        'data'
      ])
      tracks.value = raw.map(unwrapTrack).filter((item) => item?.id)
      followingMvs.value = []
    } else {
      const result = await followedArtistNewMvs({ limit: 100 })
      const raw = findFirstArray(result, [
        'data.newWorks',
        'data.list',
        'data.mvs',
        'newWorks',
        'list',
        'mvs',
        'data'
      ])
      followingMvs.value = raw.map(normalizeMv).filter((item) => item.id && item.cover)
      tracks.value = []
    }
  } catch (error) {
    console.warn('[Explore] 加载关注歌手新作失败:', error)
    tracks.value = []
    followingMvs.value = []
  } finally {
    tricklingProgress.done()
    show.value = true
  }
}

const switchFollowingMode = (mode: 'song' | 'mv') => {
  if (followingMode.value === mode && show.value) return
  followingMode.value = mode
  void getFollowingWorks()
}

const getPlaylist = () => {
  if (exploreTab.value === 'artist') return getArtists()
  if (exploreTab.value === 'chart') return getTopLists()
  if (exploreTab.value === 'style') return getStyles()
  if (exploreTab.value === 'following') return getFollowingWorks()
  if (exploreTab.value === 'playlist') {
    if (activeCategory.value === '推荐歌单') {
      return getRecommendPlayList(100, true).then((list) => {
        playlists.value = []
        updatePlaylist(list)
      })
    }
    if (activeCategory.value === '精品歌单') return getHighQualityPlaylist()
    return topPlaylist({ cat: activeCategory.value, offset: playlists.value.length }).then(
      (data) => {
        playlistInfo.more = data.more
        playlistInfo.total = data.total
        playlistInfo.lasttime = 0
        updatePlaylist(data.playlists)
      }
    )
  }
  if (exploreTab.value === 'newTrack') {
    show.value = false
    return getNewTrack()
  }
  if (exploreTab.value === 'newAlbum') {
    playlists.value = []
    return getNewAlbum()
  }
}

const resetViewData = () => {
  playlists.value = []
  tracks.value = []
  followingMvs.value = []
  showList.value = []
  show.value = false
  playlistInfo.more = true
  playlistInfo.lasttime = 0
  artistInfo.more = true
}

const syncRoute = (target = route) => {
  const tab = target.query.tab as string
  if (tab) exploreTab.value = tab
  activeCategory.value = (target.query.category as string) || saveCategory.value
  if (target.query.type) albumType.value = target.query.type as string
}

const loadData = () => {
  setTimeout(() => {
    if (!show.value) tricklingProgress.start()
  }, 1000)
  syncRoute()
  void getPlaylist()
}

const updatePadding = inject('updatePadding') as (val: number) => void
watch(albumType, () => nextTick(() => updatePadding(0)))

onBeforeRouteUpdate((to, _from, next) => {
  updatePadding(0)
  resetViewData()
  syncRoute(to)
  void getPlaylist()
  next()
})

onMounted(() => {
  updatePadding(0)
  resetViewData()
  loadData()
})

onBeforeUnmount(() => {
  updatePadding(96)
  exploreTab.value = 'playlist'
})
</script>

<style scoped lang="scss">
.albumsTab,
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.section-heading {
  margin: 8px 0 14px;
}

.section-title {
  font-size: 24px;
  font-weight: 700;
}

.section-desc {
  margin-top: 5px;
  font-size: 13px;
  opacity: 0.58;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
}

.compact-buttons {
  flex-wrap: nowrap;

  .button {
    margin-top: 0;
  }
}

.button {
  user-select: none;
  cursor: pointer;
  padding: 8px 16px;
  margin: 10px 16px 6px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  font-size: 18px;
  border-radius: 10px;
  background-color: var(--color-secondary-bg);
  color: var(--color-secondary);
  transition: 0.2s;

  &:hover,
  &.active {
    background: color-mix(in oklab, var(--color-primary) var(--bg-alpha), white);
    color: var(--color-primary);
  }
}

.style-buttons .button {
  font-size: 15px;
  padding: 7px 13px;
  margin-right: 10px;
}

.preferred-dot {
  color: var(--color-primary);
  font-size: 8px;
}

.panel {
  margin-top: 10px;
  background: var(--color-secondary-bg);
  border-radius: 10px;
  padding: 8px;
  color: var(--color-text);

  .big-cat {
    display: flex;
    margin-bottom: 32px;
  }

  .name {
    font-size: 24px;
    font-weight: 700;
    opacity: 0.68;
    margin-left: 24px;
    min-width: 54px;
    height: 26px;
    margin-top: 8px;
  }

  .cats {
    margin-left: 24px;
    display: flex;
    flex-wrap: wrap;
  }

  .cat {
    user-select: none;
    margin: 4px 0 0;
    display: flex;
    align-items: center;
    font-weight: 500;
    font-size: 16px;
    transition: 0.2s;
    min-width: 98px;

    span {
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      padding: 6px 12px;
      height: 26px;
      border-radius: 10px;
      opacity: 0.88;

      &:hover {
        opacity: 1;
        background: color-mix(in oklab, var(--color-primary) var(--bg-alpha), white);
        color: var(--color-primary);
      }
    }
  }

  .cat.unset span:hover {
    background-color: unset;
  }

  .cat.active {
    color: var(--color-primary);
  }
}

.chart-list {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-gap: 20px;
}

.chart-item {
  margin-bottom: 10px;
  display: flex;
  justify-content: center;

  .img {
    flex: 0.8;
    justify-content: center;
    position: relative;

    .update {
      font-size: 14px;
      font-weight: 500;
      color: white;
      position: absolute;
      top: 68%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
  }

  .track {
    flex: 1.2;
    flex-direction: column;
    justify-content: center;
    font-size: 12px;
    padding-left: 10px;
    display: flex;

    .track-item {
      height: 40px;
      line-height: 40px;
      align-items: center;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 10px;
      border-radius: 8px;
      user-select: none;
    }

    .track-item:nth-child(odd) {
      background-color: var(--color-secondary-bg);
    }
  }
}

.playlists {
  margin-top: 24px;
}

.empty-state {
  padding: 80px 0;
  text-align: center;
  opacity: 0.5;
  font-size: 15px;
}

.button.more .svg-icon {
  height: 24px;
  width: 24px;
}
</style>
