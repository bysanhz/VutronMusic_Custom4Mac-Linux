import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { PitchProcessor } from '../src/renderer/utils/pitchProcessor'
import { getBufferedAheadSeconds } from '../src/renderer/utils/audioBufferHealth'

test('reports only contiguous audio ahead of the playhead after a seek', () => {
  const buffered = {
    length: 2,
    start: (index: number) => [0, 90][index],
    end: (index: number) => [20, 120][index]
  }
  expect(getBufferedAheadSeconds({ buffered, currentTime: 18 })).toBe(2)
  expect(getBufferedAheadSeconds({ buffered, currentTime: 50 })).toBe(0)
  expect(getBufferedAheadSeconds({ buffered, currentTime: 95 })).toBe(25)
  expect(getBufferedAheadSeconds(null)).toBe(0)
})

test('cancels a pending pitch load and releases processors when the effect is disabled', async () => {
  let finishLoad!: () => void
  let loadCount = 0
  const nodes: any[] = []
  const originalNode = globalThis.AudioWorkletNode
  globalThis.AudioWorkletNode = class {
    parameters = new Map([['pitch', { value: 1 }]])
    messages: any[] = []
    disconnected = false
    portClosed = false
    port = {
      postMessage: (message: any) => this.messages.push(message),
      close: () => {
        this.portClosed = true
      }
    }

    constructor() {
      nodes.push(this)
    }

    disconnect() {
      this.disconnected = true
    }
  } as unknown as typeof AudioWorkletNode

  try {
    const context = {
      state: 'running',
      audioWorklet: {
        addModule: () => {
          loadCount += 1
          return new Promise<void>((resolve) => {
            finishLoad = resolve
          })
        }
      }
    } as unknown as AudioContext
    const processor = new PitchProcessor(context, new URL('file:///soundtouch-worklet.js'))
    expect(loadCount).toBe(0)
    const pending = processor.get(1.2)
    processor.release()
    finishLoad()
    expect(await pending).toBeNull()
    expect(nodes).toHaveLength(0)

    const [first, same] = await Promise.all([processor.get(1.2), processor.get(1.3)])
    expect(first).toBe(same)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].parameters.get('pitch').value).toBe(1.3)
    processor.release()
    expect(nodes[0].disconnected).toBe(true)
    expect(nodes[0].portClosed).toBe(true)
    expect(nodes[0].messages).toEqual([{ type: 'dispose' }])

    expect(await processor.get(0.9)).not.toBe(first)
    expect(loadCount).toBe(1)
    processor.close()
    expect(await processor.get(1.1)).toBeNull()
    expect(nodes).toHaveLength(2)
  } finally {
    if (originalNode) globalThis.AudioWorkletNode = originalNode
    else delete (globalThis as any).AudioWorkletNode
  }
})

const loadWorklet = () => {
  let Processor: any
  const sandbox = {
    sampleRate: 48000,
    AudioWorkletProcessor: class {
      port = { onmessage: null as any }
    },
    registerProcessor: (_name: string, constructor: any) => {
      Processor = constructor
    }
  }
  vm.runInNewContext(
    readFileSync(resolve('src/renderer/utils/soundtouch-worklet.js'), 'utf8'),
    sandbox
  )
  return new Processor()
}

test('uses the device sample rate and stops the pitch worklet on disposal', () => {
  const processor = loadWorklet()
  expect(processor._pipe.stretch.sampleRate).toBe(48000)
  processor.port.onmessage({ data: { type: 'dispose' } })
  expect(processor.process([], [], {})).toBe(false)
})

test('reuses pitch output memory and zero-fills an underrun instead of replaying samples', () => {
  const processor = loadWorklet()
  const parameters = {
    rate: new Float32Array([1]),
    tempo: new Float32Array([1]),
    pitch: new Float32Array([1]),
    pitchSemitones: new Float32Array([0])
  }
  const input = [new Float32Array(128), new Float32Array(128)]
  const output = [new Float32Array(128), new Float32Array(128)]
  processor._pipe.process = () => undefined
  processor._pipe.outputBuffer.putSamples(new Float32Array([0.5, 0.25]), 0, 1)
  expect(processor.process([input], [output], parameters)).toBe(true)
  expect(output[0][0]).toBe(0.5)
  expect(output[1][0]).toBe(0.25)
  expect(Array.from(output[0].slice(1))).toEqual(Array(127).fill(0))
  const samples = processor._processedSamples
  expect(samples).toBeDefined()
  output.forEach((channel) => channel.fill(1))
  expect(processor.process([input], [output], parameters)).toBe(true)
  expect(processor._processedSamples).toBe(samples)
  expect(Array.from(output[0])).toEqual(Array(128).fill(0))
})
