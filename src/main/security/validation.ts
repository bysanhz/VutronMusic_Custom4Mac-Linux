import path from 'path'
import net from 'net'

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export const isUnsafeObjectKey = (key: string): boolean => UNSAFE_OBJECT_KEYS.has(key)

export const isPathInside = (candidate: string, root: string): boolean => {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

const isNonPublicIpv4 = (address: string): boolean => {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return true

  const [a, b, c] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

export const isPrivateIpAddress = (address: string): boolean => {
  const normalized = address.toLowerCase().split('%')[0]
  const version = net.isIP(normalized)

  if (version === 4) return isNonPublicIpv4(normalized)

  if (version === 6) {
    if (normalized.startsWith('::ffff:')) {
      const mappedIpv4 = normalized.slice('::ffff:'.length)
      if (net.isIP(mappedIpv4) === 4) return isNonPublicIpv4(mappedIpv4)
    }

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
      normalized.startsWith('2001:db8:')
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
    normalized.endsWith('.internal') ||
    normalized.endsWith('.lan') ||
    normalized === 'home.arpa' ||
    normalized.endsWith('.home.arpa') ||
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
