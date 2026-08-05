const NETEASE_ASSET_HTTP_PATTERN = /^http:\/\/([^/]+\.)?music\.126\.net\//i
const MAX_NORMALIZE_DEPTH = 16

export const normalizeNeteaseAssetUrl = (value: string): string => {
  return NETEASE_ASSET_HTTP_PATTERN.test(value) ? value.replace(/^http:/i, 'https:') : value
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
