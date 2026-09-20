<template>
  <div v-show="show" class="library">
    <div class="section-one">
      <div class="liked-songs" @click="goToLikedSongsList">
        <div class="title"
          >{{ $t('library.likedSongs') }} - {{ libraryData.songs.length
          }}{{ $t('common.songs') }}</div
        >
        <div class="top">
          <p>
            <span
              v-for="(line, index) in pickedLyricLines"
              v-show="line !== ''"
              :key="`${line}${index}`"
              >{{ line }}<br
            /></span>
          </p>
        </div>
        <div class="bottom">
          <div class="titles">
            <div v-show="randomtrack?.ar[0].name" class="title">{{
              `${randomtrack?.ar[0].name} -- ${randomtrack?.name}`
            }}</div>
          </div>
        </div>
      </div>
      <div class="songs">
        <div class="liked-preview-grid">
          <div
            v-for="track in likedSongsPreview"
            :key="track.id || track.songId"
            class="liked-preview-item"
            @dblclick="playLikedPreviewTrack(track.id || track.songId)"
          >
            <img
              class="liked-preview-cover"
              :src="getLikedPreviewImage(track)"
              loading="lazy"
              decoding="async"
            />
            <div class="liked-preview-text">
              <div class="liked-preview-title" :title="track.name">{{ track.name }}</div>
              <div class="liked-preview-artist" :title="getLikedPreviewArtist(track)">{{
                getLikedPreviewArtist(track)
              }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section-two">
      <div
        ref="tabsRowRef"
        class="tabs-row"
        :style="{
          height: (hasCustomTitleBar ? 84 : 64) + 'px',
          paddingTop: (hasCustomTitleBar ? 20 : 0) + 'px'
        }"
      >
        <div class="tabs">
          <div
            class="tab dropdown"
            :class="{ active: currentTab === 'playlist' }"
            @click="updateCurrentTab('playlist')"
          >
            <span class="text">{{
              {
                all: $t('contextMenu.allPlaylists'),
                mine: $t('contextMenu.minePlaylists'),
                liked: $t('contextMenu.likedPlaylists')
              }[playlistFilter]
            }}</span>
            <span class="icon" @click.stop="openPlaylistTabMenu"
              ><svg-icon icon-class="dropdown"
            /></span>
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'album' }"
            @click="updateCurrentTab('album')"
          >
            {{ $t('library.albums') }}
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'artist' }"
            @click="updateCurrentTab('artist')"
          >
            {{ $t('library.artists') }}
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'mvs' }"
            @click="updateCurrentTab('mvs')"
          >
            {{ $t('library.mvs') }}
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'cloudDisk' }"
            @click="updateCurrentTab('cloudDisk')"
          >
            {{ $t('library.cloudDisk') }}
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'playHistory' }"
            @click="updateCurrentTab('playHistory')"
          >
            {{ $t('library.playHistory.title') }}
          </div>
        </div>
        <button v-show="currentTab === 'playlist'" class="tab-button" @click="openAddPlaylistModal"
          ><svg-icon icon-class="plus" />{{ $t('library.playlist.newPlaylist') }}
        </button>
      </div>

      <div class="section-two-content" :style="tabStyle">
        <div v-if="currentTab === 'playlist'">
          <CoverRow
            :items="filterPlaylists"
            type="playlist"
            sub-text="creator"
            :colunm-number="5"
            class="library-cover-row"
            :min-cover-physical-width="112"
            :enable-virtual-scroll="false"
            :is-end="true"
            :padding-bottom="96"
          />
        </div>

        <div v-if="currentTab === 'album'">
          <CoverRow
            :items="libraryData.albums"
            type="album"
            sub-text="artist"
            :colunm-number="5"
            class="library-cover-row"
            :min-cover-physical-width="112"
            :enable-virtual-scroll="false"
            :is-end="true"
            :padding-bottom="96"
          />
        </div>

        <div v-if="currentTab === 'mvs'">
          <Mvrow :mvs="libraryData.mvs" :is-end="true" />
        </div>

        <div v-if="currentTab === 'artist'">
          <CoverRow
            :items="libraryData.artists"
            type="artist"
            sub-text="artist"
            :item-height="230"
            :colunm-number="5"
            class="library-cover-row"
            :min-cover-physical-width="112"
            :enable-virtual-scroll="false"
            :is-end="true"
            :padding-bottom="96"
          />
        </div>

        <div v-if="currentTab === 'cloudDisk'">
          <TrackList
            :id="-8"
            :items="libraryData.cloudDisk"
            :colunm-number="1"
            type="cloudDisk"
            :is-end="true"
          />
        </div>

        <div v-if="currentTab === 'playHistory'">
          <button
            :class="{
              'playHistory-button': true,
              'playHistory-button--selected': playHistoryMode === 'week'
            }"
            @click="playHistoryMode = 'week'"
          >
            {{ $t('library.playHistory.week') }}
          </button>
          <button
            :class="{
              'playHistory-button': true,
              'playHistory-button--selected': playHistoryMode === 'all'
            }"
            @click="playHistoryMode = 'all'"
          >
            {{ $t('library.playHistory.all') }}
          </button>
          <TrackList
            :items="playHistoryList"
            :colunm-number="1"
            :height="historyHeight"
            :item-height="60"
            type="tracklist"
            :is-end="true"
          />
        </div>
      </div>
    </div>

    <ContextMenu ref="playlistTabMenu">
      <div
        class="item"
        :class="{ active: libraryPlaylistFilter === 'all' }"
        @click="changePlaylistFilter('all')"
        >{{ $t('contextMenu.allPlaylists') }}</div
      >
      <hr />
      <div
        class="item"
        :class="{ active: libraryPlaylistFilter === 'mine' }"
        @click="changePlaylistFilter('mine')"
        >{{ $t('contextMenu.minePlaylists') }}</div
      >
      <div
        class="item"
        :class="{ active: libraryPlaylistFilter === 'liked' }"
        @click="changePlaylistFilter('liked')"
        >{{ $t('contextMenu.likedPlaylists') }}</div
      >
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useDataStore } from '../store/data'
import { useNormalStateStore } from '../store/state'
import { ref, computed, onMounted, onUnmounted, inject, nextTick } from 'vue'
import { dailyTask, randomNum, pickedLyric } from '../utils'
import { markPlaybackEndReason } from '../utils/playbackFeedback'
import { tricklingProgress } from '../utils/tricklingProgress'
import { getTrackDetail } from '../api/track'
import SvgIcon from '../components/SvgIcon.vue'
import TrackList from '../components/VirtualTrackList.vue'
import CoverRow from '../components/VirtualCoverRow.vue'
import Mvrow from '../components/MvRow.vue'
import ContextMenu from '../components/ContextMenu.vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../store/player'
import { lyricLine } from '@/types/music'

