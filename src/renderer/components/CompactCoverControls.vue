<template>
  <div
    class="compact-cover-controls"
    :class="{ 'controls-visible': isHover }"
    @mouseenter="isHover = true"
    @mouseleave="isHover = false"
  >
    <img class="compact-cover" :src="coverUrl" alt="当前歌曲封面" draggable="false" />

    <!-- ======== newADD start====== -->
    <!--
      六个按钮固定为 2 × 3 网格：
      第一排：上一首、播放/暂停、下一首；
      第二排：主窗口、心动模式、喜欢。

      爱心按钮始终显示，其余五个按钮只在鼠标进入封面控制区后显示。
    -->
    <div class="compact-control-grid">
      <button
        class="compact-control-button control-prev hover-control"
        title="上一首"
        @click.stop="playPrev"
      >
        <SvgIcon icon-class="previous" />
      </button>

      <button
        class="compact-control-button control-play hover-control"
        :title="isPlaying ? '暂停' : '播放'"
        @click.stop="playOrPause"
      >
        <SvgIcon :icon-class="isPlaying ? 'pause' : 'play'" />
      </button>

      <button
        class="compact-control-button control-next hover-control"
        title="下一首"
        @click.stop="playNext"
      >
        <SvgIcon icon-class="next" />
      </button>

      <button
        class="compact-control-button control-main-window hover-control"
        title="显示或隐藏主窗口"
        @click.stop="toggleMainWindow"
      >
        <SvgIcon icon-class="logo" />
      </button>

      <button
        class="compact-control-button control-heart-mode hover-control"
        title="根据我喜欢的音乐开启心动模式"
        @click.stop="startHeartMode"
      >
        <SvgIcon icon-class="heart-mode" />
      </button>

      <button
        class="compact-control-button control-like"
        :class="{ liked: isLiked }"
        :title="isLiked ? '取消喜欢' : '加入喜欢'"
        @click.stop="toggleLike"
      >
        <SvgIcon :icon-class="isLiked ? 'heart-solid' : 'heart'" />
      </button>
    </div>
    <!-- =========== newADD end ======== -->
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import SvgIcon from './SvgIcon.vue'

const DEFAULT_COVER = 'https://p2.music.126.net/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg'
const HEART_MODE_CHANNEL = 'vutronmusic-heart-mode-control'

const isHover = ref(false)
const isPlaying = ref(false)
const isLiked = ref(false)
const coverUrl = ref(DEFAULT_COVER)
let heartModeChannel: BroadcastChannel | null = null

/**
 * 从共享播放器快照读取封面与播放状态。
 *
 * 桌面歌词运行在独立 renderer 中，因此不能直接复用主窗口 Pinia store。
 */
const updatePlayerSnapshot = () => {
  try {
    const player = JSON.parse(localStorage.getItem('player') || '{}')
    const track = player.currentTrack
    const album = track?.album ?? track?.al

    coverUrl.value = player.pic || album?.picUrl || track?.picUrl || DEFAULT_COVER
    isPlaying.value = Boolean(player.playing)
  } catch (error) {
    console.warn('[CompactCoverControls] 读取播放器状态失败：', error)
  }
}

const playPrev = () => {
  window.mainApi?.send('from-osd', 'playPrev')
}

const playOrPause = () => {
  window.mainApi?.send('from-osd', 'playOrPause')
}

const playNext = () => {
  window.mainApi?.send('from-osd', 'playNext')
}

const toggleLike = () => {
  window.mainApi?.send('from-osd', 'likeTrack')
}

const toggleMainWindow = () => {
  window.mainApi?.send('from-osd', 'toggleMainWin')
}

// ======== newADD start======
/**
 * 根据“我喜欢的音乐”开始一次新的网易云心动模式播放。
 *
 * 使用 BroadcastChannel 直接通知主播放器 renderer，避免桌面歌词 MessagePort 尚未
 * 初始化或窗口重建后失效。主窗口会从喜欢歌单随机选择种子歌曲、请求真正的
 * `/playmode/intelligence/list`，随后立即替换播放队列并开始播放。
 */
