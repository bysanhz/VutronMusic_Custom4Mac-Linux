export type PlaybackFailure =
  | 'network'
  | 'timeout'
  | 'risk-control'
  | 'login-required'
  | 'permission'
  | 'rate-limited'
  | 'missing'
  | 'identity'
  | 'decode'
  | 'unavailable'
export type PlaybackRecovery = {
  phase: 'idle' | 'loading' | 'retrying' | 'ready' | 'failed'
  failure?: PlaybackFailure
  attempt: number
}

export const classifyPlaybackFailure = (error: any): PlaybackFailure => {
  const status = Number(error?.response?.status ?? error?.status)
  const code = Number(error?.response?.data?.code ?? error?.body?.code)
  if (code === -460) return 'risk-control'
  if (status === 401 || code === 301) return 'login-required'
  if (status === 403) return 'permission'
  if (status === 429) return 'rate-limited'
  if (status === 404) return 'missing'
  if (['ECONNABORTED', 'ETIMEDOUT', 'TimeoutError'].includes(error?.code || error?.name))
    return 'timeout'
  if (
    status >= 500 ||
    ['ERR_NETWORK', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH'].includes(error?.code)
  )
    return 'network'
  return 'unavailable'
}

export const shouldRetryTrackLookup = (error: any, attempt: number): boolean =>
  attempt < 1 &&
  error?.name !== 'AbortError' &&
  error?.code !== 'ERR_CANCELED' &&
  ['network', 'timeout'].includes(classifyPlaybackFailure(error))

export const classifyRendererDelay = (
  hidden: boolean,
  advanced: boolean
): 'background-timer-delay' | 'renderer-delay' | 'background-playback-delay' =>
  hidden ? (advanced ? 'background-timer-delay' : 'background-playback-delay') : 'renderer-delay'

/** A late watchdog tick after sleep is not evidence that audio stalled during sleep. */
export const shouldRecoverPlayback = (stalledMs: number, checkGapMs: number, timeoutMs: number) =>
  stalledMs >= timeoutMs && checkGapMs < timeoutMs
