<template>
  <div v-show="show">
    <div v-if="general.showBanner && banner.length" class="banner">
      <div
        v-for="(item, index) in banner"
        :key="item.id ?? item.targetId"
        class="banner-item"
        :class="{
          left: index === left,
          center: index === current,
          right: index === right
        }"
        @click="index === current && handleBannerClick(item)"
      >
        <img :src="imgFilter(item.imageUrl ?? item.pic)" alt="" />
        <div class="subtitle" :style="{ backgroundColor: item.titleColor || 'red' }">{{
          item.typeTitle
        }}</div>
      </div>
    </div>

    <div class="index-row">
      <div class="title">For You</div>
      <div class="for-you-row">
        <DailyTracksCard ref="DailyTracksCardRef" />
        <FMCard />
        <button class="insights-card" @click="router.push('/insights')">
          <div class="insights-eyebrow">NEW</div>
          <div class="insights-title">音乐洞察</div>
          <div class="insights-desc">听歌足迹 · 曲风漫游 · 云盘 Pro · 私人 DJ</div>
          <div class="insights-link">打开 →</div>
        </button>
      </div>
    </div>

    <div v-if="personalizedTracks.length" class="index-row">
      <div class="title">
        猜你喜欢
        <a @click="router.push('/insights')">查看更多</a>
      </div>
      <TrackList
        id="home-personalized-tracks"
        :items="personalizedTracks"
        :colunm-number="1"
        :height="Math.min(360, Math.max(180, personalizedTracks.length * 60))"
        :item-height="60"
        type="playlist"
        :is-end="true"
      />
    </div>

    <div class="index-row">
      <div class="title">
        {{ personalizedPlaylists.length ? '为你定制' : $t('home.recommendPlaylist') }}
        <a @click="toExplore('playlist', '推荐歌单')">{{ $t('home.seeMore') }}</a>
      </div>
      <CoverRow
        :items="personalizedPlaylists.length ? personalizedPlaylists : recommendPlaylist.items"
        type="playlist"
        sub-text="copywriter"
      />
    </div>

    <div class="index-row">
      <div class="title">{{ $t('home.recommendArtist') }}</div>
      <CoverRow :items="recommendArtists.items" type="artist" :colunm-number="6" />
    </div>

    <div class="index-row">
      <div class="title">
        {{ $t('home.newAlbum') }}
        <a @click="toExplore('newAlbum')">{{ $t('home.seeMore') }}</a>
      </div>
      <CoverRow :items="newReleasesAlbum.items" type="album" sub-text="artist" />
    </div>

    <div class="index-row">
      <div class="title">
        {{ $t('home.charts') }}
        <a @click="toExplore('chart')">{{ $t('home.seeMore') }}</a>
      </div>
      <CoverRow :items="topList.items" type="playlist" sub-text="updateFrequency" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onActivated, ref, onBeforeUnmount, onDeactivated, watch } from 'vue'
import { getBanner } from '../api/other'
import { toplistOfArtists } from '../api/artist'
import { newAlbums } from '../api/album'
import { toplists } from '../api/playlist'
import { homepageBlockPage } from '../api/modern'
import { extractArtists, extractPlaylists, extractTracks } from '../services/neteaseModern'
import { getRecommendPlayList } from '../utils/playlist'
import { tricklingProgress } from '../utils/tricklingProgress'
import CoverRow from '../components/CoverRow.vue'
import TrackList from '../components/VirtualTrackList.vue'
import DailyTracksCard from '../components/DailyTracksCard.vue'
import FMCard from '../components/FMCard.vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../store/settings'
import { useNormalStateStore } from '../store/state'
import { usePlayerStore } from '../store/player'
import { storeToRefs } from 'pinia'
import Utils from '../utils'

const toplistOfArtistsAreaTable = {
  all: null,
  zh: 1,
  ea: 2,
  jp: 4,
  kr: 3
}
const { general } = storeToRefs(useSettingsStore())
const { exploreTab, showLyrics } = storeToRefs(useNormalStateStore())
const { addTrackToPlayNext } = usePlayerStore()

