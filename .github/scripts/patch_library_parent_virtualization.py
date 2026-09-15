from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"expected snippet not found in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


virtual_scroll = Path('src/renderer/components/VirtualScrollNoHeight.vue')
virtual_cover = Path('src/renderer/components/VirtualCoverRow.vue')
library = Path('src/renderer/views/LibraryMusic.vue')
tests = Path('tests/feature-regression.spec.ts')

replace_once(
    virtual_scroll,
    """    enableVirtualScroll?: boolean\n    loadMore?: () => void | Promise<unknown>\n""",
    """    enableVirtualScroll?: boolean\n    virtualizeOnParentScroll?: boolean\n    loadMore?: () => void | Promise<unknown>\n""",
)
replace_once(
    virtual_scroll,
    """    enableVirtualScroll: true,\n    loadMore: () => {}\n""",
    """    enableVirtualScroll: true,\n    virtualizeOnParentScroll: false,\n    loadMore: () => {}\n""",
)
replace_once(
    virtual_scroll,
    """const containerHeight = computed(() => {\n  const navBarHeight = hasCustomTitleBar.value ? 84 : 64\n  const winHeight = Math.max(0, windowHeight.value - navBarHeight - playerBarInset.value)\n  const height = props.height || winHeight\n  return props.enableVirtualScroll ? Math.min(height, listHeight.value) : listHeight.value\n})\n""",
    """const viewportHeight = computed(() => {\n  const navBarHeight = hasCustomTitleBar.value ? 84 : 64\n  return Math.max(0, windowHeight.value - navBarHeight - playerBarInset.value)\n})\n\nconst containerHeight = computed(() => {\n  const height = props.height || viewportHeight.value\n  return props.enableVirtualScroll ? Math.min(height, listHeight.value) : listHeight.value\n})\n""",
)
replace_once(
    virtual_scroll,
    """const visibleCount = computed(() => Math.floor(containerHeight.value / itemSize.value))\n""",
    """const visibleCount = computed(() => {\n  if (props.virtualizeOnParentScroll && !props.enableVirtualScroll) {\n    return Math.max(1, Math.ceil(viewportHeight.value / itemSize.value) + 1)\n  }\n  return Math.max(1, Math.floor(containerHeight.value / itemSize.value))\n})\n""",
)
replace_once(
    virtual_scroll,
    """const parentScrollEvent = rafThrottle(() => {\n  const element = listRef.value as HTMLElement | undefined\n  if (!element) return\n\n  const rect = element.getBoundingClientRect()\n  const mainRect = mainRef.value?.getBoundingClientRect()\n  const visibleBottom = Math.min(\n    window.innerHeight - playerBarInset.value,\n    mainRect?.bottom ?? window.innerHeight\n  )\n  if (rect.bottom <= visibleBottom + 720) {\n    void requestLoadMore()\n  }\n})\n""",
    """const parentScrollEvent = rafThrottle(() => {\n  const element = getListElement()\n  if (!element) return\n\n  const rect = element.getBoundingClientRect()\n  const mainRect = mainRef.value?.getBoundingClientRect()\n\n  if (props.virtualizeOnParentScroll && !props.enableVirtualScroll && position.value.length) {\n    const viewportTopInsideList = Math.max(0, (mainRect?.top ?? 0) - rect.top)\n    const maxVirtualTop = Math.max(0, listHeight.value - itemSize.value)\n    const nextStartRow = Math.max(\n      0,\n      getStartIndex(Math.min(viewportTopInsideList, maxVirtualTop)) ?? 0\n    )\n    if (nextStartRow !== startRow.value) {\n      startRow.value = nextStartRow\n      setStartOffset()\n    }\n  }\n\n  const visibleBottom = Math.min(\n    window.innerHeight - playerBarInset.value,\n    mainRect?.bottom ?? window.innerHeight\n  )\n  if (rect.bottom <= visibleBottom + 720) {\n    void requestLoadMore()\n  }\n})\n""",
)
replace_once(
    virtual_scroll,
    """  parentScrollElement = nextElement\n  parentScrollElement?.addEventListener('scroll', parentScrollEvent, { passive: true })\n}\n""",
    """  parentScrollElement = nextElement\n  parentScrollElement?.addEventListener('scroll', parentScrollEvent, { passive: true })\n  if (parentScrollElement) parentScrollEvent()\n}\n""",
)
replace_once(
    virtual_scroll,
    """watch(enableScrolling, (value) => {\n  const element = getListElement()\n  if (!element) return\n  if (value) {\n    element.style.overflowY = styleBefore.value\n  } else {\n    element.style.overflowY = 'hidden'\n  }\n})\n""",
    """watch(enableScrolling, (value) => {\n  const element = getListElement()\n  if (!element) return\n  if (props.virtualizeOnParentScroll && !props.enableVirtualScroll) {\n    element.style.overflowY = 'hidden'\n    return\n  }\n  if (value) {\n    element.style.overflowY = styleBefore.value\n  } else {\n    element.style.overflowY = 'hidden'\n  }\n})\n""",
)
replace_once(
    virtual_scroll,
    """onActivated(() => {\n  nextTick(() => {\n    const element = getListElement()\n    if (element) observer.observe(element)\n    observeLoadMoreSentinel()\n    bindParentScrollListener()\n    setTimeout(() => {\n      updateItemsSize()\n    }, 100)\n  })\n})\n""",
    """onActivated(() => {\n  nextTick(() => {\n    const element = getListElement()\n    if (element) {\n      if (props.virtualizeOnParentScroll && !props.enableVirtualScroll) {\n        element.style.overflowY = 'hidden'\n      } else {\n        observer.observe(element)\n        observeLoadMoreSentinel()\n      }\n    }\n    bindParentScrollListener()\n    setTimeout(() => {\n      updateItemsSize()\n      parentScrollEvent()\n    }, 100)\n  })\n})\n""",
)
replace_once(
    virtual_scroll,
    """onMounted(() => {\n  // startRow.value = 0\n  instanceId.value = Math.random().toString(36).substring(2, 9)\n  registerInstance(instanceId.value)\n  window.addEventListener('resize', updateWindowHeight)\n  nextTick(() => {\n    const element = getListElement()\n    if (element) observer.observe(element)\n    observeLoadMoreSentinel()\n    bindParentScrollListener()\n    setTimeout(() => {\n      updateItemsSize()\n    }, 100)\n  })\n})\n""",
    """onMounted(() => {\n  // startRow.value = 0\n  instanceId.value = Math.random().toString(36).substring(2, 9)\n  registerInstance(instanceId.value)\n  window.addEventListener('resize', updateWindowHeight)\n  nextTick(() => {\n    const element = getListElement()\n    if (element) {\n      if (props.virtualizeOnParentScroll && !props.enableVirtualScroll) {\n        element.style.overflowY = 'hidden'\n      } else {\n        observer.observe(element)\n        observeLoadMoreSentinel()\n      }\n    }\n    bindParentScrollListener()\n    setTimeout(() => {\n      updateItemsSize()\n      parentScrollEvent()\n    }, 100)\n  })\n})\n""",
)
replace_once(
    virtual_cover,
    """    :enable-virtual-scroll=\"enableVirtualScroll\"\n    :show-footer=\"showFooter\"\n""",
    """    :enable-virtual-scroll=\"enableVirtualScroll\"\n    :virtualize-on-parent-scroll=\"virtualizeOnParentScroll\"\n    :show-footer=\"showFooter\"\n""",
)
replace_once(
    virtual_cover,
    """  enableVirtualScroll: { type: Boolean, default: true },\n  loadMore: { type: Function as PropType<() => void>, default: () => {} }\n""",
    """  enableVirtualScroll: { type: Boolean, default: true },\n  virtualizeOnParentScroll: { type: Boolean, default: false },\n  loadMore: { type: Function as PropType<() => void>, default: () => {} }\n""",
)
replace_once(
    library,
    """import { ref, computed, onMounted, onUnmounted, inject, nextTick, watch } from 'vue'\n""",
    """import { ref, computed, onMounted, onUnmounted, inject, nextTick } from 'vue'\n""",
)
replace_once(
    library,
    """            :items=\"visiblePlaylists\"\n            type=\"playlist\"\n            sub-text=\"creator\"\n            :colunm-number=\"5\"\n            :enable-virtual-scroll=\"false\"\n            :is-end=\"visiblePlaylists.length >= filterPlaylists.length\"\n            :padding-bottom=\"96\"\n            :load-more=\"loadMorePlaylists\"\n""",
    """            :items=\"filterPlaylists\"\n            type=\"playlist\"\n            sub-text=\"creator\"\n            :colunm-number=\"5\"\n            :enable-virtual-scroll=\"false\"\n            :virtualize-on-parent-scroll=\"true\"\n            :is-end=\"true\"\n            :padding-bottom=\"96\"\n""",
)
replace_once(
    library,
    """            :items=\"visibleAlbums\"\n            type=\"album\"\n            sub-text=\"artist\"\n            :colunm-number=\"5\"\n            :enable-virtual-scroll=\"false\"\n            :is-end=\"visibleAlbums.length >= libraryData.albums.length\"\n            :padding-bottom=\"96\"\n            :load-more=\"loadMoreAlbums\"\n""",
    """            :items=\"libraryData.albums\"\n            type=\"album\"\n            sub-text=\"artist\"\n            :colunm-number=\"5\"\n            :enable-virtual-scroll=\"false\"\n            :virtualize-on-parent-scroll=\"true\"\n            :is-end=\"true\"\n            :padding-bottom=\"96\"\n""",
)
replace_once(
    library,
    """            :items=\"visibleArtists\"\n            type=\"artist\"\n            sub-text=\"artist\"\n            :item-height=\"230\"\n            :colunm-number=\"5\"\n            :enable-virtual-scroll=\"false\"\n            :is-end=\"visibleArtists.length >= libraryData.artists.length\"\n            :padding-bottom=\"96\"\n            :load-more=\"loadMoreArtists\"\n""",
    """            :items=\"libraryData.artists\"\n            type=\"artist\"\n            sub-text=\"artist\"\n            :item-height=\"230\"\n            :colunm-number=\"5\"\n            :enable-virtual-scroll=\"false\"\n            :virtualize-on-parent-scroll=\"true\"\n            :is-end=\"true\"\n            :padding-bottom=\"96\"\n""",
)
start = library.read_text()
old_block = """const COVER_PAGE_SIZE = 40\nconst playlistVisibleLimit = ref(COVER_PAGE_SIZE)\nconst albumVisibleLimit = ref(COVER_PAGE_SIZE)\nconst artistVisibleLimit = ref(COVER_PAGE_SIZE)\n\n"""
if old_block not in start:
    raise SystemExit('library page-size block not found')
