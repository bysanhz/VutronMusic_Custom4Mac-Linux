<template>
  <div
    id="main"
    :class="{
      'is-lock': isLock,
      'compact-mode': isCompactMode,
      'normal-mode': !isCompactMode
    }"
    :style="{ backgroundColor: bground.bg }"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!--
      普通桌面歌词模式继续使用原来的顶部控制栏。

      紧凑模式不再显示顶部控制栏：
      1. 节省 34px 高度；
      2. 播放控制移动到左侧封面悬停层；
      3. 使窗口可以压缩到约 56～70px 高。
    -->
    <div v-show="!isLock && !isCompactMode">
      <Header v-show="hover" :class="{ lock: isLock }" :style="headerStyle" />

      <div
        v-show="!hover"
        class="header-title"
        :class="{ show: bground.alpha }"
      >
        {{ title }}
      </div>
    </div>

    <!--
      普通模式锁定后的解锁按钮。

      Linux 中项目会自动取消 isLock，因此该按钮主要用于 macOS。
      紧凑模式下也不显示它，避免覆盖只有几十像素高的歌词区域。
    -->
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
    <!--
      紧凑桌面歌词模式。

      左侧：
      - 当前歌曲封面；
      - 鼠标悬停后显示上一首、播放暂停、下一首。

      右侧：
      - 继续使用原来的 OsdLyricContainer；
      - 保留逐字歌词、翻译、双行模式、滚动和对齐功能。
    -->
    <div v-if="isCompactMode" class="compact-osd-layout">
      <div class="compact-left-panel">
        <CompactCoverControls />
      </div>

      <div class="compact-lyric-panel">
        <LyricContainer tabindex="-1" />
      </div>
    </div>

    <!-- 普通模式保持原来的歌词容器 -->
    <LyricContainer v-else tabindex="-1" />
    <!-- =========== newADD end ======== -->

    <!-- ======== newADD start====== -->
    <!--
      自定义桌面歌词拖拽条。

      使用 mousemove + IPC 计算绝对位置，不使用
      -webkit-app-region: drag，从而保留你之前实现的
      “允许窗口越过 macOS 菜单栏边界”的拖拽方式。
    -->
    <div
      v-show="!isLock"
      class="osd-drag-bar"
      title="拖动桌面歌词窗口"
      @mousedown="startCustomOsdDrag"
    />
    <!-- =========== newADD end ======== -->
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
 * 判断当前桌面歌词是否使用紧凑模式。
 *
 * 详细说明：
 * 原项目使用 type === 'small' 表示 mini 桌面歌词窗口。
 * 这里直接把 small 模式映射为“封面控制区 + 双行歌词”的紧凑播放器，
 * normal 模式继续保留原来的完整桌面歌词界面。
 *
 * Returns:
 *   当桌面歌词类型为 small 时返回 true，否则返回 false。
 *
 * Raises:
 *   不抛出异常。
 */
const isCompactMode = computed(() => type.value === 'small')
// =========== newADD end ========

const lockStyle = computed(() => {
  const textColor = playedLrcColor.value === 'white' ? '#222' : 'white'

  return {
    color: textColor,
    backgroundColor: playedLrcColor.value
  }
})

