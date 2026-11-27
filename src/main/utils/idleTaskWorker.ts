/** Retire a worker only after it acknowledges the latest submission as idle. */
export type TaskWorker = {
  postMessage: (message: unknown) => void
  terminate: () => Promise<number>
  on: (event: string, listener: (...args: any[]) => void) => unknown
}

type Session = {
  worker: TaskWorker
  revision: number
  idleTimer?: ReturnType<typeof setTimeout>
  retired: boolean
  finishing: boolean
}

type Options = {
  create: () => TaskWorker
  onMessage: (message: any) => unknown
  onError: (error: unknown) => void
  idleMs?: number
}

export class IdleTaskWorker {
  private current: Session | null = null
  private sessions = new Set<Session>()
  private disposed = false
  private pending: Record<string, unknown>[] = []
  private accepting = true

  constructor(private options: Options) {}

  postMessage(message: Record<string, unknown>): void {
    if (this.disposed) return
    this.accepting = true
    if (this.current?.finishing) {
      this.pending.push(message)
      return
    }
    const session = this.current || this.create()
    this.clearIdle(session)
    const revision = ++session.revision
    try {
      session.worker.postMessage({ ...message, __taskRevision: revision })
    } catch (error) {
      this.retire(session)
      this.options.onError(error)
    }
  }

  /** Finish accepted tasks before starting a replacement for later submissions. */
  finish(): void {
    this.accepting = false
    const session = this.current
    if (!session || session.finishing) return
    session.finishing = true
    this.clearIdle(session)
    try {
      session.worker.postMessage({ type: 'quit' })
    } catch (error) {
      this.retire(session)
      this.options.onError(error)
    }
  }

  dispose(): void {
    this.disposed = true
    this.pending = []
    for (const session of this.sessions) this.retire(session)
  }

  private create(): Session {
    const session: Session = {
      worker: this.options.create(),
      revision: 0,
      retired: false,
      finishing: false
    }
    this.current = session
    this.sessions.add(session)
    session.worker.on('message', (message) => {
      if (session.retired) return
      if (message?.type === 'finished') {
        this.retire(session)
      } else if (message?.type === 'idle') {
        if (this.current !== session || session.finishing || message.revision !== session.revision)
          return
        this.clearIdle(session)
        const revision = session.revision
        session.idleTimer = setTimeout(() => {
          if (this.current === session && session.revision === revision) this.retire(session)
        }, this.options.idleMs ?? 30_000)
        session.idleTimer.unref?.()
      } else {
        try {
          Promise.resolve(this.options.onMessage(message)).catch(this.options.onError)
        } catch (error) {
          this.options.onError(error)
        }
      }
    })
    session.worker.on('exit', () => this.release(session))
    session.worker.on('error', (error) => {
      this.options.onError(error)
      this.retire(session)
    })
    return session
  }

  private clearIdle(session: Session): void {
    if (session.idleTimer !== undefined) clearTimeout(session.idleTimer)
    session.idleTimer = undefined
  }

  private release(session: Session): void {
    if (session.retired) return
    session.retired = true
    this.clearIdle(session)
    if (this.current === session) this.current = null
    this.sessions.delete(session)
    if (!this.disposed && !this.current && this.pending.length) {
      // Never overlap a draining writer and its replacement on the same cache files.
      const pending = this.pending.splice(0)
      const accepting = this.accepting
      for (const message of pending) this.postMessage(message)
      if (!accepting) this.finish()
    }
  }

  private retire(session: Session): void {
    if (session.retired) return
    this.release(session)
    void session.worker.terminate().catch(this.options.onError)
  }
}
