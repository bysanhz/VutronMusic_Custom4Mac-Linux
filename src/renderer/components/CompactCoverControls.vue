<template>
  <div
    ref="rootRef"
    class="compact-cover-controls"
    :class="{ 'controls-visible': isHover }"
    @mouseenter="isHover = true"
    @mouseleave="isHover = false"
  >
    <img class="compact-cover" :src="coverUrl" :alt="text.coverAlt" draggable="false" />

    <div class="compact-control-grid">
      <button
        type="button"
        class="compact-control-button control-prev hover-control"
        :title="text.previous"
        @click.stop="playPrev"
      >
        <SvgIcon icon-class="previous" />
      </button>

      <button
        type="button"
        class="compact-control-button control-play hover-control"
        :title="isPlaying ? text.pause : text.play"
        @click.stop="playOrPause"
      >
        <SvgIcon :icon-class="isPlaying ? 'pause' : 'play'" />
      </button>

      <button
        type="button"
        class="compact-control-button control-next hover-control"
        :title="text.next"
        @click.stop="playNext"
      >
        <SvgIcon icon-class="next" />
      </button>

      <button
        type="button"
        class="compact-control-button control-main-window hover-control"
        :title="text.toggleMain"
        @click.stop="toggleMainWindow"
      >
        <SvgIcon icon-class="logo" />
      </button>

      <button
        type="button"
        class="compact-control-button control-heart-mode hover-control"
        :class="{ loading: heartModeLoading }"
        :title="heartModeTitle"
        :disabled="heartModeLoading"
        @click.stop="startHeartMode"
      >
        <SvgIcon icon-class="heart-mode" />
      </button>

      <button
        type="button"
        class="compact-control-button control-like"
        :class="{ liked: isLiked }"
        :title="isLiked ? text.unlike : text.like"
        @click.stop="toggleLike"
      >
        <SvgIcon :icon-class="isLiked ? 'heart-solid' : 'heart'" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import SvgIcon from './SvgIcon.vue'
import { resolveFeatureLanguage } from '../utils/v327FeatureShared'

const DEFAULT_COVER = 'https://p2.music.126.net/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg'
const HEART_MODE_CHANNEL = 'vutronmusic-heart-mode-control'
const COVER_CONTROLS_STORAGE_KEY = 'vutronmusic-osd-cover-controls-visible'
const OSD_STORAGE_KEY = 'osdLyric'

const TEXTS = {
  zh: {
    coverAlt: '当前歌曲封面',
    previous: '上一首',
    play: '播放',
    pause: '暂停',
    next: '下一首',
    toggleMain: '显示或隐藏主窗口',
    like: '加入喜欢',
    unlike: '取消喜欢',
    heartStart: '根据我喜欢的音乐开启心动模式',
    heartLoading: '正在生成心动模式…',
    heartTimeout: '心动模式响应超时，请重试',
    heartSuccess: '心动模式已开启',
    heartError: '心动模式操作失败'
  },
  zht: {
    coverAlt: '目前歌曲封面',
    previous: '上一首',
    play: '播放',
    pause: '暫停',
    next: '下一首',
    toggleMain: '顯示或隱藏主視窗',
    like: '加入喜歡',
    unlike: '取消喜歡',
    heartStart: '根據我喜歡的音樂開啟心動模式',
    heartLoading: '正在產生心動模式…',
    heartTimeout: '心動模式回應逾時，請重試',
    heartSuccess: '心動模式已開啟',
    heartError: '心動模式操作失敗'
  },
  en: {
    coverAlt: 'Current track cover',
    previous: 'Previous',
    play: 'Play',
    pause: 'Pause',
    next: 'Next',
    toggleMain: 'Show or hide main window',
    like: 'Like',
    unlike: 'Unlike',
    heartStart: 'Start Heart Mode from Liked Songs',
    heartLoading: 'Generating Heart Mode…',
    heartTimeout: 'Heart Mode timed out. Please retry.',
    heartSuccess: 'Heart Mode started',
    heartError: 'Heart Mode operation failed'
  }
} as const

const text = computed(() => TEXTS[resolveFeatureLanguage()])
const rootRef = ref<HTMLElement | null>(null)
const isHover = ref(false)
const isPlaying = ref(false)
const isLiked = ref(false)
const coverUrl = ref(DEFAULT_COVER)
const heartModeLoading = ref(false)
const heartModeState = ref<'idle' | 'loading' | 'timeout' | 'success' | 'error'>('idle')
const heartModeTitle = computed(() => {
  if (heartModeState.value === 'loading') return text.value.heartLoading
  if (heartModeState.value === 'timeout') return text.value.heartTimeout
  if (heartModeState.value === 'success') return text.value.heartSuccess
  if (heartModeState.value === 'error') return text.value.heartError
  return text.value.heartStart
})
let heartModeChannel: BroadcastChannel | null = null
let heartModeRequestId = ''
let heartModeTimeout: number | null = null
let hitRegionObserver: ResizeObserver | null = null
let hitRegionFrame: number | null = null

const readOsdLocked = (): boolean => {
  try {
    const value = JSON.parse(localStorage.getItem(OSD_STORAGE_KEY) || '{}')
    return value?.isLock === true
  } catch {
    return false
  }
}

/**
 * 把左侧封面控制区转换为相对于桌面歌词视口的归一化矩形并上报主进程。
 * 主进程据此在锁定时只让该区域接收鼠标，歌词区域保持穿透。
 */
