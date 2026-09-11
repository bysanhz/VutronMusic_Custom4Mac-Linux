<template>
  <div v-show="show" class="search-page">
    <div class="info">
      <span class="title">{{ keywords }}</span>
      <span class="sub-title">找到 {{ result[`${searchTab}Count`] }} {{ tagMap[searchTab] }}</span>
    </div>
    <div v-if="searchTab === 'track'" class="container">
      <TrackList
        :items="result[searchTab]"
        :colunm-number="1"
        :load-more="() => loadData(keywords, searchTab)"
        :type="'playlist'"
        :is-end="true"
      />
    </div>
    <div v-else-if="searchTab === 'lyric'" class="container">
      <TrackList
        :items="result[searchTab]"
        :colunm-number="1"
        :item-height="152.5"
        :is-lyric="true"
        :load-more="() => loadData(keywords, searchTab)"
        :type="'playlist'"
        :is-end="true"
      />
    </div>
    <div v-else class="container">
      <CoverRow
        :items="result[searchTab]"
        :type="searchTab"
        :item-height="260"
        :colunm-number="5"
        :sub-text="'artist'"
        :load-more="() => loadData(keywords, searchTab)"
        :is-end="true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, watch, inject, nextTick, onBeforeUnmount } from 'vue'
import { cloudSearch } from '../api/discovery'
import { getTrackDetail } from '../api/track'
import { useNormalStateStore } from '../store/state'
import { useRoute, onBeforeRouteUpdate } from 'vue-router'
import { storeToRefs } from 'pinia'
import TrackList from '../components/VirtualTrackList.vue'
import CoverRow from '../components/VirtualCoverRow.vue'

const show = ref(false)
const keywords = ref('')
const hasMore = ref(true)
const tagMap = {
  track: '首歌曲',
  album: '张专辑',
  artist: '位歌手',
  playlist: '个歌单',
  user: '位用户',
  lyric: '个歌词'
}
const result = reactive<{ [key: string]: any }>({
  track: [],
  trackCount: 0,
  album: [],
  albumCount: 0,
  artist: [],
  artistCount: 0,
  playlist: [],
  playlistCount: 0,
  user: [],
  userCount: 0,
  lyric: [],
  lyricCount: 0
})

const { searchTab } = storeToRefs(useNormalStateStore())
const route = useRoute()

const searchType = {
  track: 1,
  album: 10,
  artist: 100,
  playlist: 1000,
  user: 1002,
  lyric: 1006
}

const handleResult = (res: any) => {
  const searchResult = res?.result ?? {}
  switch (searchTab.value) {
    case 'track': {
      const songs = Array.isArray(searchResult.songs) ? searchResult.songs : []
      hasMore.value = Boolean(searchResult.hasMore)
      result.trackCount = searchResult.songCount || result.trackCount
      const ids = songs.map((item: any) => item.id).filter(Boolean)
      if (ids.length === 0) {
        show.value = true
        return
      }
      getTrackDetail(ids.join(',')).then((detail) => {
        result.track.push(...(detail?.songs ?? []))
        show.value = true
      })
      return
    }
    case 'album':
      result.album.push(...(searchResult.albums ?? []))
      result.albumCount = searchResult.albumCount || result.albumCount
      break
    case 'artist':
      result.artist.push(...(searchResult.artists ?? []))
      result.artistCount = searchResult.artistCount || result.artistCount
      break
    case 'playlist':
      result.playlist.push(...(searchResult.playlists ?? []))
      result.playlistCount = searchResult.playlistCount || result.playlistCount
      break
    case 'user': {
      const users = Array.isArray(searchResult.userprofiles) ? searchResult.userprofiles : []
      result.user.push(
        ...users.map((item: any) => ({
          id: item.userId,
          name: item.nickname,
          avatarUrl: item.avatarUrl,
          ...item
        }))
      )
      result.userCount = searchResult.userprofileCount || result.userCount
      break
    }
    case 'lyric':
      result.lyric.push(...(searchResult.songs ?? []))
      result.lyricCount = searchResult.songCount || result.lyricCount
      break
    default:
      break
  }
  show.value = true
}

const loadData = (keyword: string, tab: string) => {
  if (!keyword) return
  if (result[tab + 'Count'] > 0 && result[tab].length >= result[tab + 'Count']) return
  cloudSearch({
    keywords: keyword,
    type: searchType[tab],
    limit: 50,
    offset: result[tab].length
  }).then(handleResult)
}

const clearResult = () => {
  for (const key of ['track', 'album', 'artist', 'playlist', 'user', 'lyric']) {
    result[key] = []
    result[`${key}Count`] = 0
  }
  show.value = false
}

const updatePadding = inject('updatePadding') as (value: number) => void

watch(searchTab, (value) => {
  if (!keywords.value || result[value].length > 0) return
  loadData(keywords.value, value)
  nextTick(() => updatePadding(0))
})

onBeforeRouteUpdate((to, _from, next) => {
  clearResult()
  keywords.value = to.query.keywords as string
  if (keywords.value) loadData(keywords.value, searchTab.value)
  next()
})

onMounted(() => {
  updatePadding(0)
  const newWord = route.query.keywords as string
  if (!newWord || newWord === keywords.value) return
  clearResult()
  keywords.value = newWord
  loadData(keywords.value, searchTab.value)
})

onBeforeUnmount(() => {
  updatePadding(96)
})
</script>

<style scoped lang="scss">
.info {
  display: -webkit-box;
  .title {
    font-size: 30px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    -webkit-box-orient: vertical;
  }
  .sub-title {
    margin-left: 14px;
    opacity: 0.7;
  }
}
.container {
  margin-top: 20px;
}
</style>
