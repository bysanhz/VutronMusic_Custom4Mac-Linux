<template>
  <div class="explore-page">
    <div v-if="exploreTab === 'playlist'" class="explore-filter-section">
      <div class="buttons playlist-filter-bar">
        <div
          v-for="category in general.enabledPlaylistCategories"
          :key="category"
          class="button"
          :class="{ active: category === activeCategory && !showCatOptions }"
          @click="goToCategory('playlist', category)"
        >
          {{ categoryLabel(category) }}
        </div>
        <div
          class="button more"
          :class="{ active: showCatOptions }"
          @click="showCatOptions = !showCatOptions"
        >
          <svg-icon icon-class="more"></svg-icon>
        </div>
      </div>

      <div v-show="showCatOptions" class="panel playlist-category-panel">
        <div v-for="bigCat in allBigCats" :key="bigCat" class="big-cat">
          <div class="name">{{ categoryLabel(bigCat) }}</div>
          <div class="cats">
            <div
              v-for="cat in getCatsByBigCat(bigCat)"
              :key="cat.name"
              class="cat"
              :class="{ active: general.enabledPlaylistCategories.includes(cat.name) }"
              @click="togglePlaylistCategory(cat.name)"
              ><span>{{ categoryLabel(cat.name) }}</span></div
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

    <div v-if="exploreTab === 'artist'" class="explore-filter-section">
      <div class="panel artist-filter-panel">
        <div v-for="bigCat in artistBigCats" :key="bigCat" class="big-cat">
          <div class="name">{{ categoryLabel(bigCat) }}</div>
          <div class="cats" :class="{ 'artist-alpha-row': bigCat === '筛选' }">
            <div
              v-for="cat in getArtistCatsByBigCat(bigCat)"
              :key="cat.name"
              class="cat unset"
              :class="{ active: activeArtistCat.includes(cat) }"
              @click="toggleArtistCategory(cat)"
              ><span>{{ categoryLabel(cat.name) }}</span></div
            >
          </div>
        </div>
      </div>
    </div>

    <div v-if="exploreTab === 'newTrack'" class="explore-filter-section">
      <div class="buttons area-filter-bar">
        <div
          v-for="category in newTrackBtn"
          :key="category"
          class="button"
          :class="{ active: category === activeCategory }"
          @click="goToCategory('newTrack', category)"
        >
          {{ categoryLabel(category) }}
        </div>
      </div>
    </div>

    <div v-if="exploreTab === 'newAlbum'" class="albumsTab explore-filter-section">
      <div class="buttons area-filter-bar">
        <div
          v-for="category in newTrackBtn"
          :key="category"
          class="button"
          :class="{ active: category === activeCategory }"
          @click="goToCategory('newAlbum', category)"
        >
          {{ categoryLabel(category) }}
        </div>
      </div>
      <div class="buttons album-type-filter-bar">
        <div
          v-for="(itemType, index) in albumTypeBtn"
          :key="index"
          class="button"
          :class="{ active: itemType === albumType }"
          @click="updateType(itemType)"
          >{{ categoryLabel(itemType) }}</div
        >
      </div>
    </div>

    <div v-if="exploreTab === 'style'" class="style-section">
      <div class="section-heading">
        <div>
          <div class="section-title">{{ t('explore.styleRoam') }}</div>
          <div class="section-desc">{{ t('explore.styleRoamDesc') }}</div>
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
          <div class="section-title">{{ t('explore.followingWorks') }}</div>
          <div class="section-desc">{{ t('explore.followingWorksDesc') }}</div>
        </div>
        <div class="buttons compact-buttons">
          <div
            class="button"
            :class="{ active: followingMode === 'song' }"
            @click="switchFollowingMode('song')"
            >{{ t('explore.newSongs') }}</div
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
      <TrackList
        id="11"
        :items="tracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
        :enable-virtual-scroll="false"
        :padding-bottom="0"
      />
    </div>

    <div v-else-if="exploreTab === 'newAlbum'" class="playlists">
      <div v-if="albumLoading" class="following-loading" aria-live="polite">
        <span class="following-loading-spinner" aria-hidden="true"></span>
        <span>{{ t('explore.loadingMore') }}</span>
      </div>

      <template v-else>
        <div v-if="albumType === '热门' && newAlbumInfo.topAlbum.weekData.length">
          <div :style="{ margin: '20px 0', fontSize: '20px', fontWeight: '600' }">{{
            t('explore.weekNewAlbums')
          }}</div>
          <CoverRow
            :items="newAlbumInfo.topAlbum.weekData"
            type="album"
            sub-text="artist"
            :show-play-button="false"
            :show-play-count="false"
            :show-position="true"
            :padding-bottom="0"
            :colunm-number="4"
            :fixed-column-number="true"
            :is-end="true"
            :enable-virtual-scroll="false"
          />
        </div>

        <div
          v-if="
            albumType === '热门'
              ? newAlbumInfo.topAlbum.monthData.length
              : newAlbumInfo.newAlbums.albums.length
          "
        >
          <div :style="{ margin: '20px 0', fontSize: '20px', fontWeight: '600' }">{{
            t('explore.monthNewAlbums')
          }}</div>
          <CoverRow
            :items="
              albumType === '热门'
                ? newAlbumInfo.topAlbum.monthData
                : newAlbumInfo.newAlbums.albums
            "
            type="album"
            sub-text="artist"
            :show-play-button="false"
            :show-play-count="false"
            :show-position="true"
            :padding-bottom="0"
            :is-end="!canLoadMore()"
            :colunm-number="4"
            :fixed-column-number="true"
            :enable-virtual-scroll="false"
            :load-more="loadMore"
          />
          <div v-if="loadingMore" class="load-more-state" aria-live="polite">
            <span class="load-more-spinner" aria-hidden="true"></span>
            <span>{{ t('explore.loadingMore') }}</span>
          </div>
        </div>

        <div
          v-if="
            show &&
            !(albumType === '热门'
              ? newAlbumInfo.topAlbum.weekData.length || newAlbumInfo.topAlbum.monthData.length
              : newAlbumInfo.newAlbums.albums.length)
          "
          class="empty-state"
        >
          {{ t('explore.noAlbums') }}
        </div>
      </template>
    </div>

    <div v-else-if="exploreTab === 'style'" class="playlists">
      <TrackList
        v-if="show && tracks.length"
        :id="`style-${activeStyleId}`"
        :items="tracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
        :enable-virtual-scroll="false"
        :padding-bottom="0"
      />
      <div v-else-if="show" class="empty-state">{{ t('explore.noStyleSongs') }}</div>
    </div>

    <div v-else-if="exploreTab === 'following'" class="playlists">
      <div v-if="followingLoading" class="following-loading" aria-live="polite">
        <span class="following-loading-spinner" aria-hidden="true"></span>
        <span>{{ t('explore.loadingMore') }}</span>
      </div>
      <TrackList
        v-else-if="show && followingMode === 'song' && tracks.length"
        id="following-new-songs"
        :items="tracks"
        :colunm-number="1"
        type="playlist"
        :is-end="true"
        :enable-virtual-scroll="false"
        :padding-bottom="0"
      />
      <MvRow
        v-else-if="show && followingMode === 'mv' && followingMvs.length"
        :mvs="followingMvs"
        :is-end="true"
        :column-number="2"
        :item-size="310"
        :gap="24"
        :padding-bottom="0"
        :enable-virtual-scroll="false"
      />
      <div v-else-if="show" class="empty-state">
        {{
          isAccountLoggedIn
            ? t('explore.noFollowingWorks')
            : t('explore.followingLoginRequired')
        }}
      </div>
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
        :is-end="!canLoadMore()"
        :show-play-count="activeCategory !== '排行榜' && exploreTab !== 'artist'"
        :item-height="exploreTab === 'artist' ? 224 : 270"
        :colunm-number="4"
        :fixed-column-number="true"
        :enable-virtual-scroll="false"
        :load-more="loadMore"
      />
      <div v-if="loadingMore" class="load-more-state" aria-live="polite">
        <span class="load-more-spinner" aria-hidden="true"></span>
        <span>{{ t('explore.loadingMore') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onBeforeUnmount, reactive, watch, nextTick, inject } from 'vue'
import { storeToRefs } from 'pinia'
import { useNormalStateStore } from '../store/state'
import { useSettingsStore } from '../store/settings'
import { useDataStore } from '../store/data'
import { playlistCategories, artistCategories } from '../utils/common'
import SvgIcon from '../components/SvgIcon.vue'
import CoverRow from '../components/VirtualCoverRow.vue'
import Cover from '../components/CoverBox.vue'
import TrackList from '../components/VirtualTrackList.vue'
import MvRow from '../components/MvRow.vue'
import { tricklingProgress } from '../utils/tricklingProgress'
import { useRouter, useRoute, onBeforeRouteUpdate } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getRecommendPlayList } from '../utils/playlist'
import { highQualityPlaylist, topPlaylist, toplists, toplistDetail } from '../api/playlist'
import { getArtistList } from '../api/artist'
import { likedArtists } from '../api/user'
import { getTrackDetail, topAlbum, topSong } from '../api/track'
import { newAlbums } from '../api/album'
import {
  followedArtistNewMvs,
  followedArtistNewSongMvListV2,
  followedArtistNewSongs,
  followedArtistNewSongsPlayAll,
  styleList,
  stylePreference,
  styleSongs
} from '../api/discovery'
import { extractTracks, normalizeTrack } from '../services/neteaseModern'