const dataStore = useDataStore()
const { liked, libraryPlaylistFilter, user } = storeToRefs(dataStore)

const { newPlaylistModal } = storeToRefs(useNormalStateStore())

const show = ref(false)
const playHistoryMode = ref('week')
const router = useRouter()
const playerStore = usePlayerStore()
const { replacePlaylist } = playerStore

const lyric = ref<{ content: string }[]>([])
const randomtrack = ref<{ [key: string]: any }>()
const currentTab = ref('playlist')
const playlistTabMenu = ref<InstanceType<typeof ContextMenu>>()
const tabsRowRef = ref()

const libraryData = computed(() => {
  const value = liked.value
  return {
    songs: Array.isArray(value?.songs) ? value.songs : [],
    songsWithDetails: Array.isArray(value?.songsWithDetails) ? value.songsWithDetails : [],
    playlists: Array.isArray(value?.playlists) ? value.playlists : [],
    albums: Array.isArray(value?.albums) ? value.albums : [],
    artists: Array.isArray(value?.artists) ? value.artists : [],
    mvs: Array.isArray(value?.mvs) ? value.mvs : [],
    cloudDisk: Array.isArray(value?.cloudDisk) ? value.cloudDisk : [],
    playHistory: {
      weekData: Array.isArray(value?.playHistory?.weekData) ? value.playHistory.weekData : [],
      allData: Array.isArray(value?.playHistory?.allData) ? value.playHistory.allData : []
    }
  }
})

