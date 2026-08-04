import path from 'path'
import net from 'net'

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export const isUnsafeObjectKey = (key: string): boolean => UNSAFE_OBJECT_KEYS.has(key)

export const isPathInside = (candidate: string, root: string): boolean => {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export const isPrivateIpAddress = (address: string): boolean => {
  const normalized = address.toLowerCase().split('%')[0]
  const version = net.isIP(normalized)

  if (version === 4) {
    const octets = normalized.split('.').map(Number)
    const [a, b] = octets
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    )
  }

  if (version === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.')
    )
  }

  return false
}

export const isUnsafeHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    isPrivateIpAddress(normalized)
  )
}

export const parseSafeExternalUrl = (value: unknown): URL | null => {
  if (typeof value !== 'string' || value.length > 8192) return null

  try {
    const url = new URL(value)
    if (!SAFE_EXTERNAL_PROTOCOLS.has(url.protocol)) return null
    if (url.username || url.password || isUnsafeHostname(url.hostname)) return null
    return url
  } catch {
    return null
  }
}
