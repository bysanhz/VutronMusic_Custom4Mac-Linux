<template>
  <div>
    <div v-show="showVerticalScrollbar" class="scrollbar scrollbar--vertical">
      <div
        :class="{ active: verticalActive }"
        class="thumbContainer thumbContainer--vertical"
        :style="verticalThumbStyle"
        @mouseenter="handleVerticalMouseenter"
        @mouseleave="handleVerticalMouseleave"
        @mousedown="handleVerticalDragStart"
      >
        <div></div>
      </div>
    </div>

    <!-- ======== newADD start====== -->
    <!--
      横向辅助滚动条固定在底部播放器上方。
      支持拖拽滑块，也支持鼠标停留在辅助条上时使用滚轮上下滚动来左右移动页面。
    -->
    <div
      v-show="horizontalScrollable"
      class="scrollbar scrollbar--horizontal"
      :class="{ active: horizontalActive }"
      :style="horizontalTrackStyle"
      @mouseenter="horizontalActive = true"
      @mouseleave="horizontalActive = false"
      @wheel.prevent="handleHorizontalWheel"
    >
      <div
        class="thumbContainer thumbContainer--horizontal"
        :style="horizontalThumbStyle"
        @mousedown="handleHorizontalDragStart"
      >
        <div></div>
      </div>
    </div>
    <!-- =========== newADD end ======== -->
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref, computed, inject, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import eventBus from '../utils/eventBus'
import { useNormalStateStore } from '../store/state'
import { useSettingsStore } from '../store/settings'
import { useRouter } from 'vue-router'

const verticalShow = ref(false)
const verticalActive = ref(false)
const isVerticalDragging = ref(false)
const verticalDragStartY = ref(0)
const verticalHideTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const router = useRouter()
const updateUserSelect = inject('updateUserSelect', ref(false))

const normalState = useNormalStateStore()
const { scrollbar } = storeToRefs(normalState)

const settingsStore = useSettingsStore()
const { general } = storeToRefs(settingsStore)

const marginTop = computed(() => {
  return window.env?.isMac || general.value.useCustomTitlebar ? 84 : 64
})

const scrollHeight = computed(() => {
  return scrollbar.value.active
    ? scrollbar.value.instances[scrollbar.value.active].listHeight - marginTop.value
    : 0
})

const clientHeight = computed(() => {
  return scrollbar.value.active
    ? scrollbar.value.instances[scrollbar.value.active].containerHeight - marginTop.value
    : 0
})

const scrollTop = computed(() => {
  return scrollbar.value.active ? scrollbar.value.instances[scrollbar.value.active].scrollTop : 0
})

const showVerticalScrollbar = computed(() => {
  return verticalShow.value && scrollHeight.value > clientHeight.value + 1
})

watch(scrollTop, () => {
  verticalShow.value = true
  setVerticalScrollbarHideTimeout()
})

watch(
  () => scrollbar.value.active,
  (value) => {
    if (!value) {
      if (verticalHideTimer.value) clearTimeout(verticalHideTimer.value)
      verticalHideTimer.value = null
      verticalShow.value = false
    }
  }
)

const verticalThumbStyle = computed(() => {
  if (!scrollHeight.value || !clientHeight.value) return {}
  let thumbHeight = ~~((clientHeight.value / scrollHeight.value) * clientHeight.value)
  const top = ~~((scrollTop.value / scrollHeight.value) * clientHeight.value)
  thumbHeight = Math.max(thumbHeight, 30)
  return { height: `${thumbHeight}px`, transform: `translateY(${top}px)` }
})

const handleVerticalMouseenter = () => {
  verticalActive.value = true
}

const scrollMainTo = inject('scrollMainTo', (to: number, behavior: 'smooth' | 'instant') => {})

const handleVerticalMouseleave = () => {
  setVerticalScrollbarHideTimeout()
  verticalActive.value = false
}

const setVerticalScrollbarHideTimeout = () => {
  if (verticalHideTimer.value) clearTimeout(verticalHideTimer.value)
  verticalHideTimer.value = setTimeout(() => {
    if (!verticalActive.value) verticalShow.value = false
    verticalHideTimer.value = null
  }, 4000)
}

const handleVerticalDragStart = (event: MouseEvent) => {
  event.preventDefault()
  isVerticalDragging.value = true
  verticalDragStartY.value = event.clientY
  updateUserSelect.value = true
  eventBus.emit('update-start')
  document.addEventListener('mousemove', handleVerticalDragMove)
  document.addEventListener('mouseup', handleVerticalDragEnd)
}

