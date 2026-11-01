/** Release vue-i18n 9 development timing entries; never clear application timings or force GC. */
const OWNED_MEASURES = new Set([
  'intlify message resolve',
  'intlify message compilation',
  'intlify message evaluation'
])
let observer: PerformanceObserver | null = null
let releasedEntries = 0

export const installI18nTimingCleanup = (): (() => void) => {
  if (observer || typeof PerformanceObserver === 'undefined') return () => {}
  // Do not request buffered entries: an already affected window may hold millions of them.
  for (const name of OWNED_MEASURES) performance.clearMeasures(name)
  observer = new PerformanceObserver((list) => {
    const names = new Set<string>()
    for (const entry of list.getEntries()) {
      if (OWNED_MEASURES.has(entry.name)) {
        names.add(entry.name)
        releasedEntries++
      }
    }
    for (const name of names) performance.clearMeasures(name)
  })
  observer.observe({ entryTypes: ['measure'] })
  const close = () => {
    observer?.disconnect()
    observer = null
    window.removeEventListener('beforeunload', close)
  }
  window.addEventListener('beforeunload', close, { once: true })
  return close
}

export const getI18nTimingDiagnostics = () => ({ active: observer !== null, releasedEntries })
