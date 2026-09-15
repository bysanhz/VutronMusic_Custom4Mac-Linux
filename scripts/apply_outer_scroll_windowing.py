"""Apply bounded outer-scroll virtualization to VirtualScrollNoHeight.

Usage:
    python scripts/apply_outer_scroll_windowing.py

Args:
    None. Run from the repository root.

Returns:
    Updates VirtualScrollNoHeight.vue and the feature regression test in place.
    The transformation is idempotent and exits successfully if already applied.
"""

from pathlib import Path

COMPONENT = Path("src/renderer/components/VirtualScrollNoHeight.vue")
TESTS = Path("tests/feature-regression.spec.ts")

source = COMPONENT.read_text(encoding="utf-8")

if "const outerViewportHeight = computed(() =>" not in source:
    old = """const containerHeight = computed(() => {\n  const navBarHeight = hasCustomTitleBar.value ? 84 : 64\n  const winHeight = Math.max(0, windowHeight.value - navBarHeight - playerBarInset.value)\n  const height = props.height || winHeight\n  return props.enableVirtualScroll ? Math.min(height, listHeight.value) : listHeight.value\n})\nconst contentTransform = computed(() => `translateY(${startOffset.value}px)`)\n"""
    new = """const containerHeight = computed(() => {\n  const navBarHeight = hasCustomTitleBar.value ? 84 : 64\n  const winHeight = Math.max(0, windowHeight.value - navBarHeight - playerBarInset.value)\n  const height = props.height || winHeight\n  return props.enableVirtualScroll ? Math.min(height, listHeight.value) : listHeight.value\n})\n\n/**\n * When nested scrolling is disabled the list still needs virtualization. The outer page\n * owns the scrollbar, so keep the full phantom height but mount only viewport-adjacent rows.\n */\nconst outerViewportHeight = computed(() => {\n  const navBarHeight = hasCustomTitleBar.value ? 84 : 64\n  return Math.max(itemSize.value, windowHeight.value - navBarHeight - playerBarInset.value)\n})\nconst contentTransform = computed(() => {\n  if (!props.enableVirtualScroll) {\n    const firstRenderedRow = Math.max(0, startRow.value - aboveCount.value)\n    return `translateY(${firstRenderedRow * itemSize.value}px)`\n  }\n  return `translateY(${startOffset.value}px)`\n})\n"""
    if old not in source:
        raise SystemExit("containerHeight block not found")
    source = source.replace(old, new, 1)

if "props.enableVirtualScroll ? containerHeight.value : outerViewportHeight.value" not in source:
    old = "const visibleCount = computed(() => Math.floor(containerHeight.value / itemSize.value))"
    new = """const visibleCount = computed(() =>\n  Math.max(\n    1,\n    Math.ceil(\n      (props.enableVirtualScroll ? containerHeight.value : outerViewportHeight.value) /\n        itemSize.value\n    ) + 1\n  )\n)"""
    if old not in source:
        raise SystemExit("visibleCount declaration not found")
    source = source.replace(old, new, 1)

if "if (!props.enableVirtualScroll) {\n    return (" not in source:
    old = """const listHeight = computed(() => {\n  const totalRows = Math.ceil(_listData.value.length / props.columnNumber)\n  const idx = Math.floor((position.value.length - 1) / props.columnNumber) * props.columnNumber\n  return (\n    (position.value[idx]?.bottom || totalRows * itemSize.value) +\n    (props.showFooter ? footerHeight.value : 0) +\n    (props.isEnd ? props.paddingBottom : 0)\n  )\n})\n"""
    new = """const listHeight = computed(() => {\n  const totalRows = Math.ceil(_listData.value.length / props.columnNumber)\n  if (!props.enableVirtualScroll) {\n    return (\n      totalRows * itemSize.value +\n      (props.showFooter ? footerHeight.value : 0) +\n      (props.isEnd ? props.paddingBottom : 0)\n    )\n  }\n  const idx = Math.floor((position.value.length - 1) / props.columnNumber) * props.columnNumber\n  return (\n    (position.value[idx]?.bottom || totalRows * itemSize.value) +\n    (props.showFooter ? footerHeight.value : 0) +\n    (props.isEnd ? props.paddingBottom : 0)\n  )\n})\n"""
    if old not in source:
        raise SystemExit("listHeight block not found")
    source = source.replace(old, new, 1)

if "const updateOuterWindow = () =>" not in source:
    old = """let parentScrollElement: HTMLElement | null = null\n\nconst parentScrollEvent = rafThrottle(() => {\n  const element = listRef.value as HTMLElement | undefined\n  if (!element) return\n\n  const rect = element.getBoundingClientRect()\n  const mainRect = mainRef.value?.getBoundingClientRect()\n  const visibleBottom = Math.min(\n    window.innerHeight - playerBarInset.value,\n    mainRect?.bottom ?? window.innerHeight\n  )\n  if (rect.bottom <= visibleBottom + 720) {\n    void requestLoadMore()\n  }\n})\n"""
    new = """let parentScrollElement: HTMLElement | null = null\n\nconst updateOuterWindow = () => {\n  if (props.enableVirtualScroll) return\n  const element = getListElement()\n  if (!element) return\n\n  const rect = element.getBoundingClientRect()\n  const mainRect = mainRef.value?.getBoundingClientRect()\n  const visibleTop = Math.max(\n    mainRect?.top ?? 0,\n    hasCustomTitleBar.value ? 84 : 64\n  )\n  const scrollInsideList = Math.max(0, visibleTop - rect.top)\n  const maxRow = Math.max(0, Math.ceil(list.value.length / props.columnNumber) - 1)\n  const nextRow = Math.min(maxRow, Math.max(0, getStartIndex(scrollInsideList) ?? 0))\n\n  if (nextRow !== startRow.value) startRow.value = nextRow\n  element.style.overflowY = 'hidden'\n  styleBefore.value = 'hidden'\n}\n\nconst parentScrollEvent = rafThrottle(() => {\n  const element = getListElement()\n  if (!element) return\n\n  updateOuterWindow()\n\n  const rect = element.getBoundingClientRect()\n  const mainRect = mainRef.value?.getBoundingClientRect()\n  const visibleBottom = Math.min(\n    window.innerHeight - playerBarInset.value,\n    mainRect?.bottom ?? window.innerHeight\n  )\n  if (rect.bottom <= visibleBottom + 720) {\n    void requestLoadMore()\n  }\n})\n"""
    if old not in source:
        raise SystemExit("parentScrollEvent block not found")
    source = source.replace(old, new, 1)

