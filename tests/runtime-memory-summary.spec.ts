import { test, expect } from '@playwright/test'
import { summarizeRuntimeMemory } from '../src/main/utils/memoryTrend'

test('memory units and process roles stay separate, including zero and exited lyric processes', () => {
  const metrics = [
    { pid: 1, memory: { workingSetSize: 1024 } },
    { pid: 2, memory: { workingSetSize: 2048 } },
    { pid: 3, memory: { workingSetSize: 0 } }
  ]
  expect(summarizeRuntimeMemory(metrics, 2, new Set([3]), 'linux', 100)).toEqual({
    sampledAt: 100,
    platform: 'linux',
    mainPid: 2,
    mainWorkingSetMiB: 2,
    mainPrivateMiB: null,
    desktopLyricsCount: 1,
    desktopLyricsWorkingSetMiB: 0,
    appWorkingSetMiB: 3,
    processCount: 3
  })
  expect(
    summarizeRuntimeMemory(metrics.slice(0, 2), 2, new Set([3]), 'linux').desktopLyricsCount
  ).toBe(0)
})

test('unavailable or invalid process measurements are never silently summed as zero', () => {
  for (const value of [undefined, NaN, Infinity, -1]) {
    const sample = summarizeRuntimeMemory(
      [
        { pid: 1, memory: { workingSetSize: 2048 } },
        { pid: 2, memory: { workingSetSize: value } }
      ],
      2,
      new Set([2]),
      'linux'
    )
    expect(sample.mainWorkingSetMiB).toBeNull()
    expect(sample.desktopLyricsWorkingSetMiB).toBeNull()
    expect(sample.appWorkingSetMiB).toBeNull()
  }
  expect(summarizeRuntimeMemory([], 1, new Set(), 'darwin').appWorkingSetMiB).toBeNull()
})

test('Windows private bytes have their own units and cannot be confused with RSS or other platforms', () => {
  const metrics = [{ pid: 9, memory: { workingSetSize: 1024, privateBytes: 8192 } }]
  expect(summarizeRuntimeMemory(metrics, 9, new Set(), 'win32').mainPrivateMiB).toBe(8)
  expect(summarizeRuntimeMemory(metrics, 9, new Set(), 'darwin').mainPrivateMiB).toBeNull()
  expect(summarizeRuntimeMemory(metrics, 9, new Set(), 'linux').mainPrivateMiB).toBeNull()
  expect(summarizeRuntimeMemory(metrics, 10, new Set(), 'win32').mainWorkingSetMiB).toBeNull()
})
