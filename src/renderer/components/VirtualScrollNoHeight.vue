<template>
  <div
    ref="listRef"
    class="infinite-list-container"
    :class="{
      'infinite-list-container--virtualized': enableVirtualScroll,
      'infinite-list-container--outer-flow': !enableVirtualScroll
    }"
    :style="{ height: containerHeight + 'px' }"
    @scroll="scrollEvent"
  >
    <div class="infinite-list-phantom" :style="{ height: listHeight + 'px' }"></div>
    <div
      ref="loadMoreSentinelRef"
      class="load-more-sentinel"
      :style="{ top: Math.max(0, listHeight - 2) + 'px' }"
    ></div>
    <div v-if="showPosition" class="position">
      <slot name="position" :scroll-to-current="scrollTocurrent"></slot>
      <div @click="scrollToTop"><svg-icon icon-class="arrow-up-alt"></svg-icon></div>
    </div>
    <div :style="listStyles" class="infinite-list">
      <div
        v-for="row in visibleData"
        :id="row._key.toString()"
        ref="itemsRef"
        :key="row._key"
        class="infinite-list-item-container"
      >
        <slot name="default" :index="row._key" :item="row.value"></slot>
      </div>
      <div v-if="showFooter" ref="footerRef">
        <slot name="footer"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { storeToRefs } from 'pinia'
import { useNormalStateStore } from '../store/state'
import {
  ref,
  toRefs,
  onMounted,
  computed,
  nextTick,
  watch,
  onBeforeUnmount,
  onActivated,
  onDeactivated,
  inject
} from 'vue'
import SvgIcon from './SvgIcon.vue'
import eventBus from '../utils/eventBus'

type ScrollBehavior = 'auto' | 'instant' | 'smooth'

const props = withDefaults(
  defineProps<{
    list: T[]
    itemSize?: number
    columnNumber?: number
    aboveValue?: number
    belowValue?: number
    paddingBottom?: number
    showPosition?: boolean
    isEnd: boolean
    showFooter?: boolean
    gap?: number
    height?: number
    enableVirtualScroll?: boolean
    loadMore?: () => void | Promise<unknown>
  }>(),
  {
    itemSize: 65,
    columnNumber: 1,
    aboveValue: 2,
    belowValue: 2,
    paddingBottom: 64,
    showPosition: true,
    showFooter: true,
    gap: 4,
    height: 0,
    enableVirtualScroll: true,
    loadMore: () => {}
  }
)

const lock = ref(false)
const listRef = ref()
const footerRef = ref()
const loadMoreSentinelRef = ref()
const itemsRef = ref()
const startRow = ref(0)
const styleBefore = ref()
const startOffset = ref(0)
const position = ref<any[]>([])
const windowHeight = ref(window.innerHeight)
const scrollToIndex = ref(0)
const instanceId = ref('')
const { list, itemSize } = toRefs(props)

/**
 * Vue can briefly clear template refs while v-show/v-if/route transitions settle.
 * IntersectionObserver requires a real Element and throws synchronously for null refs,
 * so every observer lifecycle path resolves the element defensively.
 */
const getListElement = (): HTMLElement | null => {
  const element = listRef.value
  return element instanceof HTMLElement ? element : null
}

const normalState = useNormalStateStore()
const { enableScrolling, virtualScrolling } = storeToRefs(normalState)
const { registerInstance, unregisterInstance, updateScroll } = normalState

const _listData = computed(() => {
  return list.value.reduce<{ _key: number; value: T }[]>((init, cur, index) => {
    init.push({
      _key: index,
      value: cur
    })
    return init
  }, [])
})

const totalRowCount = computed(() => Math.ceil(_listData.value.length / props.columnNumber))

const listHeight = computed(() => {
  const totalRows = totalRowCount.value
  if (!props.enableVirtualScroll) {
    return (
      totalRows * itemSize.value +
      (props.showFooter ? footerHeight.value : 0) +
      (props.isEnd ? props.paddingBottom : 0)
    )
  }
  const idx = Math.floor((position.value.length - 1) / props.columnNumber) * props.columnNumber
  return (
    (position.value[idx]?.bottom || totalRows * itemSize.value) +
    (props.showFooter ? footerHeight.value : 0) +
    (props.isEnd ? props.paddingBottom : 0)
  )
})

const footerHeight = computed(() => footerRef.value?.clientHeight || 0)

