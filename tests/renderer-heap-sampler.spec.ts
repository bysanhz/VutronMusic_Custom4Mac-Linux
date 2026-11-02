import { expect, test } from '@playwright/test'
import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { readRendererHeapUsage } from '../src/main/utils/rendererHeapSampler'

const fixture = () => {
  const debuggerApi = Object.assign(new EventEmitter(), {
    attached: false,
    attaches: 0,
    detaches: 0,
    reads: 0,
    response: () =>
      Promise.resolve({
        usedSize: 10,
        totalSize: 20,
        embedderHeapUsedSize: 30,
        backingStorageSize: 40
      }),
    attach() {
      this.attached = true
      this.attaches++
    },
    detach() {
      this.attached = false
      this.detaches++
      this.emit('detach', {}, 'closed')
    },
    isAttached() {
      return this.attached
    },
    sendCommand() {
      this.reads++
      return this.response()
    }
  })
  const target = Object.assign(new EventEmitter(), {
    debugger: debuggerApi,
    destroyed: false,
    devtools: false,
    isDestroyed() {
      return this.destroyed
    },
    isDevToolsOpened() {
      return this.devtools
    }
  })
  return {
    target,
    debuggerApi,
    read: () => readRendererHeapUsage(target as unknown as WebContents)
  }
}

test('500 samples reuse one inspector attachment and release owned state on target destruction', async () => {
  const { read, target, debuggerApi } = fixture()
  for (let i = 0; i < 500; i++)
    expect(await read()).toEqual({
      available: true,
      usedBytes: 10,
      allocatedBytes: 20,
      embedderBytes: 30,
      backingStorageBytes: 40
    })
  expect(debuggerApi.attaches).toBe(1)
  expect(debuggerApi.detaches).toBe(0)
  expect(debuggerApi.listenerCount('detach')).toBe(1)
  expect(target.listenerCount('destroyed')).toBe(1)
  target.destroyed = true
  target.emit('destroyed')
  expect(debuggerApi.detaches).toBe(1)
  expect(debuggerApi.listenerCount('detach')).toBe(0)
  expect((await read()).available).toBe(false)
})

test('foreign sessions and an opened DevTools target are never detached', async () => {
  const { read, target, debuggerApi } = fixture()
  debuggerApi.attached = true
  expect((await read()).available).toBe(true)
  target.emit('destroyed')
  expect(debuggerApi.detaches).toBe(0)
  const other = fixture()
  other.target.devtools = true
  expect(await other.read()).toEqual({ available: false, reason: 'devtools_open' })
  expect(other.debuggerApi.attaches).toBe(0)
})

test('DevTools replacement clears ownership and allows a later diagnostic attachment', async () => {
  const { read, target, debuggerApi } = fixture()
  await read()
  debuggerApi.detach()
  target.devtools = true
  expect((await read()).available).toBe(false)
  target.devtools = false
  await read()
  expect(debuggerApi.attaches).toBe(2)
  expect(debuggerApi.listenerCount('detach')).toBe(1)
  target.emit('destroyed')
})

test('concurrent and timed-out reads keep at most one native command outstanding', async () => {
  const { read, target, debuggerApi } = fixture()
  let finish!: (value: any) => void
  debuggerApi.response = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const results = await Promise.all(Array.from({ length: 10 }, read))
  expect(results.every((result) => !result.available)).toBe(true)
  expect(debuggerApi.reads).toBe(1)
  finish({ usedSize: 1, totalSize: 2 })
  await new Promise((resolve) => setTimeout(resolve, 0))
  debuggerApi.response = () =>
    Promise.resolve({
      usedSize: 10,
      totalSize: 20,
      embedderHeapUsedSize: 30,
      backingStorageSize: 40
    })
  expect((await read()).available).toBe(true)
  expect(debuggerApi.reads).toBe(2)
  target.emit('destroyed')
})