/*
 * 顶部喜欢歌曲预览使用普通 CSS Grid，而不是 VirtualTrackList。
 * 这里的数据量固定最多 8 首，不需要虚拟滚动；让内容进入正常文档流后，高度由实际
 * 字体、缩放和封面尺寸决定，避免固定 itemHeight / containerHeight 再次裁掉第四行。
 */
const likedSongsPreview = computed(() => libraryData.value.songsWithDetails.slice(0, 8))

const getLikedPreviewImage = (track: any) => {
  const rawUrl = track.al?.picUrl || track.album?.picUrl || track.picUrl
  if (!rawUrl) return 'atom://get-default-pic'
  const url = rawUrl.startsWith('http:') ? rawUrl.replace('http:', 'https:') : rawUrl
  return `${url}${url.includes('?') ? '&' : '?'}param=64y64`
}

const getLikedPreviewArtist = (track: any) => {
  const artists = track.ar || track.artists || []
  const names = artists.map((artist: any) => artist?.name).filter(Boolean)
  return names.length ? names.join(' / ') : '未知歌手'
}

const playLikedPreviewTrack = (trackId: number) => {
  const trackIDs = likedSongsPreview.value
    .map((track: any) => Number(track.id || track.songId))
    .filter((id: number) => Number.isFinite(id) && id > 0)
  const index = trackIDs.indexOf(Number(trackId))
  if (index < 0) return

  markPlaybackEndReason('manual-select')
  replacePlaylist(
    'tracklist',
    libraryData.value.playlists.length > 0 ? libraryData.value.playlists[0].id : 0,
    trackIDs,
    index
  )
}

const hasCustomTitleBar = inject('hasCustomTitleBar', ref(true))

const isMac = computed(() => window.env?.isMac)

const tabStyle = computed(() => {
  const marginTop = hasCustomTitleBar.value ? 20 : 0
  return {
    marginTop: `${marginTop}px`
  }
})

const pickedLyricLines = computed(() => {
  const randomLines = pickedLyric(lyric.value)
  return randomLines
})

const winHeight = ref(window.innerHeight)

const historyHeight = computed(() => {
  const height = winHeight.value - 42 - (hasCustomTitleBar.value ? 84 : 64)
  return height
})

const playlistFilter = computed(() => {
  return libraryPlaylistFilter.value || 'all'
})

const filterPlaylists = computed(() => {
  const playlists = libraryData.value.playlists.slice(1)
  const userId = user.value.userId
  if (playlistFilter.value === 'mine') {
    return playlists.filter((p) => p.creator.userId === userId)
  } else if (playlistFilter.value === 'liked') {
    return playlists.filter((p) => p.creator.userId !== userId)
  }
  return playlists
})

const playHistoryList = computed(() => {
  if (show.value && playHistoryMode.value === 'week') {
    return libraryData.value.playHistory.weekData
  } else if (show.value && playHistoryMode.value === 'all') {
    return libraryData.value.playHistory.allData
  }
  return []
})

const {
  fetchLikedSongs,
  fetchLikedPlaylist,
  fetchLikedSongsWithDetails,
  fetchLikedAlbums,
  fetchLikedArtists,
  fetchLikedMVs,
  fetchCloudDisk,
  fetchPlayHistory
} = dataStore

const loadData = async () => {
  if (libraryData.value.songsWithDetails.length > 0) {
    tricklingProgress.done()
    show.value = true
    fetchLikedSongsWithDetails()
    getRandomLyric()
    fetchLikedSongs()
    fetchLikedPlaylist()
  } else {
    await fetchLikedSongs()
    await fetchLikedPlaylist()
    fetchLikedSongsWithDetails().then(() => {
      tricklingProgress.done()
      show.value = true
      getRandomLyric()
    })
  }

  void Promise.allSettled([
    Promise.resolve().then(() => fetchLikedAlbums()),
    Promise.resolve().then(() => fetchLikedArtists()),
    Promise.resolve().then(() => fetchLikedMVs()),
    Promise.resolve().then(() => fetchPlayHistory()),
    Promise.resolve().then(() => fetchCloudDisk())
  ])
}

