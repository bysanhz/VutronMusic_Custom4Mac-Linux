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

      <div v-show="showCatOptions" class="panel">
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

    <div v-if="exploreTab === 'artist'">
      <div class="panel" style="background-color: unset">
        <div
          v-for="bigCat in artistBigCats"
          :key="bigCat"
          class="big-cat"
          style="margin-bottom: 10px"
        >
          <div class="name">{{ categoryLabel(bigCat) }}</div>
          <div class="cats">
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

    <div v-if="exploreTab === 'newTrack'">
      <div class="buttons">
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

    <div v-if="exploreTab === 'newAlbum'" class="albumsTab">
      <div class="buttons">
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
      <div class="buttons">
        <div
          v-for="(itemType, index) in albumTypeBtn"
          :key="index"
          class="button"
          :class="{ active: itemType === albumType }"
          :style="{ backgroundColor: 'unset', margin: '10px 0 6px 0' }"
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
      <TrackList id="11" :items="tracks" :colunm-number="1" type="playlist" :is-end="true" />
    </div>

    <div v-else-if="exploreTab === 'newAlbum'" class="playlists">
      <div v-if="albumType === '热门' && newAlbumInfo.topAlbum.weekData.length !== 0">
        <div :style="{ margin: '20px 0', fontSize: '20px', fontWeight: '600' }">{{
          t('explore.weekNewAlbums')
        }}</div>
        <CoverRow
          v-if="show"
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
        />
      </div>
      <div>
        <div :style="{ margin: '20px 0', fontSize: '20px', fontWeight: '600' }">{{
          t('explore.monthNewAlbums')
        }}</div>
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
      <TrackList
        v-if="show && followingMode === 'song' && tracks.length"
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
    limit: PLAYLIST_PAGE_SIZE,
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
    name: mv?.name ?? mv?.title ?? 'MV',
    cover: mv?.cover ?? mv?.coverUrl ?? mv?.imgurl16v9 ?? mv?.picUrl ?? '',
    artistName: mv?.artistName ?? mv?.artist?.name ?? mv?.artists?.[0]?.name ?? '',
    artistId: mv?.artistId ?? mv?.artist?.id ?? mv?.artists?.[0]?.id ?? 0
  }
}

const collectFollowingMvs = (source: any, limit = 100) => {
  const result: any[] = []
  const seenObjects = new Set<any>()
  const seenIds = new Set<string>()

  const visit = (value: any, depth = 0) => {
    if (value == null || depth > 8 || result.length >= limit) return
    if (typeof value !== 'object') return
    if (seenObjects.has(value)) return
    seenObjects.add(value)

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1)
        if (result.length >= limit) break
      }
      return
    }

    const candidate = normalizeMv(value)
    const id = candidate?.id == null ? '' : String(candidate.id)
    const hasMvShape =
      Boolean(id) &&
      Boolean(candidate.cover) &&
      (value?.mv !== undefined ||
        value?.mvId !== undefined ||
        value?.vid !== undefined ||
        value?.resource?.mv !== undefined ||
        value?.cover !== undefined ||
        value?.coverUrl !== undefined ||
        value?.imgurl16v9 !== undefined)

    if (hasMvShape && !seenIds.has(id)) {
      seenIds.add(id)
      result.push(candidate)
      if (result.length >= limit) return
    }

    for (const nested of Object.values(value)) {
      visit(nested, depth + 1)
      if (result.length >= limit) break
    }
  }

  visit(source)
  return result
}

const getFollowingSongs = async () => {
  const attempts: Array<() => Promise<any>> = [
    () =>
      followedArtistNewSongMvListV2({
        sourceType: 1,
        limit: 100,
        firstRequest: true
      }),
    () => followedArtistNewSongs({ limit: 100 }),
    () => followedArtistNewSongsPlayAll()
  ]

  for (const attempt of attempts) {
    try {
      const result = await attempt()
      const parsed = extractTracks(result, 100)
      if (parsed.length) return parsed
    } catch (error) {
      console.warn('[Explore] 关注歌手新歌接口回退:', error)
    }
  }

  return []
}

const getFollowingWorks = async () => {
  show.value = false
  tricklingProgress.start()

  try {
    if (followingMode.value === 'song') {
      tracks.value = await getFollowingSongs()
      followingMvs.value = []
    } else {
      const result = await followedArtistNewMvs({ limit: 100 })
      followingMvs.value = collectFollowingMvs(result, 100)
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

@media (prefers-reduced-motion: reduce) {
  .load-more-spinner {
    animation: none;
  }
}

.button.more .svg-icon {
  height: 24px;
  width: 24px;
}
</style>
