#!/usr/bin/env node
/**
 * Inspect a local V8 heap snapshot without exporting string values or page contents.
 * Usage: node tools/heap-retainer-audit.mjs snapshot.heapsnapshot [heap-object-id]
 * Input snapshots should come from an isolated test profile. Snapshot capture can
 * trigger collection: this tool establishes reachability, not passive memory usage.
 * Output: selected class counts and bounded strong paths to a selected object.
 */
import { readFileSync, statSync } from 'node:fs'
const [file, objectId] = process.argv.slice(2)
if (!file || statSync(file).size > 128 * 1024 * 1024)
  throw new Error('Expected a local snapshot <=128 MiB')
const heap = JSON.parse(readFileSync(file, 'utf8'))
const { nodes, edges, strings } = heap
const meta = heap.snapshot.meta
const width = meta.node_fields.length,
  edgeWidth = meta.edge_fields.length
const field = Object.fromEntries(meta.node_fields.map((name, index) => [name, index]))
const edgeField = Object.fromEntries(meta.edge_fields.map((name, index) => [name, index]))
const count = nodes.length / width,
  edgeCount = edges.length / edgeWidth
const nodeTypes = meta.node_types[field.type],
  edgeTypes = meta.edge_types[edgeField.type]
const type = (node) => nodeTypes[nodes[node * width + field.type]]
const name = (node) => strings[nodes[node * width + field.name]]
const safe = (value) =>
  String(value)
    .replace(/https?:\/\/[^\s]+/g, (url) => {
      try {
        return new URL(url).origin
      } catch {
        return '[url]'
      }
    })
    .slice(0, 100)
const describe = (node) => ({
  id: String(nodes[node * width + field.id]),
  type: type(node),
  name: safe(name(node))
})
const classes = {}
const starts = new Uint32Array(count + 1)
let target = -1
for (let node = 0; node < count; node++) {
  starts[node + 1] = starts[node] + nodes[node * width + field.edge_count]
  if (String(nodes[node * width + field.id]) === objectId) target = node
  if (
    /XMLHttpRequest|V8EventListener|AbortSignal|NativeContext|Inspector/.test(name(node)) &&
    ['native', 'object', 'hidden'].includes(type(node))
  ) {
    const key = type(node) + ':' + safe(name(node))
    classes[key] = (classes[key] || 0) + 1
  }
}
const paths = []
const captured = []
if (target >= 0) {
  for (let edge = starts[target]; edge < starts[target + 1]; edge++) {
    const index = edge * edgeWidth
    if (strings[edges[index + edgeField.name_or_index]] !== 'context') continue
    const context = edges[index + edgeField.to_node] / width
    for (let capture = starts[context]; capture < starts[context + 1]; capture++) {
      const i = capture * edgeWidth
      const variable = strings[edges[i + edgeField.name_or_index]]
      if (
        ![
          'lyrics',
          'currentTrack',
          'audioNodes',
          'playing',
          'pic',
          'buildOsdFallbackTrackInfo'
        ].includes(variable)
      )
        continue
      captured.push({ variable, ...describe(edges[i + edgeField.to_node] / width) })
    }
  }
  const heads = new Int32Array(count).fill(-1),
    next = new Int32Array(edgeCount).fill(-1),
    from = new Int32Array(edgeCount)
  let offset = 0
  for (let node = 0; node < count; node++) {
    const n = nodes[node * width + field.edge_count]
    for (let j = 0; j < n; j++, offset++) {
      const index = offset * edgeWidth
      if (edgeTypes[edges[index + edgeField.type]] === 'weak') continue
      const to = edges[index + edgeField.to_node] / width
      from[offset] = node
      next[offset] = heads[to]
      heads[to] = offset
    }
  }
  // Reverse BFS: every reported path is strong. Do not follow weak references.
  const seen = new Uint8Array(count),
    towardTarget = new Int32Array(count).fill(-1)
  const queue = [target]
  seen[target] = 1
  for (let read = 0; read < queue.length && paths.length < 3; read++) {
    const node = queue[read]
    if (
      node !== target &&
      (node === 0 || (type(node) === 'object' && name(node).startsWith('Window /')))
    ) {
      const path = [describe(node)]
      let current = node
      while (current !== target && path.length < 24) {
        const edge = towardTarget[current],
          i = edge * edgeWidth
        const kind = edgeTypes[edges[i + edgeField.type]],
          key = edges[i + edgeField.name_or_index]
        const to = edges[i + edgeField.to_node] / width
        path.push({
          via: kind === 'element' || kind === 'hidden' ? key : safe(strings[key]),
          edgeType: kind,
          ...describe(to)
        })
        current = to
      }
      if (current === target) paths.push(path)
      continue
    }
    for (let edge = heads[node]; edge >= 0; edge = next[edge]) {
      const parent = from[edge]
      if (seen[parent]) continue
      seen[parent] = 1
      towardTarget[parent] = edge
      queue.push(parent)
    }
  }
}
console.log(
  JSON.stringify(
    {
      nodeCount: count,
      edgeCount,
      classes,
      target: target < 0 ? null : describe(target),
      captured,
      strongPaths: paths
    },
    null,
    2
  )
)