const router = useRouter()

const banner = ref<any[]>([])
const left = ref(-1)
const current = ref(0)
const right = ref(-1)
const timer = ref<any>(null)
const show = ref(false)
const loadRevision = ref(0)

const recommendPlaylist = ref<{ items: any[] }>({ items: [] })
const personalizedPlaylists = ref<any[]>([])
const personalizedTracks = ref<any[]>([])
const recommendArtists = ref<{ items: any[]; indexs: any[] }>({
  items: [],
  indexs: []
})
const newReleasesAlbum = ref<{ items: any[] }>({ items: [] })
const topList = ref<{ items: any[]; ids: number[] }>({
  items: [],
  ids: [19723756, 180106, 60198, 3812895, 60131]
})

const toExplore = (tab: string, Category = '全部') => {
  exploreTab.value = tab
  router.push({ name: 'explore', query: { category: Category, tab, type: '全部' } })
}

const bannerChange = () => {
  const length = banner.value.length
  if (!length) {
    left.value = -1
    right.value = -1
    return
  }

  current.value = current.value % length
  left.value = (current.value - 1 + length) % length
  right.value = (current.value + 1) % length
}

const bannerNext = () => {
  if (!banner.value.length) return
  current.value = (current.value + 1) % banner.value.length
  bannerChange()
}

const handleBannerClick = (item: any) => {
  if (!item) return
  if (['新歌首发', '热歌推荐'].includes(item.typeTitle)) {
    addTrackToPlayNext(item.targetId, true, true)
  } else if (item.typeTitle === '新碟首发') {
    router.push(`/album/${item.targetId}`)
  } else if (item.typeTitle === '数字专辑' && item.url) {
    const url = new URL(item.url)
    const id = url.searchParams.get('id')
    if (id) router.push(`/album/${id}`)
  } else if (item.typeTitle === '歌单推荐') {
    router.push(`/playlist/${item.targetId}`)
  } else if (item.typeTitle === 'MV首发') {
    router.push(`/mv/${item.targetId}`)
  } else if (item.url) {
    Utils.openExternal(item.url)
  }
}

const imgFilter = (img?: string) => (img ? img.replace('http://', 'https://') : '')

const loadPersonalizedHome = async (revision: number) => {
  const result = await homepageBlockPage({ refresh: false })
  if (revision !== loadRevision.value || !result) return

  personalizedTracks.value = extractTracks(result, 12)
  personalizedPlaylists.value = extractPlaylists(result, 10)

  const artists = extractArtists(result, 6)
  if (artists.length) {
    recommendArtists.value.items = artists
    recommendArtists.value.indexs = []
  }
}

const loadFallbackArtists = async (revision: number) => {
  const data = await toplistOfArtists(
    toplistOfArtistsAreaTable[general.value.musicLanguage ?? 'all']
  )
  if (revision !== loadRevision.value || recommendArtists.value.items.length) return

  const list = data?.list?.artists ?? []
  const indexes: number[] = []
  while (indexes.length < Math.min(6, list.length)) {
    const index = ~~(Math.random() * list.length)
    if (!indexes.includes(index)) indexes.push(index)
  }
  recommendArtists.value.indexs = indexes
  recommendArtists.value.items = list.filter((_: any, index: number) => indexes.includes(index))
}

