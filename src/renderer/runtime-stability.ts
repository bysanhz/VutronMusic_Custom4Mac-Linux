// ======== newADD start======
/**
 * 渲染进程运行时稳定性保护。
 *
 * 概述：
 * 1. 防止 Vue 组件切换、KeepAlive 激活或销毁期间把空引用传给 IntersectionObserver；
 * 2. 统一记录未捕获异常和未处理 Promise，并对短时间内的重复错误去重；
 * 3. 只在渲染进程启动时安装一次，不改变正常 DOM 元素的观察行为。
 */

type RuntimeStabilityWindow = Window & {
  __vutronRuntimeStabilityInstalled__?: boolean
}

const DUPLICATE_ERROR_WINDOW_MS = 5000
const recentRuntimeErrors = new Map<string, number>()

const stringifyReason = (reason: unknown) => {
  if (reason instanceof Error) {
    return reason.stack || reason.message
  }

  if (typeof reason === 'string') {
    return reason
  }

  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

const reportRuntimeError = (source: string, reason: unknown) => {
  const message = stringifyReason(reason)
  const key = `${source}:${message}`
  const now = Date.now()
  const previousTime = recentRuntimeErrors.get(key) || 0

  if (now - previousTime < DUPLICATE_ERROR_WINDOW_MS) {
    return
  }

  recentRuntimeErrors.set(key, now)
  console.error(`[RuntimeStability] ${source}:`, reason)

  for (const [storedKey, storedTime] of recentRuntimeErrors) {
    if (now - storedTime > DUPLICATE_ERROR_WINDOW_MS * 2) {
      recentRuntimeErrors.delete(storedKey)
    }
  }
}

const installSafeIntersectionObserver = () => {
  if (typeof IntersectionObserver === 'undefined') return

  const prototype = IntersectionObserver.prototype
  const originalObserve = prototype.observe
  const originalUnobserve = prototype.unobserve

  prototype.observe = function observe(target: Element) {
    if (!(target instanceof Element)) {
      reportRuntimeError(
        'IntersectionObserver.observe',
        new TypeError('忽略了尚未挂载或已经销毁的观察目标')
      )
      return
    }

    originalObserve.call(this, target)
  }

  prototype.unobserve = function unobserve(target: Element) {
    if (!(target instanceof Element)) {
      this.disconnect()
      return
    }

    originalUnobserve.call(this, target)
  }
}

const initializeRuntimeStability = () => {
  const runtimeWindow = window as RuntimeStabilityWindow
  if (runtimeWindow.__vutronRuntimeStabilityInstalled__) return

  runtimeWindow.__vutronRuntimeStabilityInstalled__ = true
  installSafeIntersectionObserver()

  window.addEventListener('error', (event) => {
    reportRuntimeError('window.error', event.error || event.message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportRuntimeError('window.unhandledrejection', event.reason)
  })
}

initializeRuntimeStability()
// =========== newADD end ========
