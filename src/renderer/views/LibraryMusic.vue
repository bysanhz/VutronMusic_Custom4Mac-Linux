<template>
  <div v-show="show" class="library">
    <div class="section-one">
      <div class="liked-songs">
        <div
          class="title liked-songs-link"
          role="button"
          tabindex="0"
          @click="goToLikedSongsList"
          @keydown.enter="goToLikedSongsList"
        >
          {{ $t('library.likedSongs') }} - {{ libraryData.songs.length }}{{ $t('common.songs') }}
        </div>
        <div
          class="lyric-preview-action"
          :class="{ disabled: !randomtrack?.id }"
          role="button"
          :tabindex="randomtrack?.id ? 0 : -1"
          :aria-label="
            randomtrack?.name
              ? t('library.playTrack', { name: randomtrack.name })
              : t('library.lyricTrackLoading')
          "
          @click="playRandomLyricTrack"
          @keydown.enter="playRandomLyricTrack"
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
            <span v-show="randomtrack?.id" class="lyric-play-hint" aria-hidden="true">
              <SvgIcon icon-class="play" />
            </span>
          </div>
        </div>
      </div>
      <div class="songs">
        <div class="liked-preview-list">
          <div
            v-for="(row, rowIndex) in likedPreviewRows"
            :key="`liked-preview-row-${rowIndex}`"
            class="liked-preview-row"
          >
            <div
              v-for="track in row"
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
    </div>

    <div class="section-two">
      <div
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
            <span class="tab-label">{{
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
            :colunm-number="4"
            class="library-cover-row"
            :min-cover-physical-width="112"
            :fixed-column-number="true"
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
            :colunm-number="4"
            class="library-cover-row"
            :min-cover-physical-width="112"
            :fixed-column-number="true"
            :enable-virtual-scroll="false"
            :is-end="true"
            :padding-bottom="96"
          />
        </div>

        <div v-if="currentTab === 'mvs'">
          <Mvrow
            :mvs="libraryData.mvs"
            :is-end="true"
            :column-number="4"
            :item-size="220"
            :gap="20"
            :padding-bottom="96"
            :enable-virtual-scroll="false"
          />
        </div>

        <div v-if="currentTab === 'artist'">
          <CoverRow
            :items="libraryData.artists"
            type="artist"
            sub-text="artist"
            :item-height="230"
            :colunm-number="4"
            class="library-cover-row"
            :min-cover-physical-width="112"
            :fixed-column-number="true"
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
            :enable-virtual-scroll="false"
            :padding-bottom="96"
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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const dataStore = useDataStore()
const { liked, libraryPlaylistFilter, user, likedSongPlaylistID } = storeToRefs(dataStore)

const { newPlaylistModal } = storeToRefs(useNormalStateStore())

const show = ref(false)
const router = useRouter()
const playerStore = usePlayerStore()
const { replacePlaylist } = playerStore

const lyric = ref<{ content: string }[]>([])
const randomtrack = ref<{ [key: string]: any }>()
const currentTab = ref('playlist')
const playlistTabMenu = ref<InstanceType<typeof ContextMenu>>()

const libraryData = computed(() => {
  const value = liked.value
  return {
    songs: Array.isArray(value?.songs) ? value.songs : [],
    songsWithDetails: Array.isArray(value?.songsWithDetails) ? value.songsWithDetails : [],
    playlists: Array.isArray(value?.playlists) ? value.playlists : [],
    albums: Array.isArray(value?.albums) ? value.albums : [],
    artists: Array.isArray(value?.artists) ? value.artists : [],
    mvs: Array.isArray(value?.mvs) ? value.mvs : [],
    cloudDisk: Array.isArray(value?.cloudDisk) ? value.cloudDisk : []
  }
})

/*
 * 顶部喜欢歌曲预览使用普通 CSS Grid，而不是 VirtualTrackList。
 * 这里固定展示 6 首（2 列 × 3 行），不需要虚拟滚动；让内容进入正常文档流后，高度由实际
 * 字体、缩放和封面尺寸决定，同时减少首屏详情请求与图片解码量。
 */
const likedSongsPreview = computed(() => libraryData.value.songsWithDetails.slice(0, 6))

const likedPreviewRows = computed(() => {
  const rows: any[][] = []
  for (let index = 0; index < likedSongsPreview.value.length; index += 2) {
    rows.push(likedSongsPreview.value.slice(index, index + 2))
  }
  return rows
})

const getLikedPreviewImage = (track: any) => {
  const rawUrl = track.al?.picUrl || track.album?.picUrl || track.picUrl
  if (!rawUrl) return 'atom://get-default-pic'
  const url = rawUrl.startsWith('http:') ? rawUrl.replace('http:', 'https:') : rawUrl
  return `${url}${url.includes('?') ? '&' : '?'}param=64y64`
}

const getLikedPreviewArtist = (track: any) => {
  const artists = track.ar || track.artists || []
  const names = artists.map((artist: any) => artist?.name).filter(Boolean)
  return names.length ? names.join(' / ') : t('library.unknownArtist')
}

const playLikedPreviewTrack = (trackId: number | string) => {
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

const playRandomLyricTrack = () => {
  const trackId = Number(randomtrack.value?.id)
  if (!Number.isFinite(trackId) || trackId <= 0) return

  const trackIDs = libraryData.value.songs
    .map((track: any) => Number(track?.id ?? track))
    .filter((id: number) => Number.isFinite(id) && id > 0)
  const index = trackIDs.indexOf(trackId)
  if (index < 0) return

  markPlaybackEndReason('manual-select')
  void replacePlaylist('playlist', likedSongPlaylistID.value || 0, trackIDs, index)
}

const hasCustomTitleBar = inject('hasCustomTitleBar', ref(true))

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

const {
  fetchLikedSongs,
  fetchLikedPlaylist,
  fetchLikedSongsWithDetails,
  fetchLikedAlbums,
  fetchLikedArtists,
  fetchLikedMVs,
  fetchCloudDisk
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

onMounted(() => {
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
    border-radius: 16px;
    padding: 20px 24px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    transition: background-color 0.25s;
    background: color-mix(in oklab, var(--color-primary) var(--bg-alpha), white);

    .title {
      font-size: 20px;
      font-weight: 700;
      margin: 14px 0 10px 0;
      color: var(--color-primary);
    }

    .liked-songs-link {
      width: fit-content;
      max-width: 100%;
      cursor: pointer;
      border-radius: 8px;
      outline: none;
      transition:
        opacity 0.2s ease,
        background-color 0.2s ease;

      &:hover,
      &:focus-visible {
        opacity: 0.82;
        background: color-mix(in srgb, var(--color-primary) 8%, transparent);
      }
    }

    .lyric-preview-action {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      cursor: pointer;
      border-radius: 12px;
      outline: none;
      transition:
        background-color 0.2s ease,
        transform 0.2s ease;

      &:hover,
      &:focus-visible {
        background: color-mix(in srgb, var(--color-primary) 7%, transparent);
      }

      &:active:not(.disabled) {
        transform: scale(0.992);
      }

      &.disabled {
        cursor: default;
      }
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
      gap: 10px;
      color: var(--color-primary);
      margin-top: auto;

      .titles {
        width: 100%;
        min-width: 0;

        .title {
          font-size: 16px !important;
          font-weight: 700;
          line-height: 1.3;
          margin: 8px 0 0;
          white-space: normal;
          overflow: visible;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
      }

      .lyric-play-hint {
        width: 32px;
        height: 32px;
        flex: 0 0 32px;
        display: grid;
        place-items: center;
        margin-bottom: 2px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--color-primary) 13%, transparent);
        opacity: 0.58;
        transition:
          opacity 0.2s ease,
          transform 0.2s ease;

        .svg-icon {
          width: 14px;
          height: 14px;
        }
      }
    }

    .lyric-preview-action:hover .lyric-play-hint,
    .lyric-preview-action:focus-visible .lyric-play-hint {
      opacity: 0.95;
      transform: scale(1.04);
    }
  }

  .songs {
    min-width: 0;
  }

  .liked-preview-list {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .liked-preview-row {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 18px;
    align-items: stretch;
  }

  .liked-preview-item {
    min-width: 0;
    min-height: 68px;
    padding: 7px 8px;
    box-sizing: border-box;
    border-radius: 12px;
    display: flex;
    align-items: center;
    overflow: visible;
    user-select: none;
    transition: background-color 0.2s;

    &:hover {
      background: var(--color-secondary-bg);
    }
  }

  .liked-preview-cover {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    margin-right: 14px;
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
    line-height: 19px;
    font-weight: 600;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .liked-preview-artist {
    min-width: 0;
    margin-top: 2px;
    line-height: 17px;
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
}

/*
 * App.vue uses #app + !important for global typography. These selectors include #app as well,
 * so the compact Library preview keeps its intended hierarchy instead of every line becoming 16/20px.
 */
:global(#app) .library .liked-preview-title {
  font-size: var(--app-global-font-size) !important;
}

:global(#app) .library .liked-preview-artist {
  font-size: calc(0.8125 * var(--app-global-font-size)) !important;
}

:global(#app) .library .liked-songs .bottom .title {
  font-size: var(--app-global-font-size) !important;
}

:global(#app) .library .section-two .tabs .tab,
:global(#app) .library .section-two .tabs .tab .tab-label {
  font-size: 18px !important;
  line-height: 20px !important;
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
      align-items: center;
      font-size: 18px;
      line-height: 20px;
      color: var(--color-text);
      -webkit-app-region: no-drag;

      .tab {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        box-sizing: border-box;
        font-size: inherit;
        line-height: inherit;
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
        padding: 0;
        overflow: hidden;

        .tab-label {
          display: flex;
          align-items: center;
          min-height: 40px;
          box-sizing: border-box;
          padding: 8px 3px 8px 14px;
          font-size: inherit !important;
          font-weight: inherit;
          line-height: inherit;
          letter-spacing: inherit;
          white-space: nowrap;
        }

        .icon {
          align-self: stretch;
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
