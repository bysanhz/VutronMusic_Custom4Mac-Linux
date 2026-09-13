<template>
  <div class="insights-track-list">
    <div
      v-for="(track, index) in items"
      :key="trackKey(track, index)"
      class="track-row"
      @dblclick="playTrack(track)"
    >
      <img :src="trackCover(track)" alt="" loading="lazy" />
      <div class="track-copy">
        <div class="track-name">{{ track?.name || '未知歌曲' }}</div>
        <div class="track-meta">
          <span>{{ trackArtists(track) }}</span>
          <span v-if="trackAlbum(track)"> · {{ trackAlbum(track) }}</span>
        </div>
      </div>
      <div class="track-duration">{{ trackDuration(track) }}</div>
      <button class="play-button" :aria-label="`播放 ${track?.name || '歌曲'}`" @click="playTrack(track)">
        <span aria-hidden="true">▶</span>
      </button>
    </div>
    <div v-if="!items.length" class="empty">{{ emptyText }}</div>
  </div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '../store/player'

withDefaults(
  defineProps<{
    items: any[]
    emptyText?: string
  }>(),
  {
    emptyText: '当前没有可展示的歌曲。'
  }
)

const playerStore = usePlayerStore()

const trackID = (track: any): number => Number(track?.id ?? track?.songId ?? 0)

const trackKey = (track: any, index: number): string => {
  const id = trackID(track)
  return id > 0 ? String(id) : `track-${index}`
}

const trackCover = (track: any): string => {
  const source =
    track?.al?.picUrl ||
    track?.album?.picUrl ||
    track?.picUrl ||
    track?.simpleSong?.al?.picUrl ||
    ''
  if (!source) return 'atom://get-default-pic'
  const url = String(source).replace('http://', 'https://')
  return `${url}${url.includes('?') ? '&' : '?'}param=96y96`
}

const trackArtists = (track: any): string => {
  const artists = track?.ar ?? track?.artists ?? track?.simpleSong?.ar ?? []
  if (!Array.isArray(artists) || !artists.length) return '未知歌手'
  return artists.map((artist: any) => artist?.name).filter(Boolean).join(' / ') || '未知歌手'
}

const trackAlbum = (track: any): string =>
  String(track?.al?.name ?? track?.album?.name ?? track?.simpleSong?.al?.name ?? '')

const trackDuration = (track: any): string => {
  const milliseconds = Number(track?.dt ?? track?.duration ?? track?.simpleSong?.dt ?? 0)
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return ''
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

const playTrack = (track: any): void => {
  const id = trackID(track)
  if (!Number.isFinite(id) || id <= 0) return
  playerStore.addTrackToPlayNext(id, true, true)
}
</script>

<style scoped lang="scss">
.insights-track-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 48px;
}

.track-row {
  min-height: 66px;
  padding: 8px 10px;
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr) auto 42px;
  gap: 12px;
  align-items: center;
  border-radius: 12px;
  transition: background 0.16s ease;

  &:hover {
    background: var(--color-body-bg);
  }

  img {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 9px;
    border: 1px solid color-mix(in srgb, var(--color-text) 6%, transparent);
  }
}

.track-copy {
  min-width: 0;
}

.track-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 650;
}

.track-meta {
  margin-top: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  opacity: 0.58;
}

.track-duration {
  min-width: 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  opacity: 0.5;
}

.play-button {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-body-bg));
  cursor: pointer;
  transition: transform 0.16s ease, background 0.16s ease;

  &:hover {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--color-primary) 18%, var(--color-body-bg));
  }
}

.empty {
  padding: 32px 0;
  text-align: center;
  opacity: 0.5;
}

@media (max-width: 680px) {
  .track-row {
    grid-template-columns: 46px minmax(0, 1fr) 38px;
  }

  .track-duration {
    display: none;
  }
}
</style>
