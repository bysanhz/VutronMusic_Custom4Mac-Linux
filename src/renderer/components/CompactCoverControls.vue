<template>
  <div
    class="compact-cover-controls"
    @mouseenter="isHover = true"
    @mouseleave="isHover = false"
  >
    <img
      class="compact-cover"
      :src="coverUrl"
      alt="当前歌曲封面"
      draggable="false"
    />

    <!-- ======== newADD start====== -->
    <button
        class="compact-like-button"
        :class="{ liked: isLiked }"
        :title="isLiked ? '取消喜欢' : '加入喜欢'"
        @click.stop="toggleLike"
        >
        <SvgIcon :icon-class="isLiked ? 'heart-solid' : 'heart'" />
    </button>
    <!-- =========== newADD end ======== -->

    <div v-show="isHover" class="compact-control-mask">
      <button
        class="compact-control-button"
        title="上一首"
        @click.stop="playPrev"
      >
        <SvgIcon icon-class="previous" />
      </button>

      <button
        class="compact-control-button compact-play-button"
        :title="isPlaying ? '暂停' : '播放'"
        @click.stop="playOrPause"
      >
        <SvgIcon :icon-class="isPlaying ? 'pause' : 'play'" />
      </button>

      <button
        class="compact-control-button"
        title="下一首"
        @click.stop="playNext"
      >
        <SvgIcon icon-class="next" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import SvgIcon from './SvgIcon.vue'

const DEFAULT_COVER =
  'https://p2.music.126.net/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg'

const isHover = ref(false)
const isPlaying = ref(false)
const coverUrl = ref(DEFAULT_COVER)
// ======== newADD start======
// 当前歌曲是否已经加入喜欢。
// 点击按钮时先在桌面歌词窗口中立即切换视觉状态，
// 同时通过 IPC 通知主窗口执行真正的收藏或取消收藏。
const isLiked = ref(false)
// =========== newADD end ========

/**
 * 从持久化的播放器状态中读取当前封面和播放状态。
 *
 * 桌面歌词窗口是独立 renderer，无法直接复用主窗口中的 player store 实例，
 * 因此第一版从共享 localStorage 的 player 状态读取。
 *
 * Returns:
 *   无返回值，直接更新 coverUrl 和 isPlaying。
 *
 * Raises:
 *   JSON 内容损坏时会被 catch，不影响桌面歌词窗口继续运行。
 */
const updatePlayerSnapshot = () => {
  try {
    const player = JSON.parse(localStorage.getItem('player') || '{}')

    const track = player.currentTrack
    const album = track?.album ?? track?.al

    coverUrl.value =
      player.pic ||
      album?.picUrl ||
      track?.picUrl ||
      DEFAULT_COVER

    isPlaying.value = Boolean(player.playing)
  } catch (error) {
    console.warn('[CompactCoverControls] 读取播放器状态失败：', error)
  }
}

/**
 * 请求主窗口播放上一首歌曲。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   mainApi 不存在时不会抛出异常。
 */
const playPrev = () => {
  window.mainApi?.send('from-osd', 'playPrev')
}

/**
 * 请求主窗口切换播放或暂停状态。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   mainApi 不存在时不会抛出异常。
 */
const playOrPause = () => {
  window.mainApi?.send('from-osd', 'playOrPause')
}

/**
 * 请求主窗口播放下一首歌曲。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   mainApi 不存在时不会抛出异常。
 */
const playNext = () => {
  window.mainApi?.send('from-osd', 'playNext')
}

// ======== newADD start======
/**
 * 请求主播放器切换当前歌曲的喜欢状态。
 *
 * 这里不直接修改 isLiked，避免桌面歌词窗口显示的状态
 * 与主播放器真实收藏状态不一致。主窗口处理完成后，会通过
 * update-osd-status 消息返回最新的 isLiked。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   mainApi 不存在时不会抛出异常。
 */
