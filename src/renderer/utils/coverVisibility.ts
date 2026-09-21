type VisibilityCallback = (isNearViewport: boolean) => void

const listeners = new WeakMap<Element, VisibilityCallback>()
let observer: IntersectionObserver | null = null

const getObserver = (): IntersectionObserver | null => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null
  if (observer) return observer

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        listeners.get(entry.target)?.(entry.isIntersecting)
      }
    },
    {
      root: null,
      rootMargin: '320px 0px',
      threshold: 0
    }
  )
  return observer
}

/**
 * Cover cards share one observer instead of creating one timer/observer per image.
 * Only covers near the viewport expose the loading spinner, which avoids the old
 * "hundreds of 180ms timers fire together" burst on Library/Explore mount.
 */
export const observeCoverVisibility = (
  element: Element,
  listener: VisibilityCallback
): (() => void) => {
  const sharedObserver = getObserver()
  listeners.set(element, listener)

  if (!sharedObserver) {
    listener(true)
    return () => listeners.delete(element)
  }

  sharedObserver.observe(element)
  return () => {
    sharedObserver.unobserve(element)
    listeners.delete(element)
  }
}