const handleVerticalDragMove = (event: MouseEvent) => {
  if (!isVerticalDragging.value || !clientHeight.value) return
  const offset = ~~(
    ((event.clientY - verticalDragStartY.value) / clientHeight.value) * scrollHeight.value
  )
  eventBus.emit('update-scroll-bar', { active: scrollbar.value.active, offset })
}

const handleVerticalDragEnd = () => {
  isVerticalDragging.value = false
  updateUserSelect.value = false
  eventBus.emit('update-done')
  document.removeEventListener('mousemove', handleVerticalDragMove)
  document.removeEventListener('mouseup', handleVerticalDragEnd)
}

// ======== newADD start======
const horizontalActive = ref(false)
const isHorizontalDragging = ref(false)
const horizontalDragStartX = ref(0)
const horizontalDragStartScrollLeft = ref(0)
const horizontalScrollLeft = ref(0)
const horizontalScrollWidth = ref(0)
const horizontalClientWidth = ref(0)
const horizontalTrackLeft = ref(0)
const horizontalTrackRight = ref(16)
const horizontalTrackBottom = ref(64)
let mainElement: HTMLElement | null = null
let horizontalSyncFrame: number | null = null
let horizontalCheckTimer: number | null = null

const horizontalScrollable = computed(() => {
  return horizontalScrollWidth.value > horizontalClientWidth.value + 2
})

const horizontalThumbWidth = computed(() => {
  if (!horizontalScrollWidth.value || !horizontalClientWidth.value) return 0
  return Math.max(
    42,
    (horizontalClientWidth.value / horizontalScrollWidth.value) * horizontalClientWidth.value
  )
})

const horizontalThumbStyle = computed(() => {
  if (!horizontalScrollable.value) return {}

  const scrollableDistance = horizontalScrollWidth.value - horizontalClientWidth.value
  const movableDistance = Math.max(0, horizontalClientWidth.value - horizontalThumbWidth.value)
  const left =
    scrollableDistance > 0
      ? (horizontalScrollLeft.value / scrollableDistance) * movableDistance
      : 0

  return {
    width: `${horizontalThumbWidth.value}px`,
    transform: `translateX(${Math.max(0, Math.min(left, movableDistance))}px)`
  }
})

const horizontalTrackStyle = computed(() => ({
  left: `${horizontalTrackLeft.value}px`,
  right: `${horizontalTrackRight.value}px`,
  bottom: `${horizontalTrackBottom.value}px`
}))

const syncHorizontalMetrics = () => {
  horizontalSyncFrame = null
  mainElement = document.getElementById('main')
  if (!mainElement) return

  const mainRect = mainElement.getBoundingClientRect()
  const playerElement = document.querySelector<HTMLElement>('.player')
  const playerRect = playerElement?.getBoundingClientRect()
  const playerVisible = Boolean(
    playerElement &&
      playerRect &&
      playerRect.height > 0 &&
      window.getComputedStyle(playerElement).display !== 'none'
  )

  horizontalScrollLeft.value = mainElement.scrollLeft
  horizontalScrollWidth.value = mainElement.scrollWidth
  horizontalClientWidth.value = mainElement.clientWidth
  horizontalTrackLeft.value = Math.max(0, mainRect.left)
  horizontalTrackRight.value = Math.max(16, window.innerWidth - mainRect.right + 16)
  horizontalTrackBottom.value = playerVisible ? Math.round(playerRect!.height) : 0
}

const scheduleHorizontalMetricsSync = () => {
  if (horizontalSyncFrame !== null) return
  horizontalSyncFrame = window.requestAnimationFrame(syncHorizontalMetrics)
}

const handleMainScroll = () => {
  if (!mainElement) return
  horizontalScrollLeft.value = mainElement.scrollLeft
  horizontalScrollWidth.value = mainElement.scrollWidth
  horizontalClientWidth.value = mainElement.clientWidth
}

const handleHorizontalWheel = (event: WheelEvent) => {
  if (!mainElement || !horizontalScrollable.value) return
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  mainElement.scrollLeft += delta
  handleMainScroll()
}