const loadData = async () => {
  const revision = ++loadRevision.value
  show.value = false
  tricklingProgress.start()

  personalizedTracks.value = []
  personalizedPlaylists.value = []
  recommendArtists.value.items = []

  const jobs: Promise<any>[] = []

  if (general.value.showBanner) {
    jobs.push(
      getBanner({ type: 0 }).then((res) => {
        if (revision !== loadRevision.value) return
        banner.value = (res?.banners ?? []).filter((item: any) => item.typeTitle !== '广告')
        current.value = 0
        bannerChange()
        handleBanner()
      })
    )
  }

  jobs.push(
    getRecommendPlayList(10, false).then((items) => {
      if (revision === loadRevision.value) recommendPlaylist.value.items = items
    })
  )

  jobs.push(loadPersonalizedHome(revision))
  jobs.push(loadFallbackArtists(revision))

  jobs.push(
    newAlbums({ area: general.value.musicLanguage ?? 'all', limit: 10 }).then((data) => {
      if (revision === loadRevision.value) newReleasesAlbum.value.items = data?.albums ?? []
    })
  )

  jobs.push(
    toplists().then((data: any) => {
      if (revision !== loadRevision.value) return
      topList.value.items = (data?.list ?? []).filter((item: any) =>
        topList.value.ids.includes(item.id)
      )
    })
  )

  await Promise.allSettled(jobs)
  if (revision === loadRevision.value) {
    tricklingProgress.done()
    show.value = true
  }
}

const handleBanner = () => {
  if (timer.value) clearInterval(timer.value)
  if (!banner.value.length) return
  timer.value = setInterval(bannerNext, 8000)
}

const handleVisibleChange = () => {
  if (document.hidden) clearInterval(timer.value)
  else handleBanner()
}

watch(showLyrics, (value) => {
  if (value) clearInterval(timer.value)
  else handleBanner()
})

document.addEventListener('visibilitychange', handleVisibleChange)

onActivated(() => {
  void loadData()
})

onDeactivated(() => {
  clearInterval(timer.value)
})

onBeforeUnmount(() => {
  clearInterval(timer.value)
  document.removeEventListener('visibilitychange', handleVisibleChange)
})
</script>

<style scoped lang="scss">
.banner {
  margin: 20px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 100%;
  height: 180px;
  .banner-item {
    width: 440px;
    position: absolute;
    overflow: hidden;
    z-index: 0;
    transition: all 0.45s ease-in-out;
    pointer-events: none;
    img {
      width: 100%;
      border-radius: 8px;
      object-fit: cover;
      display: block;
    }
    .subtitle {
      position: absolute;
      bottom: 0;
      right: 0;
      font-size: 10px;
      font-weight: 600;
      color: white;
      padding: 2px 4px;
      border-radius: 8px 0 8px 0;
    }
  }
  .banner-item.center {
    cursor: pointer;
    pointer-events: auto;
    transform: scale(1.2);
    z-index: 2;
  }
  .banner-item.left {
    transform: translateX(calc(220px - 42.5vw));
    z-index: 1;
  }
  .banner-item.right {
    transform: translateX(calc(42.5vw - 220px));
    z-index: 1;
  }
}

.index-row {
  margin-top: 50px;
  .title {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 20px;
    font-size: 28px;
    font-weight: 700;
    color: var(--color-text);
    a {
      font-size: 13px;
      font-weight: 600;
      opacity: 0.68;
      cursor: pointer;
    }
  }
}

.for-you-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin-bottom: 78px;
}

.insights-card {
  min-height: 178px;
  padding: 24px;
  border: 0;
  border-radius: 14px;
  text-align: left;
  cursor: pointer;
  color: var(--color-text);
  background:
    radial-gradient(
      circle at 85% 18%,
      color-mix(in srgb, var(--color-primary) 42%, transparent),
      transparent 34%
    ),
    var(--color-secondary-bg);
  transition: transform 0.2s ease;
  &:hover {
    transform: translateY(-3px);
  }
}

.insights-eyebrow {
  display: inline-block;
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: white;
  background: var(--color-primary);
}

.insights-title {
  margin-top: 15px;
  font-size: 25px;
  font-weight: 760;
}

.insights-desc {
  margin-top: 7px;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.58;
}

.insights-link {
  margin-top: 18px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-primary);
}

@media (max-width: 1000px) {
  .for-you-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .insights-card {
    grid-column: 1 / -1;
  }
}
</style>
