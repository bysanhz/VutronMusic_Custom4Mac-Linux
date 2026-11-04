#!/usr/bin/env node
/**
 * Observe one existing Linux process without restarting or controlling it.
 * Usage: node tools/watch-app-exit.js --pid PID --output /private/path/watch.json
 * Output: bounded local memory samples, disappearance time and cgroup evidence.
 * This non-parent observer cannot recover a process's exit code or signal.
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const MAX_SAMPLES = 120
const SAMPLE_INTERVAL_MS = 15_000

const readIdentity = (pid) => {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = stat
      .slice(stat.lastIndexOf(')') + 2)
      .trim()
      .split(/\s+/)
    if (['Z', 'X'].includes(fields[0])) return null
    return { startTicks: fields[19], state: fields[0] }
  } catch {
    return null
  }
}

const readMemory = (pid) => {
  try {
    const text = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8')
    return Object.fromEntries(
      ['Rss', 'Pss', 'Private_Clean', 'Private_Dirty'].map((name) => [
        name,
        Number(text.match(new RegExp(`^${name}:\\s+(\\d+)`, 'm'))?.[1] || 0)
      ])
    )
  } catch {
    return null
  }
}

const processTreeMemory = (pid) => {
  const pending = [pid]
  const seen = new Set()
  let rssKiB = 0
  let pssKiB = 0
  while (pending.length && seen.size < 128) {
    const current = pending.pop()
    if (seen.has(current)) continue
    seen.add(current)
    const memory = readMemory(current)
    if (memory) {
      rssKiB += memory.Rss
      pssKiB += memory.Pss
    }
    try {
      const children = fs.readFileSync(`/proc/${current}/task/${current}/children`, 'utf8')
      pending.push(...children.trim().split(/\s+/).filter(Boolean).map(Number))
    } catch {
      // Processes may exit between reading their identity and their resources.
    }
  }
  return { processes: seen.size, rssKiB, pssKiB }
}

const readCgroup = (pid) => {
  try {
    const group = fs.readFileSync(`/proc/${pid}/cgroup`, 'utf8').match(/^0::(.+)$/m)?.[1]
    if (!group) return null
    const directory = path.resolve('/sys/fs/cgroup', `.${group}`)
    const scope = path.basename(group)
    return { directory, scope: /^app-[\w.-]+\.scope$/.test(scope) ? scope : null }
  } catch {
    return null
  }
}

const readOomCounters = (group) => {
  try {
    const text = fs.readFileSync(path.join(group.directory, 'memory.events'), 'utf8')
    return Object.fromEntries(
      text
        .trim()
        .split('\n')
        .map((line) => {
          const [key, value] = line.split(/\s+/)
          return [key, Number(value)]
        })
    )
  } catch {
    return null
  }
}

const readScopeResult = (scope) => {
  if (!scope) return null
  try {
    return (
      execFileSync('systemctl', ['--user', 'show', scope, '-p', 'Result', '--value'], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim() || null
    )
  } catch {
    return null
  }
}

const watch = (pid, output) => {
  const identity = readIdentity(pid)
  if (!identity) throw new Error('Target process is not running')
  if (fs.existsSync(output)) throw new Error('Output already exists; choose a new file')
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 })
  const group = readCgroup(pid)
  const record = {
    pid,
    startTicks: identity.startTicks,
    startedAt: new Date().toISOString(),
    state: 'watching',
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    maxSamples: MAX_SAMPLES,
    baselineOomCounters: readOomCounters(group),
    lastOomCounters: null,
    peakTreeRssKiB: 0,
    peakTreePssKiB: 0,
    samples: [],
    exitCode: null,
    signal: null,
    limitation: 'Non-parent observer: disappearance alone does not identify exit code or signal.'
  }
  const write = () => {
    const temporary = `${output}.tmp`
    const fd = fs.openSync(temporary, 'w', 0o600)
    try {
      fs.writeFileSync(fd, JSON.stringify(record, null, 2) + '\n')
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(temporary, output)
  }
  const sample = () => {
    const tree = processTreeMemory(pid)
    record.lastOomCounters = readOomCounters(group) || record.lastOomCounters
    record.peakTreeRssKiB = Math.max(record.peakTreeRssKiB, tree.rssKiB)
    record.peakTreePssKiB = Math.max(record.peakTreePssKiB, tree.pssKiB)
    record.samples.push({ at: new Date().toISOString(), main: readMemory(pid), tree })
    if (record.samples.length > MAX_SAMPLES) record.samples.shift()
    write()
  }
  const finish = (state) => {
    clearInterval(timer)
    record.state = state
    record.finishedAt = new Date().toISOString()
    record.lastOomCounters = readOomCounters(group) || record.lastOomCounters
    record.scopeResult = readScopeResult(group?.scope)
    write()
    console.log(JSON.stringify({ pid, state, finishedAt: record.finishedAt }))
  }
  sample()
  let nextSampleAt = performance.now() + SAMPLE_INTERVAL_MS
  const timer = setInterval(() => {
    const current = readIdentity(pid)
    if (!current || current.startTicks !== identity.startTicks) {
      finish('process-disappeared')
      return
    }
    if (performance.now() >= nextSampleAt) {
      sample()
      nextSampleAt = performance.now() + SAMPLE_INTERVAL_MS
    }
  }, 1000)
  process.once('SIGTERM', () => {
    finish('observer-stopped')
    process.exit(0)
  })
  process.once('SIGINT', () => {
    finish('observer-stopped')
    process.exit(0)
  })
  console.log(JSON.stringify({ pid, state: 'watching', maxSamples: MAX_SAMPLES }))
}

if (require.main === module) {
  try {
    if (process.platform !== 'linux') throw new Error('This observer requires Linux /proc')
    const args = process.argv.slice(2)
    const pidIndex = args.indexOf('--pid')
    const pid = Number(args[pidIndex + 1])
    const outputIndex = args.indexOf('--output')
    if (
      pidIndex < 0 ||
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      outputIndex < 0 ||
      !args[outputIndex + 1]
    ) {
      throw new Error(
        'Usage: node tools/watch-app-exit.js --pid PID --output /private/path/watch.json'
      )
    }
    watch(pid, path.resolve(args[outputIndex + 1]))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { readIdentity, processTreeMemory }