const containerHeight = computed(() => {
  const navBarHeight = hasCustomTitleBar.value ? 84 : 64
  const winHeight = Math.max(0, windowHeight.value - navBarHeight - playerBarInset.value)
  const height = props.height || winHeight
  return props.enableVirtualScroll ? Math.min(height, listHeight.value) : listHeight.value
})

const contentTransform = computed(() => `translateY(${startOffset.value}px)`)
const anchorPoint = computed(() =>
  position.value.length ? position.value[startRow.value * props.columnNumber] : null
)
const visibleCount = computed(() => Math.max(1, Math.ceil(containerHeight.value / itemSize.value)))
const endRow = computed(() => Math.min(totalRowCount.value, startRow.value + visibleCount.value))
const aboveCount = computed(() => Math.min(startRow.value, props.aboveValue))
const belowCount = computed(() =>
  Math.max(0, Math.min(totalRowCount.value - endRow.value, props.belowValue))
)
const visibleData = computed(() => {
  const _start = Math.max(0, (startRow.value - aboveCount.value) * props.columnNumber)
  const _end = Math.min(
    _listData.value.length,
    (endRow.value + belowCount.value) * props.columnNumber
  )
  return _listData.value.slice(_start, _end)
})
const listStyles = computed(() => {
  return {
    gap: `0 ${props.gap}px`,
    gridTemplateColumns: `repeat(${props.columnNumber}, minmax(0, 1fr))`,
    transform: contentTransform.value
  }
})

const visibleMiddle = computed(() => (endRow.value + startRow.value) / 2)

const hasCustomTitleBar = inject('hasCustomTitleBar', ref(true))
const playerBarInset = inject(
  'playerBarInset',
  computed(() => 0)
)
const mainRef = inject('mainRef', ref<HTMLElement>())
const scrollMainTo = inject('scrollMainTo', (to: number) => {})

const _isPrefixSubset = (oldArray: any[], newArray: any[]) => {
  if (newArray.length < oldArray.length || !oldArray.length) return false
  for (let i = 0; i < oldArray.length; i++) {
    if (
      Object.prototype.hasOwnProperty.call(newArray[i].value, 'commentId') &&
      newArray[i].value?.commentId !== oldArray[i].value?.commentId
    ) {
      return false
    } else if (
      Object.prototype.hasOwnProperty.call(newArray[i].value, 'id') &&
      newArray[i].value?.id !== oldArray[i].value?.id
    ) {
      return false
    }
  }
  return true
}

const initPosition = () => {
  position.value = _listData.value.map((d: any, index: number) => ({
    index,
    height: itemSize.value,
    top: Math.floor(index / props.columnNumber) * itemSize.value,
    bottom: (Math.floor(index / props.columnNumber) + 1) * itemSize.value
  }))
}

/**
 * 当前虚拟列表全部调用点都提供固定 itemSize。
 *
 * 旧实现会在每次虚拟滚动导致 Vue 更新后重新 getBoundingClientRect()，这会强制同步布局，
 * 使长歌单/封面列表在滚轮过程中出现周期性卡顿。位置表现在完全以 itemSize 为准，滚动期间
 * 不再执行 DOM 测量；只有数据长度或列数变化时才更新位置表。
 */
const setStartOffset = () => {
  if (!position.value.length) return
  if (startRow.value >= 1) {
    const size =
      position.value[startRow.value * props.columnNumber]?.top -
      (position.value[(startRow.value - aboveCount.value) * props.columnNumber]?.top || 0)
    startOffset.value = position.value[(startRow.value - 1) * props.columnNumber]?.bottom - size
  } else {
    startOffset.value = 0
  }
}

watch(visibleMiddle, (value) => {
  if (Math.abs(scrollToIndex.value - value) <= 100) {
    virtualScrolling.value = false
  }
})

let lastScrollTop = listRef.value?.scrollTop

/**
 * 一、向下滚动: index > startRow.value
 *   1. 定位的元素小于窗口元素的一半时，此时虚拟列表不需要完全占据窗口，此时直接找到定位元素滚动到中间即可；
 *   2. 定位的元素大于窗口元素的一半时，虚拟列表完全占据窗口：
 *     1）、将虚拟列表滚动到占据整个窗口为止；
 *     2）、将定位的元素滚动到列表中间；
 * 二、向上滚动 index <= startRow.value
 *   1.定位元素大于窗口元素的一半时，虚拟列表完全占据窗口。此时虚拟列表滚动前后都完全占据窗口，只需要滚动元素即可；
 *   2. 定位元素大小窗口元素的一半时，说明虚拟列表由完全占据窗口滚动到部分占据窗口：
 *     1）、先把虚拟列表内部滚动到顶部；
 *     2）、然后找到定位元素滚动到页面中间；
 */
