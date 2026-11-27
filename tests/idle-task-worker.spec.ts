import { expect, test } from '@playwright/test'
import { EventEmitter } from 'node:events'
import { Worker } from 'node:worker_threads'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { build } from 'esbuild'
import { IdleTaskWorker } from '../src/main/utils/idleTaskWorker'

class FakeWorker extends EventEmitter {
  messages: any[] = []
  terminated = 0
  postMessage(message: unknown) {
    this.messages.push(message)
  }
  async terminate() {
    this.terminated++
    this.emit('exit', 0)
    return 0
  }
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 35))
const fixture = () => {
  const workers: FakeWorker[] = []
  const errors: unknown[] = []
  const manager = new IdleTaskWorker({
    create: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    },
    onMessage: () => {},
    onError: (error) => errors.push(error),
    idleMs: 10
  })
  return { manager, workers, errors }
}

test('workers are lazy and a new task cancels the idle retirement', async () => {
  const { manager, workers } = fixture()
  expect(workers).toHaveLength(0)
  manager.postMessage({ type: 'task', id: 1 })
  workers[0].emit('message', { type: 'idle', revision: 1 })
  manager.postMessage({ type: 'task', id: 2 })
  await pause()
  expect(workers[0].terminated).toBe(0)
  workers[0].emit('message', { type: 'idle', revision: 2 })
  await expect.poll(() => workers[0].terminated).toBe(1)
  manager.postMessage({ type: 'task', id: 3 })
  expect(workers).toHaveLength(2)
  manager.dispose()
})

test('a stale idle acknowledgement cannot kill an accepted newer task', async () => {
  const { manager, workers } = fixture()
  manager.postMessage({ type: 'task', id: 1 })
  manager.postMessage({ type: 'task', id: 2 })
  workers[0].emit('message', { type: 'idle', revision: 1 })
  await pause()
  expect(workers[0].terminated).toBe(0)
  manager.dispose()
})

test('a replacement waits for draining writes and is not killed by their completion', async () => {
  const { manager, workers } = fixture()
  manager.postMessage({ type: 'task', id: 1 })
  manager.finish()
  expect(workers[0].messages.at(-1)).toEqual({ type: 'quit' })
  expect(workers[0].terminated).toBe(0)
  manager.postMessage({ type: 'task', id: 2 })
  expect(workers).toHaveLength(1)
  workers[0].emit('message', { type: 'finished' })
  expect(workers).toHaveLength(2)
  expect(workers[1].messages[0]).toMatchObject({ type: 'task', id: 2 })
  expect(workers[0].terminated).toBe(1)
  expect(workers[1].terminated).toBe(0)
  manager.dispose()
  manager.postMessage({ type: 'task', id: 3 })
  expect(workers).toHaveLength(2)
})

test('disabling again while a writer drains preserves already accepted queued tasks', () => {
  const { manager, workers } = fixture()
  manager.postMessage({ type: 'task', id: 1 })
  manager.finish()
  manager.postMessage({ type: 'task', id: 2 })
  manager.finish()
  workers[0].emit('message', { type: 'finished' })
  expect(workers).toHaveLength(2)
  expect(workers[1].messages.map((message) => message.type)).toEqual(['task', 'quit'])
  manager.postMessage({ type: 'task', id: 3 })
  expect(workers).toHaveLength(2)
  workers[1].emit('message', { type: 'finished' })
  expect(workers).toHaveLength(3)
  expect(workers[2].messages[0]).toMatchObject({ type: 'task', id: 3 })
  manager.dispose()
})

test('worker failures are reported and allow a replacement', async () => {
  const { manager, workers, errors } = fixture()
  manager.postMessage({ type: 'task' })
  const error = new Error('fixture worker failure')
  workers[0].emit('error', error)
  expect(errors).toEqual([error])
  manager.postMessage({ type: 'task' })
  expect(workers).toHaveLength(2)
  manager.dispose()
})

test('real cache worker drains queued tasks and duplicate submissions before idle release', async ({}, testInfo) => {
  mkdirSync(resolve('tmp'), { recursive: true })
  const directory = mkdtempSync(resolve('tmp/cache-idle-'))
  const output = join(directory, 'worker.cjs')
  const durationSeconds = process.env.VUTRON_CACHE_MEMORY_AUDIT === '1' ? 120 : 2
  const workers: Worker[] = []
  const completed: number[] = []
  const outputPaths: string[] = []
  const errors: unknown[] = []
  const memory: unknown[] = []
  let manager: IdleTaskWorker | undefined
  try {
    await build({
      entryPoints: ['src/main/workers/cacheTrack.ts'],
      outfile: output,
      bundle: true,
      platform: 'node',
      external: ['taglib-wasm', 'music-metadata', 'file-type'],
      plugins: [
        {
          name: 'synthetic-cache-audio',
          setup(b) {
            b.onLoad({ filter: /workerHttp\.ts$/ }, () => ({
              loader: 'js',
              contents: `
          export async function downloadPublicBuffer(url) {
            await new Promise(r=>setTimeout(r,20));
            const wav=Buffer.alloc(44+44100*2*${durationSeconds});wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
            wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);
            wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
            return {buffer:wav,contentType:'audio/wav',url};
          }`
            }))
            b.onLoad({ filter: /cacheTrack\.ts$/ }, (a) => ({
              loader: 'ts',
              contents: readFileSync(a.path, 'utf8').replace(
                'revision: lastTaskRevision',
                'revision: lastTaskRevision, memory: process.memoryUsage()'
              )
            }))
          }
        }
      ]
    })
    manager = new IdleTaskWorker({
      create: () => {
        const worker = new Worker(output)
        workers.push(worker)
        worker.on('message', (msg) => {
          if (msg.type === 'idle') memory.push(msg)
        })
        return worker
      },
      onMessage: (msg) => {
        if (msg.type === 'task-done') {
          completed.push(msg.data.id)
          outputPaths.push(msg.data.url)
        }
        if (msg.type === 'task-error') errors.push(msg.data)
      },
      onError: (error) => errors.push(String(error)),
      idleMs: 30
    })
    const task = (id: number) => ({
      type: 'task',
      track: {
        id,
        name: 'Fixture ' + id,
        ar: [{ name: 'Fixture' }],
        al: { name: 'Fixture' },
        dt: durationSeconds * 1000
      },
      url: 'https://example.com/' + id + '.wav',
      audioCachePath: directory
    })
    manager.postMessage(task(1))
    manager.postMessage(task(1))
    manager.postMessage(task(2))
    await expect.poll(() => completed).toEqual([1, 2])
    await expect.poll(() => workers[0].threadId).toBe(-1)
    manager.postMessage(task(3))
    await expect.poll(() => completed).toEqual([1, 2, 3])
    expect(workers).toHaveLength(2)
    expect(outputPaths).toHaveLength(3)
    expect(outputPaths.every((file) => existsSync(file))).toBe(true)
    writeFileSync(testInfo.outputPath('cache-worker-memory.json'), JSON.stringify(memory, null, 2))
    expect(errors).toEqual([])
    await testInfo.attach('cache-worker-idle-memory', {
      body: JSON.stringify(memory),
      contentType: 'application/json'
    })
  } finally {
    manager?.dispose()
    await Promise.all(workers.map((worker) => worker.terminate()))
    rmSync(directory, { recursive: true, force: true })
  }
})
