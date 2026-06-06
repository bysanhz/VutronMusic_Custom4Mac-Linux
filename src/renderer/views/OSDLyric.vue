<template>
  <div
    id="main"
    :class="{
      'is-lock': isLock,
      'compact-mode': isCompactMode,
      'normal-mode': !isCompactMode,
      'is-custom-dragging': customOsdDragging
    }"
    :style="{ backgroundColor: bground.bg }"
    @mouseenter="hover = true"
    @mouseleave="handleMainMouseLeave"
  >
    <!--
      普通桌面歌词模式继续使用原来的顶部控制栏。

      紧凑模式不再显示顶部控制栏：
      1. 节省顶部空间；
      2. 播放控制移动到封面悬停区域；
      3. 允许桌面歌词窗口压缩到较小尺寸。
    -->
    <div v-show="!isLock && !isCompactMode">
      <Header
        v-show="hover"
        :class="{ lock: isLock }"
        :style="headerStyle"
      />

      <div
        v-show="!hover"
        class="header-title"
        :class="{ show: bground.alpha }"
      >
        {{ title }}
      </div>
    </div>

    <!-- 普通模式锁定后的解锁按钮 -->
    <div
      v-show="isLock && !isCompactMode"
      class="control-lock"
      tabindex="-1"
    >
      <button
        v-if="!isLinux"
        v-show="showButtonWhenLock"
        id="osd-lock"
        class="btn btn-lock"
        :style="lockStyle"
        tabindex="-1"
        @click="handleLock"
      >
        <SvgIcon
          icon-class="lock"
          style="margin-right: 4px"
          tabindex="-1"
        />
        解锁
      </button>
    </div>

    <!-- ======== newADD start====== -->
    <!-- 紧凑桌面歌词布局 -->
    <div
      v-if="isCompactMode"
      class="compact-osd-layout"
    >
      <div class="compact-left-panel">
        <CompactCoverControls />
      </div>

      <div class="compact-lyric-panel">
        <LyricContainer tabindex="-1" />
      </div>
    </div>

    <!-- 普通模式继续使用原始歌词容器 -->
    <LyricContainer
      v-else
      tabindex="-1"
    />
    <!-- =========== newADD end ======== -->

    <!-- ======== newADD start====== -->
    <!--
      底部自定义移动条。

      实际鼠标命中区域高于视觉细条，方便鼠标定位。
      移动使用 mousemove + IPC，不使用 -webkit-app-region: drag。
    -->
    <div
      v-show="!isLock"
      class="osd-drag-bar"
      title="拖动桌面歌词窗口"
      @mousedown="startCustomOsdDrag"
    />

    <!--
      无边框窗口四边透明命中区域。

      这些元素不显示任何内容，只负责显示相应的缩放鼠标样式。
    -->
    <div
      v-show="!isLock"
      class="resize-edge resize-edge-top"
    />
    <div
      v-show="!isLock"
      class="resize-edge resize-edge-right"
    />
    <div
      v-show="!isLock"
      class="resize-edge resize-edge-bottom"
    />
    <div
      v-show="!isLock"
      class="resize-edge resize-edge-left"
    />

    <!-- 无边框窗口四角透明命中区域 -->
    <div
      v-show="!isLock"
      class="resize-corner resize-corner-top-left"
    />
    <div
      v-show="!isLock"
      class="resize-corner resize-corner-top-right"
    />
    <div
      v-show="!isLock"
      class="resize-corner resize-corner-bottom-right"
    />
    <div
      v-show="!isLock"
      class="resize-corner resize-corner-bottom-left"
    />
    <!-- =========== newADD end ======== -->
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref
} from 'vue'
import { storeToRefs } from 'pinia'

import Header from '../components/OsdHeader.vue'
import LyricContainer from '../components/OsdLyricContainer.vue'
import SvgIcon from '../components/SvgIcon.vue'

// ======== newADD start======
import CompactCoverControls from '../components/CompactCoverControls.vue'
// =========== newADD end ========

import { useOsdLyricStore } from '../store/osdLyric'

const isLinux = window.env?.isLinux

const osdLyricStore = useOsdLyricStore()

const {
  isLock,
  type,
  playedLrcColor,
  backgroundColor,
  showButtonWhenLock
} = storeToRefs(osdLyricStore)

const hover = ref(false)
const title = ref('听你想听的音乐')

