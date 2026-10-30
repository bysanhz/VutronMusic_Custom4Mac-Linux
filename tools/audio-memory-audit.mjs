#!/usr/bin/env node
/**
 * Sample a local Electron debugging target without changing playback or forcing GC.
 * Usage: node tools/audio-memory-audit.mjs --cdp http://127.0.0.1:9222 \
 *   --seconds 1800 --interval 15 --scenario normal-playback --output /tmp/audio-memory.jsonl
 * Start Electron with --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222.
 * Keep this port local. Output contains numeric memory data and bounded redacted diagnostics;
 * no cookies, complete URLs, page contents or listening-ledger data are read or uploaded.
 */
import { chromium } from 'playwright'
import { appendFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    cdp: { type: 'string' },
    'native-dump': { type: 'boolean', default: false },
    seconds: { type: 'string', default: '1800' },
    interval: { type: 'string', default: '15' },
    scenario: { type: 'string', default: 'idle' },
    output: { type: 'string', default: '/tmp/vutron-memory.jsonl' }
  }
})
const endpoint = new URL(values.cdp || 'http://127.0.0.1:9222')
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
  !['http:', 'ws:'].includes(endpoint.protocol)
) {
  throw new Error('Only a local debugging endpoint is allowed')
}
const seconds = Number(values.seconds)
const interval = Number(values.interval)
if (
  !Number.isFinite(seconds) ||
  seconds < 0 ||
  seconds > 86400 ||
  !Number.isFinite(interval) ||
  interval < 5
) {
  throw new Error('seconds must be 0..86400; interval must be >=5')
}
/** Keep only allocator sizes, never retain trace events, paths or arbitrary string attributes. */
const nativeMemoryDump = async (session) => {
  let complete
  let timer
  let ownsTrace = false
  let endedTrace = false
  const ended = new Promise((resolve) => {
    complete = resolve
  })
  const listener = (event) => complete(event)
  session.once('Tracing.tracingComplete', listener)
  try {
    await session.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      traceConfig: {
        includedCategories: ['disabled-by-default-memory-infra'],
        memoryDumpConfig: { triggers: [] }
      }
    })
    ownsTrace = true
    const requested = await session.send('Tracing.requestMemoryDump', { levelOfDetail: 'detailed' })
    await session.send('Tracing.end')
    endedTrace = true
    const event = await Promise.race([
      ended,
      new Promise(
        (_, reject) => (timer = setTimeout(() => reject(new Error('dump timeout')), 10000))
      )
    ])
    if (!event.stream || !requested.success) return { available: false }
    let raw = ''
    try {
      while (true) {
        const chunk = await session.send('IO.read', { handle: event.stream, size: 65536 })
        raw += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data
        if (raw.length > 32 * 1024 * 1024) throw new Error('dump size limit')
        if (chunk.eof) break
      }
    } finally {
      await session.send('IO.close', { handle: event.stream })
    }
    const results = []
    for (const event of JSON.parse(raw).traceEvents || []) {
      const allocators = event.args?.dumps?.allocators
      if (!allocators) continue
      const sizes = []
      for (const [name, allocator] of Object.entries(allocators)) {
        if (
          !/^(?:v8|malloc|blink_gc|partition_alloc|skia|gpu|media)(?:\/|$)/.test(name) ||
          name.split('/').length > 4
        )
          continue
        const size = allocator.attrs?.size
        if (size?.units === 'bytes' && /^[0-9a-f]+$/i.test(size.value))
          sizes.push({ category: name, bytes: parseInt(size.value, 16) })
      }
      results.push({ pid: event.pid, sizes: sizes.slice(0, 300), truncated: sizes.length > 300 })
    }
    return { available: true, processes: results }
  } catch (error) {
    // Tracing can be owned by DevTools; do not interrupt another tracing session.
    return {
      available: false,
      reason: error.message.includes('already') ? 'tracing_busy' : 'dump_unavailable'
    }
  } finally {
    if (timer) clearTimeout(timer)
    if (ownsTrace && !endedTrace) await session.send('Tracing.end').catch(() => {})
    session.off('Tracing.tracingComplete', listener)
  }
}

const browser = await chromium.connectOverCDP(endpoint.toString())
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((page) => /\/index\.html/.test(page.url()))
  if (!page) throw new Error('Main player window not found')
  const session = await page.context().newCDPSession(page)
  await session.send('Performance.enable')
  await writeFile(values.output, '', { flag: 'wx' })
  const otherSessions = new Map()
  const sampleOtherRenderers = async () => {
    const pages = browser
      .contexts()
      .flatMap((context) => context.pages())
      .filter(
        (other) => other !== page && /\/osdlyric\.html/.test(other.url()) && !other.isClosed()
      )
      .slice(0, 4)
    for (const [other, cdp] of otherSessions)
      if (!pages.includes(other)) {
        await cdp.detach().catch(() => {})
        otherSessions.delete(other)
      }
    return Promise.all(
      pages.map(async (other) => {
        try {
          if (!otherSessions.has(other))
            otherSessions.set(other, await other.context().newCDPSession(other))
          const cdp = otherSessions.get(other)
          return {
            role: 'desktop-lyrics',
            heap: await cdp.send('Runtime.getHeapUsage'),
            dom: await cdp.send('Memory.getDOMCounters')
          }
        } catch {
          return { role: 'desktop-lyrics', available: false }
        }
      })
    )
  }
  const dump = values['native-dump'] ? await nativeMemoryDump(session) : undefined
  const start = Date.now()
  do {
    const [heap, dom, performance, otherRenderers, state] = await Promise.all([
      session.send('Runtime.getHeapUsage'),
      session.send('Memory.getDOMCounters'),
      session.send('Performance.getMetrics'),
      sampleOtherRenderers(),
      page.evaluate(async () => ({
        playback: window.vutronmusic
          ? {
              trackId: window.vutronmusic.currentTrack?.id,
              playing: window.vutronmusic.playing,
              progress: window.vutronmusic.progress,
              media: window.vutronmusic.media
            }
          : null,
        resources: window.mainApi?.getResourceDiagnostics?.() ?? null,
        runtime: await window.mainApi?.invoke('get-runtime-diagnostics')
      }))
    ])
    await appendFile(
      values.output,
      JSON.stringify({
        at: new Date().toISOString(),
        elapsedSeconds: (Date.now() - start) / 1000,
        nativeMemory: dump,
        otherRenderers,
        scenario: values.scenario.slice(0, 64),
        heap,
        dom,
        performance: Object.fromEntries(
          performance.metrics
            .filter((metric) =>
              ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].includes(
                metric.name
              )
            )
            .map((metric) => [metric.name, metric.value])
        ),
        ...state
      }) + '\n'
    )
    if (Date.now() - start >= seconds * 1000) break
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(interval * 1000, seconds * 1000 - (Date.now() - start)))
    )
  } while (true)
  console.log(`Saved local memory samples to ${values.output}`)
} finally {
  // disconnect only; chromium.connectOverCDP does not own the user's application.
  await browser.close()
}
