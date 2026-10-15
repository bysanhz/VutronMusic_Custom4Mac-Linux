/**
 * Debounce a paused NetEase listening-session upload.
 *
 * The snapshot contains only stable identifiers. The live-state predicate
 * prevents a delayed callback from submitting after playback resumes, a track
 * changes or a different NetEase account becomes active.
 *
 * This is solely a scheduler. The durable listening ledger owns retries and
 * upload idempotency; cancelling a timer never discards any stored seconds.
 */
export type PausedListenSession = {
  sessionId: string
  accountId: string
  trackId: string
}

export const createNeteasePauseUploadScheduler = (options: {
  delayMs: number
  isStillPaused: (session: PausedListenSession) => boolean
  submit: (session: PausedListenSession) => void
}) => {
  let pending: ReturnType<typeof setTimeout> | null = null

  const cancel = (): void => {
    if (pending !== null) clearTimeout(pending)
    pending = null
  }

  const schedule = (session: PausedListenSession): void => {
    cancel()
    if (!session.sessionId || !session.accountId || session.accountId === 'anonymous') return
    const snapshot = { ...session }
    pending = setTimeout(() => {
      pending = null
      if (options.isStillPaused(snapshot)) options.submit(snapshot)
    }, options.delayMs)
  }

  return { schedule, cancel }
}