// ======== newADD start======
/**
 * 判断当前是否为紧凑桌面歌词模式。
 *
 * 详细说明：
 * 原项目使用 `small` 表示 mini 桌面歌词窗口。
 * 这里将 small 模式映射为封面控制区和双行歌词组成的紧凑布局。
 *
 * Returns:
 *   当前 type 为 small 时返回 true，否则返回 false。
 *
 * Raises:
 *   不抛出异常。
 */
const isCompactMode = computed(() => type.value === 'small')
// =========== newADD end ========

const lockStyle = computed(() => {
  const textColor =
    playedLrcColor.value === 'white'
      ? '#222'
      : 'white'

  return {
    color: textColor,
    backgroundColor: playedLrcColor.value
  }
})

const bground = computed(() => {
  const parts = backgroundColor.value
    .slice(5, -1)
    .split(',')

  const red = parseInt(parts[0]?.trim() || '0', 10)
  const green = parseInt(parts[1]?.trim() || '0', 10)
  const blue = parseInt(parts[2]?.trim() || '0', 10)
  const alpha = parseFloat(parts[3]?.trim() || '0')

  if (!hover.value || isLock.value) {
    return {
      bg: backgroundColor.value,
      alpha
    }
  }

  return {
    bg: `rgba(${red}, ${green}, ${blue}, ${Math.min(
      alpha + 0.2,
      1
    )})`,
    alpha
  }
})

const headerStyle = computed(() => {
  return {
    opacity: hover.value ? 1 : 0
  }
})

/**
 * 切换桌面歌词窗口锁定状态。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   不抛出异常。
 */
const handleLock = () => {
  isLock.value = !isLock.value
}

// ======== newADD start======
/**
 * 当前是否正在通过底部移动条拖动桌面歌词窗口。
 */
const customOsdDragging = ref(false)

/**
 * 保存开始拖动时的鼠标位置与窗口边界。
 */
const customOsdDragStart = ref({
  mouseX: 0,
  mouseY: 0,
  windowX: 0,
  windowY: 0,
  width: 0,
  height: 0
})

/**
 * 开始自定义桌面歌词窗口拖动。
 *
 * 详细说明：
 * 记录鼠标按下时的屏幕坐标、窗口坐标以及窗口尺寸。
 * 后续根据鼠标的屏幕位移计算窗口的新绝对位置。
 *
 * Args:
 *   event: 底部移动条触发的鼠标按下事件。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   不抛出异常。
 */
const startCustomOsdDrag = (event: MouseEvent) => {
  if (event.button !== 0) return

  event.preventDefault()
  event.stopPropagation()

  customOsdDragging.value = true

  customOsdDragStart.value = {
    mouseX: event.screenX,
    mouseY: event.screenY,
    windowX: window.screenX,
    windowY: window.screenY,
    width: window.outerWidth,
    height: window.outerHeight
  }

  window.addEventListener(
    'mousemove',
    handleCustomOsdDrag
  )

  window.addEventListener(
    'mouseup',
    stopCustomOsdDrag
  )

  window.addEventListener(
    'blur',
    stopCustomOsdDrag
  )
}

/**
 * 根据鼠标位移移动桌面歌词窗口。
 *
 * Args:
 *   event: 当前 mousemove 鼠标事件。
 *
 * Returns:
 *   无返回值，通过 IPC 向主进程发送窗口绝对坐标。
 *
 * Raises:
 *   mainApi 不存在时使用可选链静默跳过。
 */
const handleCustomOsdDrag = (event: MouseEvent) => {
  if (!customOsdDragging.value) return

  const dx =
    event.screenX -
    customOsdDragStart.value.mouseX

  const dy =
    event.screenY -
    customOsdDragStart.value.mouseY

  window.mainApi?.send(
    'drag-osd-window-absolute',
    {
      x:
        customOsdDragStart.value.windowX +
        dx,

      y:
        customOsdDragStart.value.windowY +
        dy,

      width:
        customOsdDragStart.value.width,

      height:
        customOsdDragStart.value.height
    }
  )
}

/**
 * 结束自定义窗口拖动并清理全局监听器。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   不抛出异常。
 */
const stopCustomOsdDrag = () => {
  customOsdDragging.value = false

  window.removeEventListener(
    'mousemove',
    handleCustomOsdDrag
  )

  window.removeEventListener(
    'mouseup',
    stopCustomOsdDrag
  )

  window.removeEventListener(
    'blur',
    stopCustomOsdDrag
  )
}
// =========== newADD end ========

