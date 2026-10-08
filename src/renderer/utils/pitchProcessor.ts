/** Loads the optional pitch effect only while it is needed by the audio graph. */
export class PitchProcessor {
  private modulePromise: Promise<void> | null = null
  private node: AudioWorkletNode | null = null
  private revision = 0
  private closed = false

  constructor(
    private readonly context: AudioContext,
    private readonly moduleUrl: URL
  ) {}

  async get(pitch: number): Promise<AudioWorkletNode | null> {
    if (this.closed || this.context.state === 'closed') return null
    const revision = this.revision

    if (!this.modulePromise) {
      this.modulePromise = this.context.audioWorklet.addModule(this.moduleUrl).catch((error) => {
        this.modulePromise = null
        throw error
      })
    }
    await this.modulePromise

    if (this.closed || revision !== this.revision) return null
    if (!this.node) {
      this.node = new AudioWorkletNode(this.context, 'soundtouch-processor')
    }
    const parameter = this.node.parameters.get('pitch')
    if (parameter) parameter.value = pitch
    return this.node
  }

  release(): void {
    this.revision += 1
    if (!this.node) return
    this.node.disconnect()
    // A processor returning true remains active even after disconnection in Chromium.
    this.node.port.postMessage({ type: 'dispose' })
    this.node.port.close()
    this.node = null
  }

  close(): void {
    this.closed = true
    this.release()
  }
}