interface StyleTag {
  id: number | string
  name: string
  preferred?: boolean
}

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const stateStore = useNormalStateStore()
const { exploreTab } = storeToRefs(stateStore)
const { showToast } = stateStore
const dataStore = useDataStore()
const { user } = storeToRefs(dataStore)
const isAccountLoggedIn = computed(() => Number(user.value?.userId) > 0)
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
const followingLoading = ref(false)
const albumLoading = ref(false)
const loadingMore = ref(false)
const PLAYLIST_PAGE_SIZE = 24

const categoryLabel = (value: string) => t(`explore.categories.${value}`, value)

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
  const existingIds = new Set(
    playlists.value.map((item) => (item?.id == null ? '' : String(item.id))).filter(Boolean)
  )
  for (const item of playlistList) {
    const id = item?.id == null ? '' : String(item.id)
    if (!id || !existingIds.has(id)) {
      playlists.value.push(item)
      if (id) existingIds.add(id)
    }
  }
  tricklingProgress.done()
  show.value = true
}

const getHighQualityPlaylist = () => {
  if (!playlistInfo.more) return
  return highQualityPlaylist({
    limit: PLAYLIST_PAGE_SIZE,
    before: playlistInfo.lasttime
  }).then((data) => {
    playlistInfo.more = data.more
    playlistInfo.lasttime = data.lasttime
    playlistInfo.total = data.total
    updatePlaylist(data.playlists)
  })
}