/**
 * 处理鼠标离开桌面歌词根容器。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   不抛出异常。
 */
const handleMainMouseLeave = () => {
  hover.value = false
}

/**
 * 通知主进程鼠标已经离开桌面歌词窗口。
 *
 * 详细说明：
 * 原项目使用此消息恢复锁定状态或处理鼠标穿透逻辑。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   mainApi 不存在时使用可选链静默跳过。
 */
const handleDocumentMouseLeave = () => {
  hover.value = false

  window.mainApi?.send(
    'windowMouseleave'
  )
}

/**
 * 接收主窗口发送给桌面歌词窗口的状态更新。
 *
 * Args:
 *   event: window message 事件。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   消息结构不完整时直接忽略。
 */
const handleOsdStatusMessage = (
  event: MessageEvent
) => {
  if (
    event.data?.type !==
    'update-osd-status'
  ) {
    return
  }

  const data = event.data.data ?? {}

  if (
    typeof data.title === 'string'
  ) {
    title.value = data.title
  }
}

/**
 * 接收主进程发送的鼠标是否位于窗口内的状态。
 *
 * Args:
 *   _event: Electron IPC 事件，本函数不使用。
 *   value: 鼠标是否位于桌面歌词窗口内。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   不抛出异常。
 */
const handleMouseInWindow = (
  _event: unknown,
  value: boolean
) => {
  hover.value = value
}

document.addEventListener(
  'mouseleave',
  handleDocumentMouseLeave
)

window.addEventListener(
  'message',
  handleOsdStatusMessage
)

window.mainApi?.on(
  'mouseInWindow',
  handleMouseInWindow
)

onMounted(() => {
  if (isLinux) {
    isLock.value = false
  }
})

onBeforeUnmount(() => {
  stopCustomOsdDrag()

  document.removeEventListener(
    'mouseleave',
    handleDocumentMouseLeave
  )

  window.removeEventListener(
    'message',
    handleOsdStatusMessage
  )

  window.removeEventListener(
    'mousemove',
    handleCustomOsdDrag
  )

  window.removeEventListener(
    'mouseup',
    stopCustomOsdDrag
  )

  window.removeEventListener(
    'blur',
    stopCustomOsdDrag
  )
})
</script>

<style lang="scss" scoped>
#main {
  /* ======== newADD start====== */
  /*
   * 窗口边缘和角落的透明鼠标命中区域大小。
   *
   * resize-edge-size：
   * 四条边的检测宽度。
   *
   * resize-corner-size：
   * 四个角的检测尺寸。
   */
  --resize-edge-size: 8px;
  --resize-corner-size: 14px;
  /* =========== newADD end ======== */

  position: relative;

  box-sizing: border-box;
  width: 100%;
  height: 100vh;

  border-radius: 4px;
  overflow: hidden;

  transition:
    background-color 0.3s ease,
    opacity 0.3s ease;
}

/* 普通桌面歌词模式内边距。 */
#main.normal-mode {
  padding: 10px 20px;
}

/* ======== newADD start====== */
/*
 * 紧凑桌面歌词模式内边距。
 *
 * 顺序：
 * 上、右、下、左。
 */
#main.compact-mode {
  padding: 0 3px 0 0;
}
/* =========== newADD end ======== */

.header {
  transition: opacity 0.3s;

  .lock {
    opacity: 0 !important;
  }
}

.header-title {
  display: flex;
  height: 34px;

  justify-content: center;
  align-items: center;

  opacity: 0;
  font-size: 16px;
  color: #fff;
}

.show {
  opacity: 1 !important;
}

.control-lock {
  width: 100%;
  height: 34px;
  z-index: 1;

  display: flex;
  justify-content: center;
  align-items: center;
}

.btn {
  display: flex;
  padding: 4px 10px;

  cursor: pointer;

  border: none;
  outline: none;
  background: none;
  border-radius: 4px;

  transition: opacity 0.3s ease;
}

/* ======== newADD start====== */
/*
 * 紧凑桌面歌词整体布局。
 *
 * 左侧固定 50px；
 * 右侧歌词自动占据剩余空间。
 */
.compact-osd-layout {
  display: grid;

  grid-template-columns:
    50px
    minmax(0, 1fr);

  column-gap: 1px;
  align-items: center;

  width: 100%;
  height: 100%;
  min-width: 0;
}

.compact-left-panel {
  display: flex;
  align-items: center;
  justify-content: center;

  min-width: 0;
  height: 100%;
}