const scrollTocurrent = (index: number, behavior: ScrollBehavior = 'smooth') => {
  scrollToIndex.value = index
  const idx = index / props.columnNumber - Math.floor(visibleCount.value / 2)

  if (Math.abs(index - visibleMiddle.value) > 100) {
    virtualScrolling.value = true
  }
  if (idx > 0) {
    const elTop =
      listRef.value.getBoundingClientRect().top -
      (mainRef.value!.firstElementChild?.getBoundingClientRect()?.top || 0) +
      30
    scrollMainTo(elTop)
  } else {
    if (index >= startRow.value) {
      const el = itemsRef.value?.find((el) => el.id === index.toString())
      if (el) {
        const elTop = el.getBoundingClientRect().top
        const dist =
          mainRef.value!.scrollTop - (window.innerHeight / 2 - elTop - itemSize.value / 2)
        scrollMainTo(Math.max(dist, 0))
        nextTick(() => {
          el?.scrollIntoView({ block: 'center', behavior })
        })
        return
      }
    }
  }

  let top: number
  if (visibleCount.value % 2 === 0) {
    top = position.value[idx * props.columnNumber + 1]?.top || 0
  } else {
    top = position.value[idx * props.columnNumber]?.top || 0
  }
  listRef.value.scrollTo({ top, behavior })

  if (idx < 0 && index < startRow.value) {
    let isScrolling = true
    const checkScrolling = () => {
      const currentScrollTop = listRef.value?.scrollTop
      if (currentScrollTop === lastScrollTop) {
        if (isScrolling) {
          isScrolling = false
          scrollTocurrent(index)
        }
      } else {
        lastScrollTop = currentScrollTop
        requestAnimationFrame(checkScrolling)
      }
    }

    setTimeout(() => {
      requestAnimationFrame(checkScrolling)
    }, 30)
  }
}

const scrollToTop = () => {
  scrollToIndex.value = 0
  let isScrolling = true
  if (Math.abs(visibleMiddle.value) > 100) {
    virtualScrolling.value = true
  }
  listRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  const checkScrolling = () => {
    const currentScrollTop = listRef.value?.scrollTop
    if (currentScrollTop === lastScrollTop) {
      if (isScrolling) {
        isScrolling = false
        scrollMainTo(0)
      }
    } else {
      lastScrollTop = currentScrollTop
      requestAnimationFrame(checkScrolling)
    }
  }
  setTimeout(() => {
    requestAnimationFrame(checkScrolling)
  }, 30)
}

const getStartIndex = (scrollTop = 0) => {
  return binarySearch(scrollTop)
}

/**
 * 在按“行”组织的位置表中查找首个 bottom > scrollTop 的行。
 *
 * 旧实现命中右半区时只执行 end--，导致长列表滚动时二分查找退化为近似线性扫描；
 * 同时在多列列表末尾可能得到越界行，从而出现滚到某处突然空白。这里恢复标准二分边界。
 */
const binarySearch = (value: number) => {
  if (!position.value.length || totalRowCount.value <= 0) return 0

  let start = 0
  let end = totalRowCount.value - 1
  let result = 0

  while (start <= end) {
    const midIndex = Math.floor((start + end) / 2)
    const positionIndex = Math.min(midIndex * props.columnNumber, position.value.length - 1)
    const midValue = position.value[positionIndex]?.bottom ?? 0

    if (midValue <= value) {
      result = Math.min(totalRowCount.value - 1, midIndex + 1)
      start = midIndex + 1
    } else {
      result = midIndex
      end = midIndex - 1
    }
  }

  return Math.max(0, Math.min(result, totalRowCount.value - 1))
}

const rafThrottle = (fn: Function) => {
  lock.value = false
  return (...args: any[]) => {
    if (!lock.value) {
      lock.value = true
      window.requestAnimationFrame(() => {
        fn(...args)
        lock.value = false
      })
    }
  }
}

const loadMoreInFlight = ref(false)

/**
 * 请求下一页，并把同一次触底期间的重复 scroll/sentinel 事件合并成一个请求。
 */
const requestLoadMore = async () => {
  if (props.isEnd || loadMoreInFlight.value) return
  loadMoreInFlight.value = true
  try {
    await props.loadMore()
  } finally {
    loadMoreInFlight.value = false
  }
}

