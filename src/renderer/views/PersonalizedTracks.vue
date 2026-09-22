<template>
  <div v-show="show" class="personalized-tracks-page">
    <div class="hero">
      <div class="title gradient">{{ t('personalizedTracks.title') }}</div>
      <div class="subtitle">{{ t('personalizedTracks.description') }}</div>
      <div class="actions">
        <ButtonTwoTone
          class="play-button"
          icon-class="play"
          color="grey"
          :disabled="!tracks.length"
          @click="play"
        >
          {{ t('common.play') }}
        </ButtonTwoTone>
        <SearchBox ref="searchBoxRef" :placeholder="t('playlist.search')" />
      </div>
    </div>

    <TrackList
      id="/recommend/tracks"
      :items="filteredTracks"
      :all-items="tracks"
      :colunm-number="1"
      type="url"
      :is-end="true"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import ButtonTwoTone from '../components/ButtonTwoTone.vue'
import SearchBox from '../components/SearchBox.vue'
import TrackList from '../components/VirtualTrackList.vue'
import { homepageBlockPage } from '../api/modern'
import { extractCursor, extractTracks } from '../services/neteaseModern'
import { usePlayerStore } from '../store/player'

const { t } = useI18n()
const show = ref(false)
const tracks = ref<any[]>([])
const searchBoxRef = ref<InstanceType<typeof SearchBox>>()

const playerStore = usePlayerStore()
const { _shuffle } = storeToRefs(playerStore)
const { replacePlaylist } = playerStore

const keyword = computed(() => searchBoxRef.value?.keywords?.trim().toLowerCase() ?? '')

const filteredTracks = computed(() => {
  if (!keyword.value) return tracks.value

  return tracks.value.filter((track) => {
    const name = String(track?.name ?? '').toLowerCase()
    const album = String(track?.album?.name ?? track?.al?.name ?? '').toLowerCase()
    const artists = (track?.artists ?? track?.ar ?? [])
      .map((artist: any) => String(artist?.name ?? '').toLowerCase())
      .join(' ')

    return (
      name.includes(keyword.value) ||
      album.includes(keyword.value) ||
      artists.includes(keyword.value)
    )
  })
})

const mergeTracks = (target: any[], incoming: any[]) => {
  const ids = new Set(target.map((track) => String(track?.id ?? track?.songId ?? '')))
  incoming.forEach((track) => {
    const id = String(track?.id ?? track?.songId ?? '')
    if (!id || ids.has(id)) return
    ids.add(id)
    target.push(track)
  })
}

const loadTracks = async () => {
  show.value = false

  try {
    const collected: any[] = []
    let cursor: string | number | undefined
    const seenCursors = new Set<string>()

    // /homepage/block/page 支持 cursor。这里最多读取 5 页，避免异常响应造成无限请求。
    for (let page = 0; page < 5; page += 1) {
      const result = await homepageBlockPage({
        refresh: page === 0,
        ...(cursor !== undefined ? { cursor } : {})
      })

      mergeTracks(collected, extractTracks(result, 200))

      const nextCursor = extractCursor(result)
      if (nextCursor === undefined || nextCursor === null || nextCursor === '') break

      const cursorKey = String(nextCursor)
      if (seenCursors.has(cursorKey)) break
      seenCursors.add(cursorKey)
      cursor = nextCursor
    }

    tracks.value = collected
  } catch (error) {
    console.warn('[PersonalizedTracks] 加载猜你喜欢失败:', error)
    tracks.value = []
  } finally {
    show.value = true
  }
}

const play = () => {
  const ids = tracks.value.map((track) => Number(track?.id ?? track?.songId)).filter(Number.isFinite)
  if (!ids.length) return

  const index = _shuffle.value ? Math.floor(Math.random() * ids.length) : 0
  replacePlaylist('url', '/recommend/tracks', ids, index)
}

onMounted(() => {
  void loadTracks()
})
</script>

<style scoped lang="scss">
.personalized-tracks-page {
  padding-bottom: 24px;
}

.hero {
  padding: 118px 0 64px;
  text-align: center;
}

.title {
  font-size: clamp(56px, 8vw, 84px);
  line-height: 1.05;
  font-weight: 760;
  letter-spacing: 2px;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  margin-top: 22px;
  font-size: 16px;
  color: var(--color-text);
  opacity: 0.6;
}

.actions {
  margin-top: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.gradient {
  background: linear-gradient(to left, var(--color-primary), #ff6b81);
}

@media (max-width: 720px) {
  .hero {
    padding-top: 88px;
  }

  .actions {
    flex-wrap: wrap;
  }
}
</style>