.compact-lyric-panel {
  min-width: 0;
  height: 100%;

  overflow: hidden;
}

/*
 * 紧凑模式没有顶部工具栏，因此歌词容器使用全部高度。
 *
 * 不改变歌词内部 display，避免影响歌词滚动与逐字动画。
 */
.compact-lyric-panel :deep(.container) {
  width: 100%;
  height: 100%;
  min-width: 0;

  overflow: hidden;
}

.compact-lyric-panel :deep(.lyric) {
  box-sizing: border-box;
  max-width: 100%;
}

/*
 * 底部移动条的透明鼠标命中区域。
 *
 * 整体高度为 12px，方便鼠标定位；
 * 实际显示出来的细条由 ::before 绘制。
 *
 * 层级 10002 高于窗口下边缘和角落命中层，
 * 因此底部中央优先识别为移动操作。
 */
.osd-drag-bar {
  position: absolute;
  left: 50%;
  bottom: 0;

  transform: translateX(-50%);

  width: 72px;
  height: 12px;

  z-index: 10002;

  background: transparent;

  cursor: grab !important;
  pointer-events: auto;

  -webkit-app-region: no-drag;
}

/* 实际可见的底部移动细条。 */
.osd-drag-bar::before {
  content: '';

  position: absolute;
  left: 50%;
  bottom: 2px;

  transform: translateX(-50%);

  width: 52px;
  height: 4px;

  border-radius: 999px;

  background:
    rgba(255, 255, 255, 0);

  box-shadow:
    0 0 6px
    rgba(0, 0, 0, 0.18);

  pointer-events: none;

  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}

.osd-drag-bar:hover::before {
  background:
    rgba(255, 255, 255, 0.52);
}

.osd-drag-bar:active {
  cursor: grabbing !important;
}

/*
 * 自定义拖动期间，强制所有内部元素显示 grabbing，
 * 避免移动经过封面、歌词、按钮时光标发生跳变。
 */
#main.is-custom-dragging,
#main.is-custom-dragging *,
#main.is-custom-dragging .osd-drag-bar {
  cursor: grabbing !important;
}

/* 普通模式使用更宽的移动条。 */
#main.normal-mode .osd-drag-bar {
  width: 90px;
}

#main.normal-mode
  .osd-drag-bar::before {
  width: 72px;
}

/*
 * 窗口边缘与角落的透明鼠标命中层。
 *
 * 不显示背景，只设置位置、尺寸和对应 cursor。
 */
.resize-edge,
.resize-corner {
  position: absolute;

  z-index: 10000;

  background: transparent;
  pointer-events: auto;

  -webkit-app-region: no-drag;
}

/* 上边缘 */
.resize-edge-top {
  top: 0;
  left: var(--resize-corner-size);
  right: var(--resize-corner-size);

  height: var(--resize-edge-size);

  cursor: ns-resize !important;
}

/* 下边缘 */
.resize-edge-bottom {
  bottom: 0;
  left: var(--resize-corner-size);
  right: var(--resize-corner-size);

  height: var(--resize-edge-size);

  cursor: ns-resize !important;
}

/* 左边缘 */
.resize-edge-left {
  top: var(--resize-corner-size);
  bottom: var(--resize-corner-size);
  left: 0;

  width: var(--resize-edge-size);

  cursor: ew-resize !important;
}

/* 右边缘 */
.resize-edge-right {
  top: var(--resize-corner-size);
  right: 0;
  bottom: var(--resize-corner-size);

  width: var(--resize-edge-size);

  cursor: ew-resize !important;
}

/* 左上角 */
.resize-corner-top-left {
  top: 0;
  left: 0;

  width: var(--resize-corner-size);
  height: var(--resize-corner-size);

  cursor: nwse-resize !important;
}

/* 右上角 */
.resize-corner-top-right {
  top: 0;
  right: 0;

  width: var(--resize-corner-size);
  height: var(--resize-corner-size);

  cursor: nesw-resize !important;
}

/* 右下角 */
.resize-corner-bottom-right {
  right: 0;
  bottom: 0;

  width: var(--resize-corner-size);
  height: var(--resize-corner-size);

  cursor: nwse-resize !important;
}

/* 左下角 */
.resize-corner-bottom-left {
  bottom: 0;
  left: 0;

  width: var(--resize-corner-size);
  height: var(--resize-corner-size);

  cursor: nesw-resize !important;
}
/* =========== newADD end ======== */
</style>