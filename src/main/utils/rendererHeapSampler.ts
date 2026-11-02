import type { WebContents } from 'electron'

type HeapUsage = {
  usedSize: number
  totalSize: number
  embedderHeapUsedSize?: number
  backingStorageSize?: number
}
type Session = { owned: boolean; pending: Promise<HeapUsage> | null }
const sessions = new WeakMap<WebContents, Session>()

/** Reuse one local inspector session per target; repeated attach/detach grows embedder memory. */
export const readRendererHeapUsage = async (contents: WebContents) => {
  if (contents.isDestroyed()) return { available: false, reason: 'destroyed' }
  if (contents.isDevToolsOpened()) return { available: false, reason: 'devtools_open' }
  const debuggerApi = contents.debugger
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    let state = sessions.get(contents)
    if (!state) {
      state = { owned: false, pending: null }
      sessions.set(contents, state)
      const current = state
      const onDetach = () => {
        current.owned = false
      }
      debuggerApi.on('detach', onDetach)
      contents.once('destroyed', () => {
        try {
          if (current.owned && debuggerApi.isAttached()) debuggerApi.detach()
        } catch {
          // Electron may have already destroyed the target and its debugger.
        }
        debuggerApi.removeListener('detach', onDetach)
        sessions.delete(contents)
      })
    }
    if (!debuggerApi.isAttached()) {
      debuggerApi.attach('1.3')
      state.owned = true
    }
    if (!state.pending) {
      const current = state
      current.pending = debuggerApi.sendCommand('Runtime.getHeapUsage').finally(() => {
        current.pending = null
      })
    }
    const usage = await Promise.race([
      state.pending!,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 1500)
      })
    ])
    return {
      available: true,
      usedBytes: usage.usedSize,
      allocatedBytes: usage.totalSize,
      embedderBytes: usage.embedderHeapUsedSize ?? null,
      backingStorageBytes: usage.backingStorageSize ?? null
    }
  } catch {
    return { available: false, reason: 'unavailable' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
