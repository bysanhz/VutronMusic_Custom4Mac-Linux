<template>
  <div class="resource-grid">
    <router-link
      v-for="(item, index) in items"
      :key="resourceKey(item, index)"
      class="resource-card"
      :to="resourceLink(item)"
    >
      <div class="cover-wrap" :class="{ artist: type === 'artist' }">
        <img :src="resourceImage(item)" alt="" loading="lazy" />
        <div class="cover-play" aria-hidden="true">▶</div>
      </div>
      <div class="resource-name">{{ item?.name || '未命名' }}</div>
      <div v-if="resourceSubtitle(item)" class="resource-subtitle">
        {{ resourceSubtitle(item) }}
      </div>
    </router-link>
    <div v-if="!items.length" class="empty">{{ emptyText }}</div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    items: any[]
    type: 'album' | 'artist' | 'playlist'
    emptyText?: string
  }>(),
  {
    emptyText: '当前没有可展示的资源。'
  }
)

const resourceKey = (item: any, index: number): string =>
  item?.id !== undefined && item?.id !== null ? String(item.id) : `${props.type}-${index}`

const resourceLink = (item: any): string => `/${props.type}/${item?.id ?? ''}`

const resourceImage = (item: any): string => {
  const source = item?.img1v1Url || item?.picUrl || item?.coverImgUrl || item?.avatarUrl || ''
  if (!source) return 'atom://get-default-pic'
  const url = String(source).replace('http://', 'https://')
  return `${url}${url.includes('?') ? '&' : '?'}param=320y320`
}

const resourceSubtitle = (item: any): string => {
  if (props.type === 'artist') {
    return item?.alias?.[0] || item?.trans || ''
  }
  if (props.type === 'album') {
    return item?.artist?.name || item?.artists?.[0]?.name || ''
  }
  return item?.creator?.nickname ? `by ${item.creator.nickname}` : item?.copywriter || ''
}
</script>

<style scoped lang="scss">
.resource-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 24px 18px;
}

.resource-card {
  min-width: 0;
  color: var(--color-text);
  text-decoration: none;
}

.cover-wrap {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 12px;
  background: var(--color-body-bg);

  &.artist {
    border-radius: 50%;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.2s ease, filter 0.2s ease;
  }
}

.cover-play {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: white;
  background: rgba(0, 0, 0, 0.58);
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.resource-card:hover {
  .cover-wrap img {
    transform: scale(1.025);
    filter: brightness(0.88);
  }

  .cover-play {
    opacity: 1;
    transform: translateY(0);
  }
}

.resource-name {
  margin-top: 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
}

.resource-subtitle {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  opacity: 0.55;
}

.empty {
  grid-column: 1 / -1;
  padding: 32px 0;
  text-align: center;
  opacity: 0.5;
}

@media (max-width: 1100px) {
  .resource-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .resource-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .resource-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