const reportControlHitRegion = () => {
  const element = rootRef.value
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const rect = element?.getBoundingClientRect()
  const visible = Boolean(
    element &&
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      viewportWidth > 0 &&
      viewportHeight > 0 &&
      window.getComputedStyle(element).display !== 'none'
  )

  window.mainApi?.send('osd-control-hit-region', {
    enabled: visible,
    locked: readOsdLocked(),
    x: visible && rect ? rect.left / viewportWidth : 0,
    y: visible && rect ? rect.top / viewportHeight : 0,
    width: visible && rect ? rect.width / viewportWidth : 0,
    height: visible && rect ? rect.height / viewportHeight : 0
  })
}

const scheduleControlHitRegionReport = () => {
  if (hitRegionFrame !== null) window.cancelAnimationFrame(hitRegionFrame)
  hitRegionFrame = window.requestAnimationFrame(() => {
    hitRegionFrame = null
    reportControlHitRegion()
  })
}

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
  // 使用独立的 OSD 播放控制，避免主窗口设置页输入框焦点拦截暂停操作。
  window.mainApi?.send('from-osd', 'playOrPauseFromOsd')
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

const startHeartMode = () => {
  if (heartModeLoading.value) return
  if (!heartModeChannel) {
    heartModeChannel = new BroadcastChannel(HEART_MODE_CHANNEL)
    heartModeChannel.onmessage = handleControlMessage
  }

  heartModeRequestId =
    typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  heartModeLoading.value = true
  heartModeState.value = 'loading'

  heartModeChannel.postMessage({
    type: 'start-heart-mode-from-likes',
    requestId: heartModeRequestId,
    timestamp: Date.now()
  })

  if (heartModeTimeout !== null) window.clearTimeout(heartModeTimeout)
  heartModeTimeout = window.setTimeout(() => {
    heartModeLoading.value = false
    heartModeState.value = 'timeout'
    heartModeTimeout = null
  }, 15000)
}

const handleControlMessage = (event: MessageEvent) => {
  if (event.data?.type === 'player-snapshot') {
    const data = event.data.data ?? {}
    if (typeof data.playing === 'boolean') isPlaying.value = data.playing
    if (typeof data.isLiked === 'boolean') isLiked.value = data.isLiked
    if (typeof data.pic === 'string' && data.pic.length > 0) coverUrl.value = data.pic
    return
  }

  if (event.data?.type !== 'heart-mode-result' || event.data?.requestId !== heartModeRequestId) {
    return
  }

  if (event.data?.status === 'loading') {
    heartModeState.value = 'loading'
    return
  }
  heartModeState.value = event.data?.status === 'success' ? 'success' : 'error'
  heartModeLoading.value = false
  if (heartModeTimeout !== null) {
    window.clearTimeout(heartModeTimeout)
    heartModeTimeout = null
  }
}

const handleStorage = (event: StorageEvent) => {
  if (event.key === 'player') updatePlayerSnapshot()
  if (event.key === COVER_CONTROLS_STORAGE_KEY || event.key === OSD_STORAGE_KEY) {
    scheduleControlHitRegionReport()
  }
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

onMounted(async () => {
  updatePlayerSnapshot()
  heartModeChannel = new BroadcastChannel(HEART_MODE_CHANNEL)
  heartModeChannel.onmessage = handleControlMessage
  heartModeChannel.postMessage({ type: 'request-player-snapshot', timestamp: Date.now() })
  window.addEventListener('storage', handleStorage)
  window.addEventListener('message', handleOsdStatusMessage)
  window.addEventListener('resize', scheduleControlHitRegionReport)
  window.mainApi?.on('update-osd-playing-status', handlePlayingStatus)

  await nextTick()
  if (rootRef.value) {
    hitRegionObserver = new ResizeObserver(scheduleControlHitRegionReport)
    hitRegionObserver.observe(rootRef.value)
  }
  scheduleControlHitRegionReport()
})

onBeforeUnmount(() => {
  if (heartModeTimeout !== null) window.clearTimeout(heartModeTimeout)
  if (hitRegionFrame !== null) window.cancelAnimationFrame(hitRegionFrame)
  heartModeTimeout = null
  hitRegionFrame = null
  hitRegionObserver?.disconnect()
  hitRegionObserver = null
  heartModeChannel?.close()
  heartModeChannel = null
  window.removeEventListener('storage', handleStorage)
  window.removeEventListener('message', handleOsdStatusMessage)
  window.removeEventListener('resize', scheduleControlHitRegionReport)
  window.mainApi?.off('update-osd-playing-status', handlePlayingStatus)
  window.mainApi?.send('osd-control-hit-region', {
    enabled: false,
    locked: readOsdLocked(),
    x: 0,
    y: 0,
    width: 0,
    height: 0
  })
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

.control-heart-mode.loading {
  opacity: 0.72;
  cursor: wait;

  .svg-icon {
    animation: heart-mode-loading-pulse 0.8s ease-in-out infinite alternate;
  }
}

@keyframes heart-mode-loading-pulse {
  from {
    transform: scale(0.82);
    opacity: 0.55;
  }
  to {
    transform: scale(1.12);
    opacity: 1;
  }
}

.control-like .svg-icon {
  width: 10px;
  height: 10px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.72));
}

.hover-control {
  opacity: 0;
  pointer-events: none;
}

.controls-visible .hover-control {
  opacity: 1;
  pointer-events: auto;
}

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
</style>
