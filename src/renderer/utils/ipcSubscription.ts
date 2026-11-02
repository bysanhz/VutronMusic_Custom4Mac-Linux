/** Keep cancellation in preload's world; a callback passed back through the bridge has a new identity. */
export const subscribeMainEvent = (
  channel: string,
  listener: (...args: any[]) => void
): (() => void) => {
  const api = window.mainApi
  if (!api) return () => {}
  const cancel = api.on(channel, listener)
  if (typeof cancel === 'function') return cancel
  // Compatibility for browser fixtures and older preloads during development.
  return () => api.off(channel, listener)
}
