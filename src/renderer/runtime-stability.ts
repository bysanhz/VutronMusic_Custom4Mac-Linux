/**
 * Renderer runtime error reporting.
 *
 * Native browser prototypes are intentionally left untouched. Component lifecycle bugs must be
 * fixed at their source instead of being hidden by global IntersectionObserver monkey patches.
 */
type RuntimeStabilityWindow = Window & {
  __vutronRuntimeStabilityInstalled__?: boolean
}

const DUPLICATE_ERROR_WINDOW_MS = 5000
const recentRuntimeErrors = new Map<string, number>()

const stringifyReason = (reason: unknown): string => {
  if (reason instanceof Error) return reason.stack || reason.message
  if (typeof reason === 'string') return reason

  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

const reportRuntimeError = (source: string, reason: unknown): void => {
  const message = stringifyReason(reason)
  const key = `${source}:${message}`
  const now = Date.now()
  const previousTime = recentRuntimeErrors.get(key) || 0

  if (now - previousTime < DUPLICATE_ERROR_WINDOW_MS) return

  recentRuntimeErrors.set(key, now)
  console.error(`[RuntimeStability] ${source}:`, reason)

  for (const [storedKey, storedTime] of recentRuntimeErrors) {
    if (now - storedTime > DUPLICATE_ERROR_WINDOW_MS * 2) {
      recentRuntimeErrors.delete(storedKey)
    }
  }
}

const initializeRuntimeStability = (): void => {
  const runtimeWindow = window as RuntimeStabilityWindow
  if (runtimeWindow.__vutronRuntimeStabilityInstalled__) return
  runtimeWindow.__vutronRuntimeStabilityInstalled__ = true

  window.addEventListener('error', (event) => {
    reportRuntimeError('window.error', event.error || event.message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportRuntimeError('window.unhandledrejection', event.reason)
  })
}

initializeRuntimeStability()
