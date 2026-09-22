<template>
  <div v-show="show" class="personalized-tracks-page">
    <div class="hero">
      <div class="hero-copy">
        <div class="title">{{ t('personalizedTracks.title') }}</div>
        <div class="subtitle">{{ t('personalizedTracks.description') }}</div>
      </div>
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
      :enable-virtual-scroll="false"
      :padding-bottom="0"
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
  padding: 28px 0 120px;
}

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 34px 0 30px;
  margin-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-text) 10%, transparent);
}

.hero-copy {
  min-width: 0;
}

.title {
  color: var(--color-text);
  font-size: clamp(38px, 5vw, 58px);
  line-height: 1;
  font-weight: 780;
  letter-spacing: -0.02em;
}

.subtitle {
  margin-top: 12px;
  max-width: 560px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--color-text);
  opacity: 0.56;
}

.actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 760px) {
  .personalized-tracks-page {
    padding-top: 18px;
  }

  .hero {
    align-items: flex-start;
    flex-direction: column;
    gap: 18px;
    padding-top: 24px;
  }

  .actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