const canLoadMore = () => {
  if (exploreTab.value === 'playlist') {
    if (['推荐歌单', '排行榜'].includes(activeCategory.value)) return false
    if (playlistInfo.total > 0) return playlists.value.length < playlistInfo.total
    return playlistInfo.more
  }
  if (exploreTab.value === 'artist') return artistInfo.more
  if (exploreTab.value === 'newAlbum') {
    if (albumType.value !== '全部') return false
    const { albums, total } = newAlbumInfo.newAlbums
    return total <= 0 || albums.length < total
  }
  return false
}

const loadMore = async () => {
  if (loadingMore.value || !canLoadMore()) return
  loadingMore.value = true
  try {
    await getPlaylist()
  } catch (error) {
    console.warn('[Explore] 加载下一页失败:', error)
  } finally {
    loadingMore.value = false
  }
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

const extractAlbumList = (source: any, keys: string[] = []) => {
  for (const key of keys) {
    const value = key.split('.').reduce((current: any, segment) => current?.[segment], source)
    if (Array.isArray(value)) return value.filter(Boolean)
  }

  const fallbackCandidates = [
    source?.albums,
    source?.data?.albums,
    source?.result?.albums,
    source?.data?.list,
    source?.list
  ]

  for (const candidate of fallbackCandidates) {
    if (Array.isArray(candidate)) return candidate.filter(Boolean)
  }

  return []
}

const splitCurrentAlbumFeed = (albums: any[]) => {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - 7)

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const weekStartMs = weekStart.getTime()

  const weekData: any[] = []
  const monthData: any[] = []

  for (const album of albums) {
    const publishTime = Number(
      album?.publishTime ?? album?.pubTime ?? album?.releaseTime ?? album?.publishDate ?? 0
    )

    if (Number.isFinite(publishTime) && publishTime >= weekStartMs) {
      weekData.push(album)
      continue
    }

    if (Number.isFinite(publishTime) && publishTime >= monthStart) {
      monthData.push(album)
      continue
    }

    // 当前 /top/album 本身就是“当前新碟”接口；若没有时间字段，也不要把数据丢掉。
    monthData.push(album)
  }

  return {
    weekData,
    monthData: monthData.length ? monthData : albums.filter(
      (album) => !weekData.includes(album)
    )
  }
}

