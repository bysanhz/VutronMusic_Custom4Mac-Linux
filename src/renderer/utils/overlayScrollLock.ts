import { useNormalStateStore } from '../store/state'

const activeLocks = new Set<symbol>()
let scrollingStateBeforeFirstLock: boolean | null = null

const synchronizeScrollingState = (): void => {
  const stateStore = useNormalStateStore()

  if (activeLocks.size > 0) {
    stateStore.enableScrolling = false
    return
  }

  stateStore.enableScrolling = scrollingStateBeforeFirstLock ?? true
  scrollingStateBeforeFirstLock = null
}

/**
 * 获取一个独立的页面滚动锁。
 *
 * 多个弹窗或菜单重叠时，只有最后一个锁释放后才恢复原始滚动状态，避免其中
 * 一个组件关闭时错误地解除另一个组件仍然需要的滚动限制。
 */
export const acquireOverlayScrollLock = (): symbol => {
  const stateStore = useNormalStateStore()
  if (activeLocks.size === 0) scrollingStateBeforeFirstLock = stateStore.enableScrolling

  const token = Symbol('overlay-scroll-lock')
  activeLocks.add(token)
  synchronizeScrollingState()
  return token
}

export const releaseOverlayScrollLock = (token: symbol | null): void => {
  if (!token || !activeLocks.delete(token)) return
  synchronizeScrollingState()
}
