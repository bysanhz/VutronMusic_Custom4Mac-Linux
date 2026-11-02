/** Historical sampler from 2d85700; benchmark fixture, not production code. */
import type { WebContents } from 'electron'
export const readRendererHeapUsage = async (contents: WebContents) => {
  if (contents.isDevToolsOpened()) return { available: false, reason: 'devtools_open' }
  const debuggerApi = contents.debugger
  let owned = false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (!debuggerApi.isAttached()) {
      debuggerApi.attach('1.3')
      owned = true
    }
    const usage = await Promise.race([
      debuggerApi.sendCommand('Runtime.getHeapUsage'),
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
    if (owned && debuggerApi.isAttached()) debuggerApi.detach()
  }
}
