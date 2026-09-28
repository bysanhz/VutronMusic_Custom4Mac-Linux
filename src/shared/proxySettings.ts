export type ProxySettings = {
  type?: unknown
  address?: unknown
  port?: unknown
}

/**
 * Build a proxy URL only when the persisted proxy settings are complete and valid.
 *
 * Older settings snapshots can contain partial proxy objects. Treating
 * `undefined !== 0` as "enabled" used to produce malformed values such as
 * `undefined://:` and made every NetEase request fail URL parsing.
 */
export const buildProxyUrl = (value: unknown): string => {
  if (!value || typeof value !== 'object') return ''

  const proxy = value as ProxySettings
  const type = Number(proxy.type)
  if (type !== 1 && type !== 2) return ''

  const address = String(proxy.address ?? '').trim()
  const rawPort = String(proxy.port ?? '').trim()
  if (!address || !rawPort || address.includes('://')) return ''

  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return ''

  const protocol = type === 1 ? 'http' : 'https'
  const candidate = `${protocol}://${address}:${port}`

  try {
    const parsed = new URL(candidate)
    if (
      parsed.protocol !== `${protocol}:` ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return ''
    }
    return candidate
  } catch {
    return ''
  }
}