const onScrollToBottom = () => {
  const element = getListElement()
  if (!element) return

  const scrollTop = element.scrollTop
  const currentContainerHeight = element.clientHeight
  const contentHeight = element.scrollHeight

  registerInstance(instanceId.value)
  updateScroll(instanceId.value, {
    scrollTop,
    containerHeight: currentContainerHeight,
    listHeight: listHeight.value
  })

  const loadMoreThreshold = Math.min(720, Math.max(320, currentContainerHeight * 0.8))
  if (scrollTop + currentContainerHeight >= contentHeight - loadMoreThreshold) {
    void requestLoadMore()
  }
}

const onScroll = () => {
  const element = getListElement()
  if (!element || !position.value.length) return

  const scrollTop = element.scrollTop
  const anchor = anchorPoint.value
  if (!anchor || scrollTop > anchor.bottom || scrollTop < anchor.top) {
    startRow.value = getStartIndex(scrollTop)
    setStartOffset()
  }
}

const scrollEvent = rafThrottle(() => {
  onScrollToBottom()
  onScroll()
})

let parentScrollElement: HTMLElement | null = null

const parentScrollEvent = rafThrottle(() => {
  if (!props.enableVirtualScroll || props.isEnd) return
  const element = getListElement()
  if (!element) return

  const rect = element.getBoundingClientRect()
  const mainRect = mainRef.value?.getBoundingClientRect()
  const visibleBottom = Math.min(
    window.innerHeight - playerBarInset.value,
    mainRect?.bottom ?? window.innerHeight
  )
  if (rect.bottom <= visibleBottom + 720) {
    void requestLoadMore()
  }
})

const bindParentScrollListener = () => {
  if (!props.enableVirtualScroll) {
    unbindParentScrollListener()
    return
  }
  const nextElement = mainRef.value ?? null
  if (parentScrollElement === nextElement) return
  parentScrollElement?.removeEventListener('scroll', parentScrollEvent)
  parentScrollElement = nextElement
  parentScrollElement?.addEventListener('scroll', parentScrollEvent, { passive: true })
  parentScrollEvent()
}

const unbindParentScrollListener = () => {
  parentScrollElement?.removeEventListener('scroll', parentScrollEvent)
  parentScrollElement = null
}

const observer = new IntersectionObserver(
  (entries) => {
    const element = getListElement()
    if (!element) return
    if (!props.enableVirtualScroll) {
      element.style.overflowY = 'hidden'
      styleBefore.value = 'hidden'
      return
    }
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        element.style.overflowY = 'scroll'
        styleBefore.value = 'scroll'
      } else {
        element.style.overflowY = 'hidden'
        styleBefore.value = 'hidden'
      }
    })
  },
  {
    root: null,
    rootMargin: `-64px 0px 0px 0px`,
    threshold: 0.99
  }
)

let loadMoreObserver: IntersectionObserver | null = null

/**
 * 用列表底部哨兵触发分页。scroll 阈值仍保留作为降级路径，两者共用请求锁。
 */
const observeLoadMoreSentinel = () => {
  loadMoreObserver?.disconnect()
  if (props.isEnd) return

  const element = getListElement()
  const sentinel = loadMoreSentinelRef.value
  const root = props.enableVirtualScroll ? element : mainRef.value
  if (!element || !root || !(sentinel instanceof Element)) return

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void requestLoadMore()
      }
    },
    {
      root,
      rootMargin: props.enableVirtualScroll ? '0px 0px 640px 0px' : '0px 0px 720px 0px',
      threshold: 0
    }
  )
  loadMoreObserver.observe(sentinel)
}

const updateWindowHeight = () => {
  windowHeight.value = window.innerHeight
}

watch(enableScrolling, (value) => {
  const element = getListElement()
  if (!element) return
  if (!props.enableVirtualScroll) {
    element.style.overflowY = 'hidden'
    return
  }
  if (value) {
    element.style.overflowY = styleBefore.value
  } else {
    element.style.overflowY = 'hidden'
  }
})

watch(_listData, (newList, oldList) => {
  const isMore = _isPrefixSubset(oldList, newList)
  if (isMore) {
    lock.value = true
    const newItems = newList.slice(oldList.length)

    newItems.forEach(({ _key }) => {
      const idx = _key
      const row = Math.floor(idx / props.columnNumber)
      const top = row * itemSize.value
      position.value.push({
        index: idx,
        height: itemSize.value,
        top,
        bottom: top + itemSize.value
      })
    })

    lock.value = false
  } else {
    if (startRow.value >= totalRowCount.value) {
      startRow.value = Math.max(0, totalRowCount.value - 1)
    }
    initPosition()
    setStartOffset()
  }

  nextTick(observeLoadMoreSentinel)
})

