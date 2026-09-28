const NETEASE_ASSET_HTTP_PATTERN = /^http:\/\/([^/]+\.)?music\.126\.net\//i
const NETEASE_ASSET_HOST_PATTERN = /(^|\.)music\.126\.net$/i
const MAX_NORMALIZE_DEPTH = 16

export const normalizeNeteaseAssetUrl = (value: string): string => {
  return NETEASE_ASSET_HTTP_PATTERN.test(value) ? value.replace(/^http:/i, 'https:') : value
}

const repairRepeatedImageQuery = (value: string): string => {
  const queryIndex = value.indexOf('?')
  if (queryIndex < 0) return value

  const head = value.slice(0, queryIndex + 1)
  const query = value.slice(queryIndex + 1).replace(/\?param=/gi, '&param=')
  return head + query
}

export const isNeteaseAssetUrl = (value: string): boolean => {
  try {
    const url = new URL(normalizeNeteaseAssetUrl(value))
    return ['http:', 'https:'].includes(url.protocol) && NETEASE_ASSET_HOST_PATTERN.test(url.hostname)
  } catch {
    return false
  }
}

export const buildNeteaseImageUrl = (value: string, size?: number): string => {
  if (!value) return ''

  const normalized = repairRepeatedImageQuery(normalizeNeteaseAssetUrl(value.trim()))
  if (!isNeteaseAssetUrl(normalized)) return normalized

  try {
    const url = new URL(normalized)
    if (size && Number.isFinite(size) && size > 0) {
      url.searchParams.set('param', `${Math.round(size)}y${Math.round(size)}`)
    }
    return url.toString()
  } catch {
    return normalized
  }
}

export const buildNeteaseImageProxyUrl = (value: string, size?: number): string => {
  const directUrl = buildNeteaseImageUrl(value, size)
  return isNeteaseAssetUrl(directUrl)
    ? `atom://get-image/${encodeURIComponent(directUrl)}`
    : ''
}

export const getNeteaseImageCandidateUrls = (value: string): string[] => {
  const directUrl = buildNeteaseImageUrl(value)
  if (!isNeteaseAssetUrl(directUrl)) return directUrl ? [directUrl] : []

  try {
    const url = new URL(directUrl)
    const match = url.hostname.match(/^([ps])(\d+)\.music\.126\.net$/i)
    if (!match) return [directUrl]

    const prefix = match[1].toLowerCase()
    const maxIndex = prefix === 'p' ? 3 : 4
    const candidates = [directUrl]
    for (let index = 1; index <= maxIndex; index += 1) {
      const candidate = new URL(directUrl)
      candidate.hostname = `${prefix}${index}.music.126.net`
      candidates.push(candidate.toString())
    }
    return Array.from(new Set(candidates))
  } catch {
    return [directUrl]
  }
}

/**
 * 递归规范网易云接口对象中的静态资源地址。
 *
 * 接口结果是普通 JSON 数据。函数原地更新数组和对象，避免对大型歌单重复深拷贝；
 * WeakSet 防止意外循环引用，深度限制避免异常数据造成无限递归。
 */
export const normalizeNeteaseAssetUrls = <T>(value: T): T => {
  const visited = new WeakSet<object>()

  const visit = (current: unknown, depth: number): unknown => {
    if (typeof current === 'string') return normalizeNeteaseAssetUrl(current)
    if (!current || typeof current !== 'object' || depth > MAX_NORMALIZE_DEPTH) return current
    if (visited.has(current)) return current
    visited.add(current)

    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        current[index] = visit(current[index], depth + 1)
      }
      return current
    }

    for (const [key, item] of Object.entries(current)) {
      ;(current as Record<string, unknown>)[key] = visit(item, depth + 1)
    }
    return current
  }

  return visit(value, 0) as T
}