const getNewAlbum = async () => {
  const albumMap: Record<string, string> = {
    全部: 'ALL',
    华语: 'ZH',
    欧美: 'EA',
    日本: 'JP',
    韩国: 'KR'
  }
  const area = albumMap[activeCategory.value] ?? 'ALL'

  albumLoading.value = true
  show.value = false
  tricklingProgress.start()

  try {
    if (albumType.value === '热门') {
      const data = await topAlbum({
        area,
        limit: 80,
        offset: 0,
        type: 'new'
      })

      const explicitWeek = extractAlbumList(data, ['weekData', 'data.weekData'])
      const explicitMonth = extractAlbumList(data, ['monthData', 'data.monthData'])

      if (explicitWeek.length || explicitMonth.length) {
        newAlbumInfo.topAlbum.weekData = explicitWeek
        newAlbumInfo.topAlbum.monthData = explicitMonth
      } else {
        const albums = extractAlbumList(data, ['albums', 'data.albums', 'result.albums'])
        const split = splitCurrentAlbumFeed(albums)
        newAlbumInfo.topAlbum.weekData = split.weekData
        newAlbumInfo.topAlbum.monthData = split.monthData
      }

      newAlbumInfo.topAlbum.hasMore = Boolean(
        data?.hasMore ?? data?.more ?? data?.data?.hasMore ?? data?.data?.more
      )
      return
    }

    const data = await newAlbums({
      area,
      limit: PLAYLIST_PAGE_SIZE,
      offset: newAlbumInfo.newAlbums.albums.length
    })

    const page = extractAlbumList(data, ['albums', 'data.albums', 'result.albums'])
    const existingIds = new Set(
      newAlbumInfo.newAlbums.albums
        .map((album: any) => (album?.id == null ? '' : String(album.id)))
        .filter(Boolean)
    )

    for (const album of page) {
      const id = album?.id == null ? '' : String(album.id)
      if (id && existingIds.has(id)) continue
      newAlbumInfo.newAlbums.albums.push(album)
      if (id) existingIds.add(id)
    }

    const total = Number(data?.total ?? data?.data?.total ?? data?.result?.total)
    if (Number.isFinite(total) && total >= 0) {
      newAlbumInfo.newAlbums.total = total
    } else if (page.length < PLAYLIST_PAGE_SIZE) {
      newAlbumInfo.newAlbums.total = newAlbumInfo.newAlbums.albums.length
    }
  } catch (error) {
    console.warn('[Explore] 加载新专速递失败:', error)
  } finally {
    albumLoading.value = false
    tricklingProgress.done()
    show.value = true
  }
}