const startHeartMode = () => {
  if (!heartModeChannel) {
    heartModeChannel = new BroadcastChannel(HEART_MODE_CHANNEL)
  }

  heartModeChannel.postMessage({
    type: 'start-heart-mode-from-likes',
    timestamp: Date.now()
  })
}
// =========== newADD end ========

const handleStorage = (event: StorageEvent) => {
  if (event.key === 'player') updatePlayerSnapshot()
}

const handleOsdStatusMessage = (event: MessageEvent) => {
  if (event.data?.type !== 'update-osd-status') return

  const data = event.data.data ?? {}

  if (typeof data.isLiked === 'boolean') isLiked.value = data.isLiked
  if (typeof data.playing === 'boolean') isPlaying.value = data.playing
  if (typeof data.pic === 'string' && data.pic.length > 0) coverUrl.value = data.pic
}

const handlePlayingStatus = (_event: unknown, value: boolean) => {
  isPlaying.value = value
}

onMounted(() => {
  updatePlayerSnapshot()
  heartModeChannel = new BroadcastChannel(HEART_MODE_CHANNEL)
  window.addEventListener('storage', handleStorage)
  window.addEventListener('message', handleOsdStatusMessage)
  window.mainApi?.on('update-osd-playing-status', handlePlayingStatus)
})

onBeforeUnmount(() => {
  heartModeChannel?.close()
  heartModeChannel = null
  window.removeEventListener('storage', handleStorage)
  window.removeEventListener('message', handleOsdStatusMessage)
  window.mainApi?.off('update-osd-playing-status', handlePlayingStatus)
})
</script>

<style scoped lang="scss">
.compact-cover-controls {
  position: relative;
  width: 45px;
  height: 35px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 5px;
  -webkit-app-region: no-drag;
}

.compact-cover {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}

/* ======== newADD start====== */
.compact-control-grid {
  position: absolute;
  inset: 0;
  z-index: 2;

  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  align-items: stretch;
  justify-items: stretch;

  background: transparent;
  transition:
    background 0.16s ease,
    backdrop-filter 0.16s ease;
}

.controls-visible .compact-control-grid {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.compact-control-button {
  position: relative;
  z-index: 1;

  display: flex;
  align-items: center;
  justify-content: center;

  min-width: 0;
  min-height: 0;
  padding: 0;

  border: none;
  outline: none;
  border-radius: 2px;

  color: rgba(255, 255, 255, 0.96);
  background: transparent;
  cursor: pointer;

  -webkit-app-region: no-drag;

  transition:
    opacity 0.16s ease,
    background 0.16s ease,
    transform 0.12s ease;

  .svg-icon {
    width: 8px;
    height: 8px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.22);
  }

  &:active {
    transform: scale(0.88);
  }
}

.control-play .svg-icon {
  width: 11px;
  height: 11px;
}

.control-main-window .svg-icon {
  width: 9px;
  height: 9px;
}

.control-heart-mode .svg-icon {
  width: 11px;
  height: 11px;
}

.control-like .svg-icon {
  width: 10px;
  height: 10px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.72));
}

/* 其余五个按钮默认隐藏，但继续占据固定网格位置，避免悬停时发生重排。 */
.hover-control {
  opacity: 0;
  pointer-events: none;
}

.controls-visible .hover-control {
  opacity: 1;
  pointer-events: auto;
}

/* 爱心位于右下角并始终可见，不再绘制深色圆形底。 */
.control-like {
  grid-column: 3;
  grid-row: 2;
  opacity: 1;
  pointer-events: auto;
  border-radius: 2px;
  background: transparent;

  &:hover {
    background: transparent;
    transform: scale(1.08);
  }

  &.liked {
    color: #ff4d6d;
  }
}

.controls-visible .control-like {
  background: transparent;
}

.control-prev {
  grid-column: 1;
  grid-row: 1;
}

.control-play {
  grid-column: 2;
  grid-row: 1;
}

.control-next {
  grid-column: 3;
  grid-row: 1;
}

.control-main-window {
  grid-column: 1;
  grid-row: 2;
}

.control-heart-mode {
  grid-column: 2;
  grid-row: 2;
}
/* =========== newADD end ======== */
</style>
