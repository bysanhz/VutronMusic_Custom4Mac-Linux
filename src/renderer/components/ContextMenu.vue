<template>
  <div ref="contextMenuRef" class="context-menu">
    <div
      v-show="showMenu"
      ref="menu"
      class="menu"
      role="menu"
      tabindex="-1"
      :style="{ top: topValue, left: leftValue }"
      @blur="handleBlur"
      @click="handleMenuClick"
      @keydown="handleKeydown"
    >
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { usePlayerStore } from '../store/player'
import { storeToRefs } from 'pinia'
import { acquireOverlayScrollLock, releaseOverlayScrollLock } from '../utils/overlayScrollLock'

const showMenu = ref(false)
const menu = ref<HTMLElement | null>(null)
const topValue = ref('0px')
const leftValue = ref('0px')
const player = storeToRefs(usePlayerStore())
let previouslyFocusedElement: HTMLElement | null = null
let scrollLockToken: symbol | null = null

const emit = defineEmits(['closeMenu'])

const getItems = (): HTMLElement[] => {
  if (!menu.value) return []
  return [...menu.value.querySelectorAll<HTMLElement>('.item:not([aria-disabled="true"])')]
}

const closeMenu = () => {
  if (!showMenu.value) return
  showMenu.value = false
  releaseOverlayScrollLock(scrollLockToken)
  scrollLockToken = null
  emit('closeMenu')
  previouslyFocusedElement?.focus()
  previouslyFocusedElement = null
}

const setMenu = (top: number, left: number) => {
  const playerEnabled = player.enabled.value || false
  const heightOffset = playerEnabled ? 64 : 0
  const menuHeight = menu.value?.offsetHeight || 0
  const menuWidth = menu.value?.offsetWidth || 0
  const largestHeight = Math.max(8, window.innerHeight - menuHeight - heightOffset - 8)
  const largestWidth = Math.max(8, window.innerWidth - menuWidth - 8)

  topValue.value = Math.max(8, Math.min(top, largestHeight)) + 'px'
  leftValue.value = Math.max(8, Math.min(left, largestWidth)) + 'px'
}

const focusItem = (index: number) => {
  const items = getItems()
  if (!items.length) return
  const normalizedIndex = (index + items.length) % items.length
  items[normalizedIndex].tabIndex = 0
  items[normalizedIndex].focus()
  items.forEach((item, itemIndex) => {
    if (itemIndex !== normalizedIndex) item.tabIndex = -1
  })
}

const activateFocusedItem = (): void => {
  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement) || !menu.value?.contains(activeElement)) return
  if (
    !activeElement.classList.contains('item') ||
    activeElement.getAttribute('aria-disabled') === 'true'
  ) {
    return
  }
  activeElement.click()
}

const handleKeydown = (event: KeyboardEvent) => {
  const items = getItems()
  const currentIndex = items.findIndex((item) => item === document.activeElement)

  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusItem(currentIndex + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusItem(currentIndex - 1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    focusItem(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    focusItem(items.length - 1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activateFocusedItem()
  }
}

const handleBlur = (event: FocusEvent) => {
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && menu.value?.contains(nextTarget)) return
  closeMenu()
}

const handleMenuClick = (event: MouseEvent) => {
  if ((event.target as HTMLElement).closest('.item')) closeMenu()
}

const openMenu = (event: MouseEvent) => {
  if (showMenu.value) closeMenu()
  previouslyFocusedElement = document.activeElement as HTMLElement | null
  scrollLockToken = acquireOverlayScrollLock()
  showMenu.value = true
  event.preventDefault()

  nextTick(() => {
    setMenu(event.clientY, event.clientX)
    const items = getItems()
    items.forEach((item) => {
      item.setAttribute('role', item.getAttribute('role') || 'menuitem')
      item.tabIndex = -1
    })
    if (items.length) focusItem(0)
    else menu.value?.focus()
  })
}

onBeforeUnmount(() => {
  releaseOverlayScrollLock(scrollLockToken)
  scrollLockToken = null
})

defineExpose({
  openMenu,
  closeMenu
})
</script>

<style lang="scss">
.context-menu {
  user-select: none;
}

.menu {
  position: fixed;
  min-width: 136px;
  max-width: 260px;
  list-style: none;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 6px 12px -4px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  box-sizing: border-box;
  padding: 6px;
  -webkit-app-region: no-drag;
  z-index: 110;
  transition:
    background 125ms ease-out,
    opacity 125ms ease-out,
    transform 125ms ease-out;

  &:focus {
    outline: none;
  }
}

.menu .item {
  font-weight: 600;
  font-size: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: default;
  display: flex;
  align-items: center;
  outline: none;

  &:hover,
  &:focus-visible {
    color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) var(--bg-alpha), white);
    transition:
      opacity 125ms ease-out,
      transform 125ms ease-out;
  }

  .svg-icon {
    height: 16px;
    width: 16px;
    margin-right: 5px;
  }
}

.menu .item.active {
  color: var(--color-primary);
  background: color-mix(in oklab, var(--color-primary) var(--bg-alpha), white);
}

[data-theme='dark'] {
  .menu {
    background: rgba(36, 36, 36, 0.78);
    backdrop-filter: blur(16px) contrast(120%) brightness(60%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.08);
  }
}

@supports (-moz-appearance: none) {
  .menu {
    background-color: var(--color-body-bg) !important;
  }
}

hr {
  margin: 4px 10px;
  background: rgba(128, 128, 128, 0.18);
  height: 1px !important;
  box-shadow: none;
  border: none;
}

.item-info {
  padding: 10px;
  display: flex;
  align-items: center;
  cursor: default;
  img {
    height: 38px;
    width: 38px;
    border-radius: 4px;
  }
  .info {
    margin-left: 10px;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
  .subtitle {
    font-size: 12px;
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
}
</style>