const getArtists = () => {
  if (!artistInfo.more) return
  const params = {
    type: activeArtistCat.value[1].code,
    area: activeArtistCat.value[0].code,
    initial: activeArtistCat.value[2].code ?? activeArtistCat.value[2].name,
    limit: PLAYLIST_PAGE_SIZE,
    offset: playlists.value.length
  }
  return getArtistList(params).then((data) => {
    updatePlaylist(data.artists)
    artistInfo.more = Boolean(data.more) && Boolean(data.artists?.length)
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

const enrichStyleTracks = async (rawItems: any[]) => {
  const sourceTracks = rawItems.map(unwrapTrack).filter(Boolean)
  const ids = Array.from(
    new Set(
      sourceTracks
        .map((item) => Number(item?.id ?? item?.songId ?? item?.resourceId))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  )

  /*
   * /style/song 返回的歌曲元数据经常是精简版：有 id/name，但缺 al.picUrl、
   * publishTime，甚至 artists。TrackList 需要的是完整歌曲结构，所以按 50 首一批
   * 用 /song/detail 补齐真实网易云元数据。
   */
  const detailMap = new Map<string, any>()
  for (let offset = 0; offset < ids.length; offset += 50) {
    const chunk = ids.slice(offset, offset + 50)
    if (!chunk.length) continue

    try {
      const detailResult = await getTrackDetail(chunk.join(','))
      const detailSongs = Array.isArray(detailResult?.songs)
        ? detailResult.songs
        : Array.isArray(detailResult?.data?.songs)
          ? detailResult.data.songs
          : []

      for (const detail of detailSongs) {
        const normalized = normalizeTrack(detail)
        if (normalized?.id) detailMap.set(String(normalized.id), normalized)
      }
    } catch (error) {
      console.warn('[Explore] 补全曲风歌曲详情失败，保留精简元数据:', error)
    }
  }

  return sourceTracks
    .map((source) => {
      const id = source?.id ?? source?.songId ?? source?.resourceId
      const detail = id != null ? detailMap.get(String(id)) : null
      if (detail) {
        return normalizeTrack({
          ...source,
          ...detail,
          ar: detail.ar?.length ? detail.ar : source?.ar ?? source?.artists,
          artists: detail.artists?.length ? detail.artists : source?.artists ?? source?.ar,
          al: detail.al?.picUrl ? detail.al : source?.al ?? source?.album,
          album: detail.album?.picUrl ? detail.album : source?.album ?? source?.al,
          publishTime: detail.publishTime ?? source?.publishTime,
          dt: detail.dt ?? source?.dt ?? source?.duration
        })
      }
      return normalizeTrack(source)
    })
    .filter(Boolean)
}

const selectStyle = async (tag: StyleTag) => {
  activeStyleId.value = tag.id
  tracks.value = []
  show.value = false
  tricklingProgress.start()

  try {
    const result = await styleSongs({ tagId: tag.id, size: 100 })
    const raw = findFirstArray(result, ['data.songs', 'data.list', 'songs', 'list', 'data'])
    tracks.value = await enrichStyleTracks(raw)
  } catch (error) {
    console.warn('[Explore] 加载曲风歌曲失败:', error)
    showToast(t('explore.styleLoadFailed'))
  } finally {
    tricklingProgress.done()
    show.value = true
  }
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
    name: mv?.name ?? mv?.mvName ?? mv?.title ?? 'MV',
    cover:
      mv?.cover ??
      mv?.mvCoverUrl ??
      mv?.coverUrl ??
      mv?.imgurl16v9 ??
      mv?.picUrl ??
      '',
    artistName: mv?.artistName ?? mv?.artist?.name ?? mv?.artists?.[0]?.name ?? '',
    artistId: mv?.artistId ?? mv?.artist?.id ?? mv?.artists?.[0]?.id ?? 0,
    duration: mv?.duration ?? mv?.durationMs ?? 0,
    playCount: mv?.playCount ?? 0,
    publishTime: mv?.publishTime ?? 0
  }
}

const dedupeTracksById = (items: any[]) => {
  const seen = new Set<string>()
  const result: any[] = []

  for (const item of items) {
    const normalized = normalizeTrack(item)
    const id = normalized?.id == null ? '' : String(normalized.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(normalized)
  }

  return result
}

const getFollowedArtistIds = async (): Promise<Set<string>> => {
  try {
    const result = await likedArtists({ limit: 1000 })
    const rows = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.artists)
        ? result.artists
        : Array.isArray(result?.data?.artists)
          ? result.data.artists
          : []

    return new Set<string>(
      rows
        .map((artist: any) => artist?.id ?? artist?.artistId)
        .filter((id: any) => id !== undefined && id !== null)
        .map((id: any) => String(id))
    )
  } catch (error) {
    console.warn('[Explore] 获取已关注歌手列表失败:', error)
    return new Set<string>()
  }
}

const getTrackArtistIds = (track: any) => {
  const artists = track?.ar ?? track?.artists ?? []
  if (!Array.isArray(artists)) return []
  return artists
    .map((artist: any) => artist?.id ?? artist?.artistId)
    .filter((id: any) => id !== undefined && id !== null)
    .map((id: any) => String(id))
}

const belongsToFollowedArtist = (
  track: any,
  followedArtistIds: Set<string>,
  blockArtistId?: number | string
) => {
  if (!followedArtistIds.size) return false

  if (blockArtistId !== undefined && blockArtistId !== null) {
    return followedArtistIds.has(String(blockArtistId))
  }

  return getTrackArtistIds(track).some((id) => followedArtistIds.has(id))
}

const isAccompanimentTitle = (title: string) =>
  /(伴奏|纯音乐|instrumental|off\s*vocal|karaoke|backing\s*track)/i.test(title)

const getCanonicalReleaseTitle = (title: string) =>
  title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(?:伴奏|纯音乐|instrumental|off\s*vocal|karaoke|backing\s*track)/gi, '')
    .replace(/[\s\-—–_()[\]{}（）【】《》〈〉「」『』·.，,。!！?？:：;'"]/g, '')

const dedupeFollowingReleaseSongs = (
  items: Array<{
    track: any
    artistKey: string
    publishTime: number
  }>
) => {
  const byTrackId = new Set<string>()
  const byRelease = new Map<string, { track: any; accompaniment: boolean }>()
  const order: string[] = []

  for (const item of items) {
    const normalized = normalizeTrack(item.track)
    const id = normalized?.id == null ? '' : String(normalized.id)
    if (!id || byTrackId.has(id)) continue
    byTrackId.add(id)

    const title = String(normalized?.name ?? '')
    const canonicalTitle = getCanonicalReleaseTitle(title)
    const dayKey =
      Number.isFinite(item.publishTime) && item.publishTime > 0
        ? new Date(item.publishTime).toISOString().slice(0, 10)
        : ''
    const releaseKey = `${item.artistKey}|${canonicalTitle}|${dayKey}`
    const accompaniment = isAccompanimentTitle(title)
    const current = byRelease.get(releaseKey)

    if (!current) {
      byRelease.set(releaseKey, { track: normalized, accompaniment })
      order.push(releaseKey)
      continue
    }

    // 同名同日的新作同时含原版与伴奏时，优先保留原版。
    if (current.accompaniment && !accompaniment) {
      byRelease.set(releaseKey, { track: normalized, accompaniment: false })
    }
  }

  return order.map((key) => byRelease.get(key)?.track).filter(Boolean)
}

/**
 * 精确解析新版关注歌手新发布接口。
 *
 * 只接收真实关注歌手对应的 song 区块，并在“作品”层去重。
 * album 区块内联的整张曲目表不会进入新歌列表。
 */
const parseFollowingReleaseSongs = (
  source: any,
  followedArtistIds: Set<string>
) => {
  const works = Array.isArray(source?.data?.newWorks) ? source.data.newWorks : []
  const candidates: Array<{ track: any; artistKey: string; publishTime: number }> = []

  for (const work of works) {
    const info = work?.info
    if (info?.blockType !== 'song') continue

    const firstTrack = Array.isArray(info?.songLists) ? info.songLists[0] : null
    if (!firstTrack) continue

    const blockArtistId = info?.blockTitle?.artistId
    if (!belongsToFollowedArtist(firstTrack, followedArtistIds, blockArtistId)) continue

    const followedIdsInTrack = getTrackArtistIds(firstTrack).filter((id) =>
      followedArtistIds.has(id)
    )
    const artistKey =
      blockArtistId !== undefined &&
      blockArtistId !== null &&
      followedArtistIds.has(String(blockArtistId))
        ? String(blockArtistId)
        : followedIdsInTrack.sort().join(',')

    const publishTime = Number(firstTrack?.publishTime ?? work?.publishTime ?? 0)
    candidates.push({
      track: {
        ...firstTrack,
        publishTime: publishTime || firstTrack?.publishTime
      },
      artistKey,
      publishTime
    })
  }

  return dedupeFollowingReleaseSongs(candidates)
}

const parseFollowingMvs = (source: any, followedArtistIds: Set<string>) => {
  const works = Array.isArray(source?.data?.newWorks) ? source.data.newWorks : []
  const seen = new Set<string>()
  const result: any[] = []

  for (const work of works) {
    const mv = normalizeMv(work)
    const id = mv?.id == null ? '' : String(mv.id)
    const artistId = mv?.artistId == null ? '' : String(mv.artistId)

    if (!id || !mv.cover || seen.has(id)) continue

    // 老 MV 接口有些条目只返回 artistName，没有 artistId。
    // 有 artistId 时严格校验关注关系；缺失时信任专用“关注歌手新 MV”接口本身。
    if (artistId && !followedArtistIds.has(artistId)) continue

    seen.add(id)
    result.push(mv)
  }

  return result
}

const filterFallbackTracksToFollowedArtists = (
  items: any[],
  followedArtistIds: Set<string>
) =>
  dedupeTracksById(items).filter((track) =>
    belongsToFollowedArtist(track, followedArtistIds)
  )

const getFollowingSongs = async (followedArtistIds: Set<string>) => {
  if (!followedArtistIds.size) return []

  try {
    const v2 = await followedArtistNewSongMvListV2({
      sourceType: 1,
      limit: 10,
      firstRequest: true
    })
    const exact = parseFollowingReleaseSongs(v2, followedArtistIds)
    if (exact.length) return exact
  } catch (error) {
    console.warn('[Explore] 新版关注歌手新歌接口失败，回退旧接口:', error)
  }

  const attempts: Array<() => Promise<any>> = [
    () => followedArtistNewSongs({ limit: 100 }),
    () => followedArtistNewSongsPlayAll()
  ]

  for (const attempt of attempts) {
    try {
      const result = await attempt()
      const parsed = filterFallbackTracksToFollowedArtists(
        extractTracks(result, 100),
        followedArtistIds
      )
      if (parsed.length) return parsed
    } catch (error) {
      console.warn('[Explore] 关注歌手新歌接口回退:', error)
    }
  }

  return []
}

const getFollowingMvs = async (followedArtistIds: Set<string>) => {
  if (!followedArtistIds.size) return []

  try {
    const result = await followedArtistNewMvs({ limit: 100 })
    return parseFollowingMvs(result, followedArtistIds)
  } catch (error) {
    console.warn('[Explore] 关注歌手新 MV 接口失败:', error)
    return []
  }
}

const getFollowingWorks = async () => {
  show.value = false
  followingLoading.value = true
  tricklingProgress.start()

  try {
    const followedArtistIds = await getFollowedArtistIds()

    if (followingMode.value === 'song') {
      tracks.value = await getFollowingSongs(followedArtistIds)
      followingMvs.value = []
    } else {
      followingMvs.value = await getFollowingMvs(followedArtistIds)
      tracks.value = []
    }
  } catch (error) {
    console.warn('[Explore] 加载关注歌手新作失败:', error)
    tracks.value = []
    followingMvs.value = []
  } finally {
    followingLoading.value = false
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
    return topPlaylist({
      cat: activeCategory.value,
      limit: PLAYLIST_PAGE_SIZE,
      offset: playlists.value.length
    }).then((data) => {
      const page = Array.isArray(data?.playlists) ? data.playlists : []
      const reportedTotal = Number(data?.total)
      if (Number.isFinite(reportedTotal) && reportedTotal > 0) {
        playlistInfo.total = reportedTotal
      }
      playlistInfo.lasttime = 0
      updatePlaylist(page)

      const moreByTotal =
        playlistInfo.total > 0
          ? playlists.value.length < playlistInfo.total
          : page.length >= PLAYLIST_PAGE_SIZE
      playlistInfo.more = data?.more === true || moreByTotal
    })
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
  followingLoading.value = false
  albumLoading.value = false
  newAlbumInfo.newAlbums.albums = []
  newAlbumInfo.newAlbums.total = 0
  newAlbumInfo.topAlbum.hasMore = true
  newAlbumInfo.topAlbum.weekData = []
  newAlbumInfo.topAlbum.monthData = []
  showList.value = []
  show.value = false
  playlistInfo.more = true
  playlistInfo.lasttime = 0
  artistInfo.more = true
  loadingMore.value = false
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
const EXPLORE_BOTTOM_PADDING = 120
watch(albumType, () => nextTick(() => updatePadding(EXPLORE_BOTTOM_PADDING)))

onBeforeRouteUpdate((to, _from, next) => {
  updatePadding(EXPLORE_BOTTOM_PADDING)
  resetViewData()
  syncRoute(to)
  void getPlaylist()
  next()
})

onMounted(() => {
  updatePadding(EXPLORE_BOTTOM_PADDING)
  resetViewData()
  loadData()
})

onBeforeUnmount(() => {
  updatePadding(EXPLORE_BOTTOM_PADDING)
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

.explore-filter-section {
  margin-bottom: 14px;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}

.playlist-filter-bar,
.area-filter-bar {
  padding: 10px 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-secondary-bg) 78%, transparent);
}

.compact-buttons {
  flex-wrap: nowrap;
}

.button {
  user-select: none;
  cursor: pointer;
  min-height: 38px;
  padding: 0 15px;
  margin: 0;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  font-weight: 650;
  font-size: 15px;
  line-height: 1;
  border-radius: 11px;
  background-color: var(--color-secondary-bg);
  color: color-mix(in srgb, var(--color-text) 68%, transparent);
  transition:
    background 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;

  &:hover {
    transform: translateY(-1px);
  }

  &:hover,
  &.active {
    background: color-mix(in srgb, var(--color-primary) 11%, var(--color-secondary-bg));
    color: var(--color-primary);
  }
}

.playlist-filter-bar .button,
.area-filter-bar .button {
  min-height: 36px;
  padding: 0 14px;
  font-size: 14px;
}

.album-type-filter-bar {
  align-self: center;
  justify-content: flex-end;

  .button {
    min-height: 34px;
    padding: 0 12px;
    font-size: 14px;
  }
}

.style-buttons .button {
  min-height: 34px;
  font-size: 14px;
  padding: 0 12px;
}

.preferred-dot {
  color: var(--color-primary);
  font-size: 8px;
}

.panel {
  margin-top: 10px;
  background: var(--color-secondary-bg);
  border-radius: 16px;
  padding: 14px 16px;
  color: var(--color-text);

  .big-cat {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: start;
    gap: 10px 14px;
    margin-bottom: 12px;
  }

  .big-cat:last-child {
    margin-bottom: 0;
  }

  .name {
    min-width: 0;
    height: auto;
    margin: 0;
    padding-top: 7px;
    font-size: 15px;
    line-height: 1.25;
    font-weight: 750;
    opacity: 0.62;
  }

  .cats {
    min-width: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }

  .cat {
    user-select: none;
    margin: 0;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    font-weight: 550;
    font-size: 14px;
    transition: 0.16s ease;

    span {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      min-height: 32px;
      padding: 0 10px;
      border-radius: 9px;
      opacity: 0.82;
      transition:
        background 0.16s ease,
        color 0.16s ease,
        opacity 0.16s ease;

      &:hover {
        opacity: 1;
        background: color-mix(in srgb, var(--color-primary) 9%, transparent);
        color: var(--color-primary);
      }
    }
  }

  .cat.active span {
    opacity: 1;
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }
}

.playlist-category-panel {
  margin-top: 8px;
}

.artist-filter-panel {
  margin-top: 0;
  padding: 14px 18px;
  background: color-mix(in srgb, var(--color-secondary-bg) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-text) 7%, transparent);

  .big-cat {
    grid-template-columns: 64px minmax(0, 1fr);
  }

  .artist-alpha-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(42px, 1fr));
    gap: 6px;
  }

  .artist-alpha-row .cat {
    width: 100%;
  }

  .artist-alpha-row .cat span {
    width: 100%;
    box-sizing: border-box;
    padding: 0 6px;
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
  margin-top: 16px;
}

.following-loading {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text);
  font-size: 14px;
  opacity: 0.62;
}

.following-loading-spinner {
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  border: 2px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: explore-following-spin 0.75s linear infinite;
}

@keyframes explore-following-spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  padding: 80px 0;
  text-align: center;
  opacity: 0.5;
  font-size: 15px;
}

.load-more-state {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--color-text);
  font-size: 13px;
  opacity: 0.58;
}

.load-more-spinner {
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border: 2px solid color-mix(in srgb, var(--color-text), transparent 84%);
  border-top-color: color-mix(in srgb, var(--color-text), transparent 32%);
  border-radius: 50%;
  animation: explore-load-more-spin 0.8s linear infinite;
}

@keyframes explore-load-more-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .albumsTab {
    flex-wrap: wrap;
  }

  .artist-filter-panel .big-cat,
  .playlist-category-panel .big-cat {
    grid-template-columns: 58px minmax(0, 1fr);
  }

  .artist-filter-panel .artist-alpha-row {
    grid-template-columns: repeat(auto-fit, minmax(38px, 1fr));
  }
}

@media (max-width: 640px) {
  .playlist-filter-bar,
  .area-filter-bar,
  .panel {
    padding: 10px;
    border-radius: 13px;
  }

  .buttons {
    gap: 7px;
  }

  .button,
  .playlist-filter-bar .button,
  .area-filter-bar .button {
    min-height: 34px;
    padding: 0 12px;
    font-size: 13px;
  }

  .artist-filter-panel .big-cat,
  .playlist-category-panel .big-cat {
    grid-template-columns: 1fr;
    gap: 4px;
    margin-bottom: 10px;
  }

  .panel .name {
    padding-top: 0;
    font-size: 13px;
  }

  .panel .cats {
    gap: 5px 6px;
  }

  .artist-filter-panel .artist-alpha-row {
    grid-template-columns: repeat(auto-fit, minmax(34px, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .load-more-spinner,
  .following-loading-spinner {
    animation: none;
  }
}

.button.more .svg-icon {
  height: 24px;
  width: 24px;
}
</style>
