/** Owns delayed work for a component generation, including callbacks holding child refs. */
export class DeferredTaskScope {
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private revision = 0
  private disposed = false

  restart(): number {
    this.cancel()
    return this.revision
  }

  isCurrent(revision: number): boolean {
    return !this.disposed && this.revision === revision
  }

  schedule(revision: number, callback: () => void, delayMs: number): void {
    if (!this.isCurrent(revision)) return
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      if (this.isCurrent(revision)) callback()
    }, delayMs)
    this.timers.add(timer)
  }

  cancel(): void {
    this.revision += 1
    this.timers.forEach((timer) => clearTimeout(timer))
    this.timers.clear()
  }

  dispose(): void {
    this.disposed = true
    this.cancel()
  }
}
