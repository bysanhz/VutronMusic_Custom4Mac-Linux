import { expect, test } from '@playwright/test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  parseLinuxProcessStatus,
  readLinuxAppProcessMemory
} from '../src/main/linuxProcessMemory'

test('parses Linux resident, virtual and anonymous usage without confusing their units', () => {
  const text = [
    'Name:\telectron',
    'PPid:\t123',
    'VmSize:\t10800384 kB',
    'VmRSS:\t524288 kB',
    'RssAnon:\t131072 kB'
  ].join('\n')
  expect(parseLinuxProcessStatus(text)).toEqual({
    ppid: 123,
    rssKiB: 524288,
    virtualKiB: 10800384,
    anonymousKiB: 131072
  })
  expect(parseLinuxProcessStatus('Name:\ttest')).toBeNull()
})

test('includes unreported descendants and separates 10GiB virtual memory from real RSS/PSS', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vutron-linux-proc-'))
  const record = (
    pid: number,
    ppid: number,
    rssKiB: number,
    virtualKiB: number,
    pssKiB?: number
  ) => {
    const parent = join(directory, String(pid))
    mkdirSync(parent)
    writeFileSync(join(parent, 'status'), [
      `Name:\tvutron-child`,
      `PPid:\t${ppid}`,
      `VmSize:\t${virtualKiB} kB`,
      `VmRSS:\t${rssKiB} kB`,
      `RssAnon:\t${Math.floor(rssKiB / 2)} kB`
    ].join('\n'))
    if (pssKiB !== undefined) {
      writeFileSync(join(parent, 'smaps_rollup'), `Pss: ${pssKiB} kB\n`)
    }
  }
  try {
    record(300, 1, 512 * 1024, 11000 * 1024, 400 * 1024)
    record(301, 300, 256 * 1024, 5000 * 1024, 200 * 1024)
    record(302, 301, 128 * 1024, 1000 * 1024, 100 * 1024)
    record(999, 1, 8000 * 1024, 10000 * 1024, 7000 * 1024)

    const result = readLinuxAppProcessMemory(300, [300, 302], directory)
    expect(result).not.toBeNull()
    expect(result!.processCount).toBe(3)
    expect(result!.electronReportedProcessCount).toBe(2)
    expect(result!.residentSumMiB).toBe(896)
    expect(result!.proportionalSumMiB).toBe(700)
    expect(result!.proportionalMeasuredProcessCount).toBe(3)
    expect(result!.largestProcesses.map((x) => x.pid)).toEqual([300, 301, 302])
    expect(result!.largestProcesses[0]).toMatchObject({
      parentPid: 1,
      electronReported: true,
      residentMiB: 512,
      proportionalMiB: 400,
      virtualMiB: 11000
    })
    expect(result!.largestProcesses[1].electronReported).toBe(false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('unreadable PSS is explicitly missing rather than silently reported as zero', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vutron-linux-proc-missing-'))
  const folder = join(directory, '400')
  try {
    mkdirSync(folder)
    writeFileSync(join(folder, 'status'), 'PPid:\t1\nVmRSS:\t1024 kB\nVmSize:\t4096 kB\n')
    const result = readLinuxAppProcessMemory(400, [], directory)
    expect(result?.processCount).toBe(1)
    expect(result?.residentSumMiB).toBe(1)
    expect(result?.proportionalSumMiB).toBeNull()
    expect(result?.proportionalMeasuredProcessCount).toBe(0)
    expect(result?.largestProcesses[0].proportionalMiB).toBeNull()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('missing process tree gracefully reports unavailable', () => {
  expect(readLinuxAppProcessMemory(9999999, [], '/proc')).toBeNull()
  expect(readLinuxAppProcessMemory(999, [], '/not-a-real-proc-directory')).toBeNull()
})

test('runtime diagnostics includes Linux memory but never reads command lines or environment', () => {
  const runtime = readFileSync(resolve('src/main/runtimeDiagnostics.ts'), 'utf8')
  const linux = readFileSync(resolve('src/main/linuxProcessMemory.ts'), 'utf8')
  expect(runtime).toContain("readLinuxAppProcessMemory(process.pid, processMetrics.map((metric) => metric.pid))")
  expect(runtime).toContain('linuxProcessMemory,')
  expect(linux).toContain('/smaps_rollup')
  expect(linux).not.toContain('/cmdline')
  expect(linux).not.toContain('/environ')
})
