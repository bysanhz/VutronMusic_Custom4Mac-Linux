/**
 * Safely summarize NetEase report response structure for hourly-data research.
 *
 * Usage: summarizeListenReportSchema(response)
 * Args: response JSON from an authenticated NetEase listening report.
 * Returns: bounded paths, primitive types and array lengths only. Never exports
 *          account identifiers, listening values, song titles or raw response.
 */
export type ReportSchemaNode = {
  path: string
  type: string
  length?: number
}

const MAX_NODES = 120
const MAX_DEPTH = 6
const MAX_KEYS_PER_OBJECT = 40

export const summarizeListenReportSchema = (response: unknown): ReportSchemaNode[] => {
  const nodes: ReportSchemaNode[] = []
  const visited = new WeakSet<object>()
  const walk = (value: unknown, path: string, depth: number): void => {
    if (nodes.length >= MAX_NODES || depth > MAX_DEPTH) return
    if (value === null) {
      nodes.push({ path, type: 'null' })
      return
    }
    if (Array.isArray(value)) {
      nodes.push({ path, type: 'array', length: value.length })
      if (value.length > 0) walk(value[0], path + '[0]', depth + 1)
      return
    }
    if (typeof value === 'object') {
      if (visited.has(value)) return
      visited.add(value)
      nodes.push({ path, type: 'object' })
      for (const [key, child] of Object.entries(value).slice(0, MAX_KEYS_PER_OBJECT)) {
        // Only structural key names are shared. Never output keys looking like IDs or secrets.
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) continue
        if (/token|cookie|secret|password|account|user|phone|email|uid|song|track|music|artist|album|nickname|name/i.test(key)) continue
        walk(child, path + '.' + key, depth + 1)
        if (nodes.length >= MAX_NODES) break
      }
      return
    }
    nodes.push({ path, type: typeof value })
  }
  walk(response, 'response', 0)
  return nodes
}