start = start.replace(old_block, '', 1)
old_block = """const visiblePlaylists = computed(() => filterPlaylists.value.slice(0, playlistVisibleLimit.value))\nconst visibleAlbums = computed(() => libraryData.value.albums.slice(0, albumVisibleLimit.value))\nconst visibleArtists = computed(() => libraryData.value.artists.slice(0, artistVisibleLimit.value))\n\nconst loadMorePlaylists = () => {\n  playlistVisibleLimit.value = Math.min(\n    filterPlaylists.value.length,\n    playlistVisibleLimit.value + COVER_PAGE_SIZE\n  )\n}\nconst loadMoreAlbums = () => {\n  albumVisibleLimit.value = Math.min(\n    libraryData.value.albums.length,\n    albumVisibleLimit.value + COVER_PAGE_SIZE\n  )\n}\nconst loadMoreArtists = () => {\n  artistVisibleLimit.value = Math.min(\n    libraryData.value.artists.length,\n    artistVisibleLimit.value + COVER_PAGE_SIZE\n  )\n}\n\nwatch(playlistFilter, () => {\n  playlistVisibleLimit.value = COVER_PAGE_SIZE\n})\n\n"""
if old_block not in start:
    raise SystemExit('library visible/loadMore block not found')
start = start.replace(old_block, '', 1)
library.write_text(start)

with tests.open('a') as fh:
    fh.write("""\n\ntest.describe('library parent-scroll cover virtualization', () => {\n  test('keeps the library on one native scroll surface while bounding mounted cover cards', () => {\n    const librarySource = readSource('src/renderer/views/LibraryMusic.vue')\n    const coverRowSource = readSource('src/renderer/components/VirtualCoverRow.vue')\n    const virtualScrollSource = readSource('src/renderer/components/VirtualScrollNoHeight.vue')\n\n    expect(librarySource).toContain(':virtualize-on-parent-scroll=\"true\"')\n    expect(librarySource).not.toContain('COVER_PAGE_SIZE')\n    expect(librarySource).not.toContain('visiblePlaylists')\n    expect(coverRowSource).toContain(':virtualize-on-parent-scroll=\"virtualizeOnParentScroll\"')\n    expect(virtualScrollSource).toContain('virtualizeOnParentScroll?: boolean')\n    expect(virtualScrollSource).toContain('viewportTopInsideList')\n    expect(virtualScrollSource).toContain('Math.ceil(viewportHeight.value / itemSize.value) + 1')\n  })\n})\n""")
