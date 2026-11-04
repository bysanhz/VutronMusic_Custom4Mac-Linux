import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

test.skip(process.platform !== 'linux', 'The independent exit observer uses Linux /proc')

const stop = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  const finished = once(child, 'exit')
  child.kill('SIGTERM')
  await finished
}

const startTarget = () =>
  spawn(
    process.execPath,
    ['-e', "process.stdin.on('data',()=>process.exit(0))", 'private-marker'],
    {
      stdio: ['pipe', 'ignore', 'ignore']
    }
  )

for (const exit of ['normal', 'SIGKILL'] as const) {
  test(`records ${exit} disappearance without inventing an exit signal or exposing arguments`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'vutron-exit-watch-'))
    const target = startTarget()
    const output = join(directory, 'watch.json')
    const observer = spawn(
      process.execPath,
      [resolve('tools/watch-app-exit.js'), '--pid', String(target.pid), '--output', output],
      { stdio: 'ignore' }
    )
    const observerExit = once(observer, 'exit')
    try {
      await expect
        .poll(() => {
          try {
            return JSON.parse(readFileSync(output, 'utf8')).state
          } catch {
            return null
          }
        })
        .toBe('watching')
      if (exit === 'normal') target.stdin!.end('exit')
      else target.kill('SIGKILL')
      await observerExit
      const text = readFileSync(output, 'utf8')
      const record = JSON.parse(text)
      expect(record).toMatchObject({
        pid: target.pid,
        state: 'process-disappeared',
        exitCode: null,
        signal: null
      })
      expect(record.samples.length).toBeGreaterThan(0)
      expect(record.samples.length).toBeLessThanOrEqual(120)
      expect(record.samples[0].tree.rssKiB).toBeGreaterThan(0)
      expect(new Date(record.finishedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(record.startedAt).getTime()
      )
      expect(statSync(output).mode & 0o777).toBe(0o600)
      expect(text).not.toContain('private-marker')
      expect(observer.exitCode).toBe(0)
    } finally {
      await stop(observer)
      await stop(target)
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

test('stopping observation keeps the target alive and marks only the observer as stopped', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vutron-exit-watch-'))
  const target = startTarget()
  const output = join(directory, 'watch.json')
  const observer = spawn(
    process.execPath,
    [resolve('tools/watch-app-exit.js'), '--pid', String(target.pid), '--output', output],
    { stdio: 'ignore' }
  )
  try {
    await expect
      .poll(() => {
        try {
          return JSON.parse(readFileSync(output, 'utf8')).state
        } catch {
          return null
        }
      })
      .toBe('watching')
    await stop(observer)
    expect(process.kill(target.pid!, 0)).toBe(true)
    expect(JSON.parse(readFileSync(output, 'utf8')).state).toBe('observer-stopped')
  } finally {
    await stop(observer)
    await stop(target)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('refuses to overwrite an earlier observation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vutron-exit-watch-'))
  const target = startTarget()
  const output = join(directory, 'watch.json')
  writeFileSync(output, 'previous-evidence')
  const observer = spawn(
    process.execPath,
    [resolve('tools/watch-app-exit.js'), '--pid', String(target.pid), '--output', output],
    { stdio: 'ignore' }
  )
  try {
    await once(observer, 'exit')
    expect(observer.exitCode).toBe(1)
    expect(readFileSync(output, 'utf8')).toBe('previous-evidence')
    expect(process.kill(target.pid!, 0)).toBe(true)
  } finally {
    await stop(observer)
    await stop(target)
    rmSync(directory, { recursive: true, force: true })
  }
})