const bground = computed(() => {
  const parts = backgroundColor.value.slice(5, -1).split(',')

  const red = parseInt(parts[0].trim(), 10)
  const green = parseInt(parts[1].trim(), 10)
  const blue = parseInt(parts[2].trim(), 10)
  const alpha = parseFloat(parts[3].trim())

  if (!hover.value || isLock.value) {
    return {
      bg: backgroundColor.value,
      alpha
    }
  }

  return {
    bg: `rgba(${red}, ${green}, ${blue}, ${Math.min(alpha + 0.2, 1)})`,
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
 *   无返回值，直接修改 Pinia 中的 isLock。
 *
 * Raises:
 *   不抛出异常。
 */
const handleLock = () => {
  isLock.value = !isLock.value
}

// ======== newADD start======
/**
 * 自定义拖拽过程中是否处于按住状态。
 */
const customOsdDragging = ref(false)

/**
 * 保存自定义拖拽开始时的鼠标位置和窗口位置。
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
 * 开始自定义桌面歌词窗口拖拽。
 *
 * 详细说明：
 * 记录按下鼠标时的屏幕坐标和窗口边界，然后注册全局
 * mousemove 和 mouseup 监听。后续移动距离由当前位置减去
 * 起始位置得到。
 *
 * Args:
 *   event: 底部拖拽条触发的鼠标按下事件。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   mainApi 不存在时不会在此函数中抛出异常。
 */
const startCustomOsdDrag = (event: MouseEvent) => {
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

  window.addEventListener('mousemove', handleCustomOsdDrag)
  window.addEventListener('mouseup', stopCustomOsdDrag)
}

/**
 * 根据鼠标位移发送新的桌面歌词窗口绝对位置。
 *
 * 详细说明：
 * dx 和 dy 表示鼠标相对起始点的位移，将它们加到原始窗口坐标，
 * 得到新的 BrowserWindow x、y。宽度和高度保持拖拽开始时的值，
 * 避免移动窗口时发生尺寸变化。
 *
 * Args:
 *   event: 当前 mousemove 鼠标事件。
 *
 * Returns:
 *   无返回值，通过 IPC 向主进程发送窗口边界。
 *
 * Raises:
 *   mainApi 不存在时使用可选链静默跳过。
 */
const handleCustomOsdDrag = (event: MouseEvent) => {
  if (!customOsdDragging.value) return

  const dx = event.screenX - customOsdDragStart.value.mouseX
  const dy = event.screenY - customOsdDragStart.value.mouseY

  window.mainApi?.send('drag-osd-window-absolute', {
    x: customOsdDragStart.value.windowX + dx,
    y: customOsdDragStart.value.windowY + dy,
    width: customOsdDragStart.value.width,
    height: customOsdDragStart.value.height
  })
}

/**
 * 结束自定义窗口拖拽并清理全局监听器。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   不抛出异常。
 */
const stopCustomOsdDrag = () => {
  customOsdDragging.value = false

  window.removeEventListener('mousemove', handleCustomOsdDrag)
  window.removeEventListener('mouseup', stopCustomOsdDrag)
}
// =========== newADD end ========

/**
 * 通知主进程鼠标已经离开桌面歌词窗口。
 *
 * 详细说明：
 * 原项目根据该消息恢复锁定状态或处理鼠标穿透行为。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   mainApi 不存在时使用可选链静默跳过。
 */
const handleDocumentMouseLeave = () => {
  hover.value = false
  window.mainApi?.send('windowMouseleave')
}

/**
 * 接收主窗口发给桌面歌词窗口的状态更新。
 *
 * Args:
 *   event: window message 事件。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   消息字段缺失时不会主动抛出异常。
 */
const handleOsdStatusMessage = (event: MessageEvent) => {
  if (event.data.type !== 'update-osd-status') return

  for (const [key, value] of Object.entries(event.data.data) as [
    string,
    any
  ][]) {
    if (key === 'title') {
      title.value = value
    }
  }
}

document.addEventListener('mouseleave', handleDocumentMouseLeave)
window.addEventListener('message', handleOsdStatusMessage)

window.mainApi?.on(
  'mouseInWindow',
  (_event: unknown, value: boolean) => {
    hover.value = value
  }
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
})
</script>

<style lang="scss" scoped>
#main {
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

/* 普通桌面歌词继续保留原来的窗口内边距。 */
#main.normal-mode {
  padding: 10px 20px;
}

/* ======== newADD start====== */
/*
 * 紧凑模式尽可能减少无效空间。
 *
 * 推荐窗口尺寸：
 * 宽度：240～300px
 * 高度：60～76px
 */
#main.compact-mode {
  padding: 3px 6px 7px;
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
 * 左侧固定 60px：
 * 可容纳 52×52px 封面和悬停按钮。
 *
 * 右侧 minmax(0, 1fr)：
 * 自动占据剩余空间；
 * min-width: 0 保证窄窗口下歌词可以正确压缩。
 */
.compact-osd-layout {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  column-gap: 4px;
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
 * OsdLyricContainer 原来使用：
 * height: calc(100vh - 54px)
 *
 * 在紧凑模式中已经没有顶部 34px 工具栏，
 * 因此覆盖为 100%，让双行歌词完整使用紧凑窗口高度。
 *
 * 这里只改高度和容器尺寸，不改变歌词内部 display，
 * 避免再次破坏歌词滚动定位。
 */
.compact-lyric-panel :deep(.container) {
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}

/*
 * mini 模式原来的歌词容器可能存在额外的外边距或内边距。
 * 这里只去除 lyric 外部横向空白，不改变行高和内部 span 结构。
 */
.compact-lyric-panel :deep(.lyric) {
  box-sizing: border-box;
  max-width: 100%;
}

/*
 * 桌面歌词底部拖拽条。
 *
 * 使用自定义 mousemove + IPC 拖动，不能使用
 * -webkit-app-region: drag。
 */
.osd-drag-bar {
  position: absolute;
  left: 50%;
  bottom: 2px;

  transform: translateX(-50%);

  width: 52px;
  height: 5px;

  border-radius: 999px;
  background: rgba(255, 255, 255, 0);
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.18);

  cursor: move;
  z-index: 9999;

  -webkit-app-region: no-drag;
}

/* 普通模式下保留稍宽的拖拽条。 */
#main.normal-mode .osd-drag-bar {
  width: 72px;
  height: 7px;
  bottom: 3px;
}

.osd-drag-bar:hover {
  background: rgba(255, 255, 255, 0.52);
}
/* =========== newADD end ======== */
</style>