const handleHorizontalDragStart = (event: MouseEvent) => {
  if (!mainElement || !horizontalScrollable.value) return
  event.preventDefault()
  isHorizontalDragging.value = true
  horizontalActive.value = true
  horizontalDragStartX.value = event.clientX
  horizontalDragStartScrollLeft.value = mainElement.scrollLeft
  updateUserSelect.value = true
  document.addEventListener('mousemove', handleHorizontalDragMove)
  document.addEventListener('mouseup', handleHorizontalDragEnd)
}

const handleHorizontalDragMove = (event: MouseEvent) => {
  if (!isHorizontalDragging.value || !mainElement) return

  const movableDistance = horizontalClientWidth.value - horizontalThumbWidth.value
  const scrollableDistance = horizontalScrollWidth.value - horizontalClientWidth.value
  if (movableDistance <= 0 || scrollableDistance <= 0) return

  const pointerOffset = event.clientX - horizontalDragStartX.value
  const scrollOffset = (pointerOffset / movableDistance) * scrollableDistance
  const left = Math.max(
    0,
    Math.min(horizontalDragStartScrollLeft.value + scrollOffset, scrollableDistance)
  )

  mainElement.scrollLeft = left
  horizontalScrollLeft.value = left
}

const handleHorizontalDragEnd = () => {
  isHorizontalDragging.value = false
  horizontalActive.value = false
  updateUserSelect.value = false
  document.removeEventListener('mousemove', handleHorizontalDragMove)
  document.removeEventListener('mouseup', handleHorizontalDragEnd)
}

const bindMainElement = () => {
  const nextMainElement = document.getElementById('main')
  if (nextMainElement === mainElement) {
    scheduleHorizontalMetricsSync()
    return
  }

  mainElement?.removeEventListener('scroll', handleMainScroll)
  mainElement = nextMainElement
  mainElement?.addEventListener('scroll', handleMainScroll, { passive: true })
  scheduleHorizontalMetricsSync()
}
// =========== newADD end ========

const removeBeforeRouteGuard = router.beforeEach((_to, _from, next) => {
  verticalShow.value = false
  scrollMainTo(0, 'instant')
  next()
})

const removeAfterRouteGuard = router.afterEach(() => {
  nextTick(() => {
    bindMainElement()
  })
})

onMounted(() => {
  nextTick(() => {
    bindMainElement()
  })
  window.addEventListener('resize', scheduleHorizontalMetricsSync, { passive: true })
  horizontalCheckTimer = window.setInterval(bindMainElement, 800)
})

onBeforeUnmount(() => {
  if (verticalHideTimer.value) clearTimeout(verticalHideTimer.value)
  if (horizontalCheckTimer !== null) window.clearInterval(horizontalCheckTimer)
  if (horizontalSyncFrame !== null) window.cancelAnimationFrame(horizontalSyncFrame)

  mainElement?.removeEventListener('scroll', handleMainScroll)
  window.removeEventListener('resize', scheduleHorizontalMetricsSync)
  document.removeEventListener('mousemove', handleVerticalDragMove)
  document.removeEventListener('mouseup', handleVerticalDragEnd)
  document.removeEventListener('mousemove', handleHorizontalDragMove)
  document.removeEventListener('mouseup', handleHorizontalDragEnd)
  removeBeforeRouteGuard()
  removeAfterRouteGuard()
})
</script>

<style scoped lang="scss">
.scrollbar--vertical {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 16px;
  z-index: 1000;

  .thumbContainer--vertical {
    margin-top: v-bind('`${marginTop}px`');

    div {
      transition: background 0.4s;
      position: absolute;
      right: 4px;
      width: 8px;
      height: 100%;
      border-radius: 4px;
      background: rgba(128, 128, 128, 0.38);
    }
  }

  .thumbContainer--vertical.active div {
    background: rgba(128, 128, 128, 0.58);
  }
}

/* ======== newADD start====== */
.scrollbar--horizontal {
  position: fixed;
  height: 16px;
  z-index: 1000;
  box-sizing: border-box;
  touch-action: none;
  opacity: 0.78;
  transition: opacity 0.2s ease;

  &.active {
    opacity: 1;
  }

  .thumbContainer--horizontal {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 16px;
    min-width: 42px;
    cursor: ew-resize;

    div {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 4px;
      height: 8px;
      border-radius: 4px;
      background: rgba(128, 128, 128, 0.38);
      transition: background 0.2s ease;
    }
  }

  &:hover .thumbContainer--horizontal div,
  &.active .thumbContainer--horizontal div {
    background: rgba(128, 128, 128, 0.58);
  }
}
/* =========== newADD end ======== */
</style>