const getRandomLyric = async () => {
  if (libraryData.value.songs.length === 0) return

  let i = 0
  let data: lyricLine[]
  let randomId: number
  while (i < libraryData.value.songs.length) {
    randomId = libraryData.value.songs[randomNum(0, libraryData.value.songs.length - 1)]
    data = await fetch(`atom://local-asset?type=lyric&id=${randomId}`).then((res) => res.json())
    const isInstrumental = data.map((l) => l.lyric.text).filter((l) => l.includes('纯音乐，请欣赏'))
    if (data.length && !isInstrumental.length) {
      lyric.value = data.map((l) => ({ content: l.lyric.text }))
      getTrackDetail(randomId.toString()).then((data) => {
        randomtrack.value = data.songs[0]
      })
      break
    }
    i++
  }
}

const goToLikedSongsList = () => {
  router.push({ path: '/library/liked-songs' })
}

const updatePadding = inject('updatePadding') as (padding: number) => void

const openAddPlaylistModal = () => {
  newPlaylistModal.value = {
    type: 'online',
    afterCreateAddTrackID: [],
    show: true
  }
}

const updateCurrentTab = (tab: string) => {
  currentTab.value = tab
  nextTick(() => {
    updatePadding(0)
  })
}

const openPlaylistTabMenu = (e: MouseEvent) => {
  playlistTabMenu.value?.openMenu(e)
}

const changePlaylistFilter = (type: string) => {
  libraryPlaylistFilter.value = type
}

const observeTab = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const intersectionRatio = entry.intersectionRatio
      const maxPadding = 42
      const maxPaddingRight = 224
      if (intersectionRatio > 0) {
        if (isMac.value) {
          const paddingLeft = maxPadding * (1 - intersectionRatio)
          tabsRowRef.value.style.paddingLeft = `${paddingLeft}px`
        }
        const paddingRight = maxPaddingRight * (1 - intersectionRatio)
        tabsRowRef.value.style.width = `calc(100% - ${paddingRight}px)`
      } else {
        if (isMac.value) {
          tabsRowRef.value.style.paddingLeft = `${maxPadding}px`
        }
        tabsRowRef.value.style.width = `calc(100% - ${maxPaddingRight}px)`
      }
    })
  },
  {
    root: null,
    rootMargin: `-${hasCustomTitleBar.value ? 84 : 64}px 0px 0px 0px`,
    threshold: Array.from({ length: 100 }, (v, i) => i / 100)
  }
)

const handleResize = () => {
  winHeight.value = window.innerHeight
  if (tabsRowRef.value) {
    observeTab.unobserve(tabsRowRef.value)
  }
  observeTab.disconnect()
  if (tabsRowRef.value) observeTab.observe(tabsRowRef.value)
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  if (tabsRowRef.value) {
    observeTab.observe(tabsRowRef.value)
  }
  setTimeout(() => {
    if (!show.value) tricklingProgress.start()
  }, 1000)
  void loadData().catch((error) => {
    console.error('[Library] 加载音乐库失败:', error)
    tricklingProgress.done()
    show.value = true
  })
  dailyTask()
  setTimeout(() => {
    updatePadding(0)
  }, 100)
})
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  observeTab.disconnect()
  updatePadding(96)
})
</script>