watch(
  () => [props.columnNumber, props.itemSize, props.isEnd],
  () => {
    initPosition()
    startRow.value = Math.min(startRow.value, Math.max(0, totalRowCount.value - 1))
    setStartOffset()
    nextTick(observeLoadMoreSentinel)
  }
)

initPosition()

let updateScrollStart = 0

const startEvent = () => {
  updateScrollStart = listRef.value?.scrollTop || 0
}

const updateEvent = (data: { active: string; offset: number }) => {
  if (data.active !== instanceId.value) return
  if (updateScrollStart === 0) updateScrollStart = listRef.value?.scrollTop
  const top = Math.min(listRef.value?.scrollHeight, Math.max(updateScrollStart + data.offset, 0))
  listRef.value.scrollTo({ top, behavior: 'instant' })
}

eventBus.on('update-start', startEvent)

// @ts-ignore
eventBus.on('update-scroll-bar', updateEvent)

eventBus.on('update-done', startEvent)

onActivated(() => {
  nextTick(() => {
    const element = getListElement()
    if (element && props.enableVirtualScroll) observer.observe(element)
    observeLoadMoreSentinel()
    bindParentScrollListener()
  })
})

onDeactivated(() => {
  unregisterInstance(instanceId.value)
  loadMoreObserver?.disconnect()
  unbindParentScrollListener()
  const element = getListElement()
  if (element && props.enableVirtualScroll) observer.unobserve(element)
  virtualScrolling.value = false
})

onMounted(() => {
  instanceId.value = Math.random().toString(36).substring(2, 9)
  registerInstance(instanceId.value)
  window.addEventListener('resize', updateWindowHeight)
  nextTick(() => {
    const element = getListElement()
    if (element && props.enableVirtualScroll) observer.observe(element)
    observeLoadMoreSentinel()
    bindParentScrollListener()
  })
})

onBeforeUnmount(() => {
  unregisterInstance(instanceId.value)
  loadMoreObserver?.disconnect()
  unbindParentScrollListener()
  window.removeEventListener('resize', updateWindowHeight)
  const element = getListElement()
  if (element && props.enableVirtualScroll) observer.unobserve(element)
  virtualScrolling.value = false
  eventBus.off('update-start', startEvent)
  // @ts-ignore
  eventBus.off('update-scroll-bar', updateEvent)
  eventBus.off('update-done', startEvent)
})
</script>

<style scoped>
.infinite-list-container::-webkit-scrollbar {
  width: 0;
}

.infinite-list-container {
  overflow-x: hidden;
  width: 100%;
  overflow-y: auto;
  position: relative;
}

/*
 * 非虚拟模式用于首页短预览、完整推荐列表等普通页面流内容。
 * 容器高度已经由完整 listHeight 计算，因此自身不应再成为滚动容器；
 * 滚动统一交给外层 #main，避免“列表里再套一层滚动”。
 */
.infinite-list-container--outer-flow {
  height: auto !important;
  overflow: visible !important;
  overscroll-behavior: none;
}

.infinite-list-container--outer-flow .infinite-list-phantom,
.infinite-list-container--outer-flow .load-more-sentinel {
  display: none;
}

.infinite-list-container--outer-flow .infinite-list {
  position: static;
  transform: none !important;
  width: 100%;
}

.infinite-list-container--outer-flow .infinite-list-item-container {
  min-height: 0;
}

.load-more-sentinel {
  position: absolute;
  left: 0;
  width: 2px;
  height: 2px;
  pointer-events: none;
}

.infinite-list-phantom {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
}

.infinite-list {
  left: 0;
  right: 0;
  top: 0;
  display: grid;
  position: absolute;
  box-sizing: border-box;
}
.position {
  position: fixed;
  display: flex;
  flex-direction: row;
  gap: 12px;
  padding: 12px;
  border-radius: 9999px;
  box-shadow: 0 8px 12px -6px rgba(0, 0, 0, 0.1);
  background: var(--color-secondary-bg);
  border: 1px solid rgba(60, 60, 60, 0.08);
  opacity: 0.75;
  bottom: 52px;
  right: 24px;
  transform: translate(0, -50%);
  transition: opacity 0.3s ease;
  z-index: 15;
}
.position > * {
  display: flex;
}
.position:hover {
  opacity: 0.9;
  cursor: pointer;
}
</style>