if "parentScrollElement?.addEventListener('scroll', parentScrollEvent, { passive: true })\n  parentScrollEvent()" not in source:
    old = """  parentScrollElement = nextElement\n  parentScrollElement?.addEventListener('scroll', parentScrollEvent, { passive: true })\n}\n"""
    new = """  parentScrollElement = nextElement\n  parentScrollElement?.addEventListener('scroll', parentScrollEvent, { passive: true })\n  parentScrollEvent()\n}\n"""
    if old not in source:
        raise SystemExit("bindParentScrollListener block not found")
    source = source.replace(old, new, 1)

if "if (!props.enableVirtualScroll) {\n      element.style.overflowY = 'hidden'" not in source:
    old = """  (entries) => {\n    const element = getListElement()\n    if (!element) return\n    entries.forEach((entry) => {\n"""
    new = """  (entries) => {\n    const element = getListElement()\n    if (!element) return\n    if (!props.enableVirtualScroll) {\n      element.style.overflowY = 'hidden'\n      styleBefore.value = 'hidden'\n      return\n    }\n    entries.forEach((entry) => {\n"""
    if old not in source:
        raise SystemExit("observer callback block not found")
    source = source.replace(old, new, 1)

if "if (!props.enableVirtualScroll) return\n  loadMoreObserver?.disconnect()" not in source:
    old = """const observeLoadMoreSentinel = () => {\n  loadMoreObserver?.disconnect()\n"""
    new = """const observeLoadMoreSentinel = () => {\n  if (!props.enableVirtualScroll) return\n  loadMoreObserver?.disconnect()\n"""
    if old not in source:
        raise SystemExit("observeLoadMoreSentinel block not found")
    source = source.replace(old, new, 1)

if "if (!props.enableVirtualScroll) {\n    element.style.overflowY = 'hidden'\n    return\n  }\n  if (value)" not in source:
    old = """watch(enableScrolling, (value) => {\n  const element = getListElement()\n  if (!element) return\n  if (value) {\n"""
    new = """watch(enableScrolling, (value) => {\n  const element = getListElement()\n  if (!element) return\n  if (!props.enableVirtualScroll) {\n    element.style.overflowY = 'hidden'\n    return\n  }\n  if (value) {\n"""
    if old not in source:
        raise SystemExit("enableScrolling watcher not found")
    source = source.replace(old, new, 1)

# In outer-scroll mode do not activate the nested observer/sentinel. The parent listener
# provides both viewport windowing and load-more checks.
source = source.replace(
    """    const element = getListElement()\n    if (element) observer.observe(element)\n    observeLoadMoreSentinel()\n    bindParentScrollListener()\n""",
    """    const element = getListElement()\n    if (element && props.enableVirtualScroll) observer.observe(element)\n    if (props.enableVirtualScroll) observeLoadMoreSentinel()\n    bindParentScrollListener()\n"""
)
source = source.replace(
    """  const element = getListElement()\n  if (element) observer.unobserve(element)\n  virtualScrolling.value = false\n""",
    """  const element = getListElement()\n  if (element && props.enableVirtualScroll) observer.unobserve(element)\n  virtualScrolling.value = false\n"""
)

if "if (!props.enableVirtualScroll) parentScrollEvent()" not in source:
    old = """onUpdated(() => {\n  nextTick(() => {\n    updateItemsSize()\n    setStartOffset()\n  })\n})\n"""
    new = """onUpdated(() => {\n  nextTick(() => {\n    if (props.enableVirtualScroll) {\n      updateItemsSize()\n      setStartOffset()\n    } else {\n      parentScrollEvent()\n    }\n  })\n})\n"""
    if old not in source:
        raise SystemExit("onUpdated block not found")
    source = source.replace(old, new, 1)

COMPONENT.write_text(source, encoding="utf-8")

tests = TESTS.read_text(encoding="utf-8")
marker = "outer-scroll cover grids keep a bounded DOM window"
if marker not in tests:
    tests += r'''

test.describe('outer-scroll cover virtualization', () => {
  test('outer-scroll cover grids keep a bounded DOM window', () => {
    const source = readSource('src/renderer/components/VirtualScrollNoHeight.vue')

    expect(source).toContain('const outerViewportHeight = computed(() =>')
    expect(source).toContain('const updateOuterWindow = () =>')
    expect(source).toContain("element.style.overflowY = 'hidden'")
    expect(source).toContain('if (!props.enableVirtualScroll) return')
    expect(source).toContain('if (element && props.enableVirtualScroll) observer.observe(element)')
    expect(source).toContain('if (props.enableVirtualScroll) observeLoadMoreSentinel()')
    expect(source).toContain('parentScrollEvent()')
  })
})
'''
    TESTS.write_text(tests, encoding="utf-8")