const toggleLike = () => {
  window.mainApi?.send('from-osd', 'likeTrack')
}
// =========== newADD end ========

/**
 * 监听其他窗口写入 player 本地状态。
 *
 * Args:
 *   event: 浏览器 storage 事件。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   不主动抛出异常。
 */
const handleStorage = (event: StorageEvent) => {
  if (event.key === 'player') {
    updatePlayerSnapshot()
  }
}

// ======== newADD start======
/**
 * 接收主播放器发送给桌面歌词窗口的状态更新。
 *
 * 当前主要同步：
 * - isLiked：当前歌曲是否已加入喜欢；
 * - playing：当前歌曲是否正在播放；
 * - pic：当前歌曲封面地址。
 *
 * Args:
 *   event: 主窗口通过 MessagePort 转发的消息事件。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   消息字段不存在时直接忽略。
 */
const handleOsdStatusMessage = (event: MessageEvent) => {
  if (event.data?.type !== 'update-osd-status') return

  const data = event.data.data ?? {}

  if (typeof data.isLiked === 'boolean') {
    isLiked.value = data.isLiked
  }

  if (typeof data.playing === 'boolean') {
    isPlaying.value = data.playing
  }

  if (typeof data.pic === 'string' && data.pic.length > 0) {
    coverUrl.value = data.pic
  }
}
// =========== newADD end ========

onMounted(() => {
  updatePlayerSnapshot()

  window.addEventListener('storage', handleStorage)
  // ======== newADD start======
  window.addEventListener('message', handleOsdStatusMessage)
  // =========== newADD end ========
  window.mainApi?.on(
    'update-osd-playing-status',
    (_event: unknown, value: boolean) => {
      isPlaying.value = value
    }
  )
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorage)
  // ======== newADD start======
  window.removeEventListener('message', handleOsdStatusMessage)
  // =========== newADD end ========
})
</script>

<style scoped lang="scss">
.compact-cover-controls {
  position: relative;

  width: 52px;
  height: 52px;
  flex-shrink: 0;

  overflow: hidden;
  border-radius: 7px;

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

.compact-control-mask {
  position: absolute;
  inset: 0;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;

  background: rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(2px);
}

.compact-control-button {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 15px;
  height: 24px;
  padding: 0;

  border: none;
  outline: none;
  border-radius: 4px;

  color: white;
  background: transparent;
  cursor: pointer;

  .svg-icon {
    width: 11px;
    height: 11px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  &:active {
    transform: scale(0.9);
  }
}

.compact-play-button {
  width: 18px;

  .svg-icon {
    width: 14px;
    height: 14px;
  }
}

/* ======== newADD start====== */
/*
 * 封面右上角爱心按钮。
 *
 * 采用绝对定位，不参与中间三个播放按钮的 flex 布局，
 * 因此不会压缩上一首、播放暂停和下一首按钮。
 */
.compact-like-button {
  position: absolute;
  top: 2px;
  right: 2px;

  z-index: 3;

  display: flex;
  align-items: center;
  justify-content: center;

  width: 18px;
  height: 18px;
  padding: 0;

  border: none;
  outline: none;
  border-radius: 50%;

  color: rgba(255, 255, 255, 0.92);
  background: rgba(0, 0, 0, 0.48);

  cursor: pointer;
  opacity: 0.9;

  -webkit-app-region: no-drag;

  .svg-icon {
    width: 11px;
    height: 11px;
  }

  &:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.7);
    transform: scale(1.08);
  }

  &:active {
    transform: scale(0.92);
  }

  /*
   * 已喜欢状态使用红色。
   * 如果希望跟随主题色，可将这里改成：
   * color: var(--color-primary);
   */
  &.liked {
    color: #ff4d6d;
  }
}

/*
 * 悬停遮罩需要位于封面上方，但低于爱心按钮。
 */
.compact-control-mask {
  z-index: 2;
}
/* =========== newADD end ======== */

</style>