<style scoped lang="scss">
.section-one {
  display: grid;
  grid-template-columns: minmax(280px, 3.2fr) minmax(0, 7fr);
  gap: 20px;
  align-items: stretch;
  margin-top: 24px;

  .liked-songs {
    min-width: 0;
    cursor: pointer;
    border-radius: 16px;
    padding: 20px 24px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    transition: all 0.4s;
    background: color-mix(in oklab, var(--color-primary) var(--bg-alpha), white);

    .title {
      font-size: 20px;
      font-weight: 700;
      margin: 14px 0 10px 0;
      color: var(--color-primary);
    }

    .sub-title {
      font-size: 15px;
      margin-top: 2px;
    }

    .top {
      flex: 1;
      min-height: 0;
      font-size: 16px;
      line-height: 1.35;
      opacity: 0.88;
      color: var(--color-primary);

      p {
        margin: 2px 0 12px;
        overflow: visible;
      }
    }

    .bottom {
      display: flex;
      align-items: flex-end;
      color: var(--color-primary);
      margin-top: auto;

      .titles {
        width: 100%;
        min-width: 0;

        .title {
          font-size: 16px;
          font-weight: 700;
          margin: 8px 0 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
    }
  }

  .songs {
    min-width: 0;
  }

  .liked-preview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 20px;
    align-content: start;
    width: 100%;
  }

  .liked-preview-item {
    min-width: 0;
    min-height: 64px;
    padding: 8px 10px;
    box-sizing: border-box;
    border-radius: 12px;
    display: flex;
    align-items: center;
    user-select: none;
    transition: background-color 0.2s;

    &:hover {
      background: var(--color-secondary-bg);
    }
  }

  .liked-preview-cover {
    width: 46px;
    height: 46px;
    flex: 0 0 46px;
    margin-right: 20px;
    border-radius: 8px;
    border: 1px solid rgba(0, 0, 0, 0.04);
    box-sizing: border-box;
    object-fit: cover;
  }

  .liked-preview-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .liked-preview-title {
    min-width: 0;
    font-size: 16px !important;
    line-height: 20px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .liked-preview-artist {
    min-width: 0;
    margin-top: 2px;
    font-size: 13px !important;
    line-height: 18px;
    opacity: 0.68;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.section-two {
  position: relative;
  margin-top: 20px;
  padding-top: 64px;

  .tabs-row {
    position: absolute;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    width: 100%;
    box-sizing: border-box;
    z-index: 10;

    .tabs {
      display: flex;
      flex-wrap: wrap;
      font-size: 18px;
      color: var(--color-text);
      -webkit-app-region: no-drag;
      .tab {
        font-weight: 600;
        padding: 8px 14px;
        margin-right: 14px;
        border-radius: 8px;
        cursor: pointer;
        user-select: none;
        transition: 0.2s;
        opacity: 0.68;
        &:hover {
          opacity: 0.88;
          background-color: var(--color-secondary-bg);
        }
      }
      .tab.active {
        opacity: 0.88;
        background-color: var(--color-secondary-bg);
      }
      .tab.dropdown {
        display: flex;
        align-items: center;
        padding: 0;
        overflow: hidden;
        .text {
          padding: 8px 3px 8px 14px;
        }
        .icon {
          height: 100%;
          display: flex;
          align-items: center;
          padding: 0 8px 0 3px;
          .svg-icon {
            height: 16px;
            width: 16px;
          }
        }
      }
    }
  }
}

button.playHistory-button {
  color: var(--color-text);
  border-radius: 8px;
  padding: 6px 8px;
  margin: 2px 4px 10px 0;
  transition: 0.2s;
  opacity: 0.68;
  font-weight: 500;
  cursor: pointer;
  &:hover {
    opacity: 1;
    background: var(--color-secondary-bg);
  }
  &:active {
    transform: scale(0.95);
  }
}

button.playHistory-button--selected {
  color: var(--color-text);
  background: var(--color-secondary-bg);
  opacity: 1;
  font-weight: 700;
  &:active {
    transform: none;
  }
}

button.tab-button {
  color: var(--color-text);
  border-radius: 8px;
  padding: 8px 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: 0.2s;
  opacity: 0.68;
  font-weight: 500;
  font-size: 14px;
  -webkit-app-region: no-drag;
  .svg-icon {
    width: 14px;
    height: 14px;
    margin-right: 8px;
  }
  &:hover {
    opacity: 1;
    background: var(--color-secondary-bg);
  }
  &:active {
    opacity: 1;
    transform: scale(0.92);
  }
}
</style>
