import { expect, test } from '@playwright/test'
import {
  isPathInside,
  isPrivateIpAddress,
  isUnsafeHostname,
  parseSafeExternalUrl
} from '../src/main/security/validation'
import { isRedirectStatus } from '../src/main/security/remoteUrl'
import { deepMerge } from '../src/renderer/utils/v327FeatureShared'

test.describe('security validation', () => {
  test('rejects unsafe URL schemes and local targets', () => {
    expect(parseSafeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(parseSafeExternalUrl('file:///etc/passwd')).toBeNull()
    expect(parseSafeExternalUrl('http://127.0.0.1:9863/query')).toBeNull()
    expect(parseSafeExternalUrl('https://user:secret@example.com/music')).toBeNull()
    expect(parseSafeExternalUrl('https://music.internal/track')).toBeNull()
    expect(parseSafeExternalUrl('https://example.com/music')).not.toBeNull()
  })

  test('detects private and reserved IP ranges', () => {
    expect(isPrivateIpAddress('10.0.0.1')).toBe(true)
    expect(isPrivateIpAddress('100.64.0.1')).toBe(true)
    expect(isPrivateIpAddress('172.16.2.4')).toBe(true)
    expect(isPrivateIpAddress('192.168.1.1')).toBe(true)
    expect(isPrivateIpAddress('198.51.100.1')).toBe(true)
    expect(isPrivateIpAddress('203.0.113.5')).toBe(true)
    expect(isPrivateIpAddress('::1')).toBe(true)
    expect(isPrivateIpAddress('fc00::1')).toBe(true)
    expect(isPrivateIpAddress('::ffff:172.16.0.8')).toBe(true)
    expect(isPrivateIpAddress('8.8.8.8')).toBe(false)
    expect(isUnsafeHostname('localhost')).toBe(true)
  })

  test('recognizes redirect response statuses', () => {
    expect(isRedirectStatus(301)).toBe(true)
    expect(isRedirectStatus(308)).toBe(true)
    expect(isRedirectStatus(200)).toBe(false)
  })

  test('prevents path traversal outside an allowed root', () => {
    expect(isPathInside('/music/album/song.flac', '/music')).toBe(true)
    expect(isPathInside('/etc/passwd', '/music')).toBe(false)
  })

  test('removes unsafe keys recursively while importing settings', () => {
    const patch = JSON.parse(
      '{"safe":{"value":1,"constructor":{"polluted":true}},"__proto__":{"polluted":true}}'
    )

    expect(deepMerge({}, patch)).toEqual({ safe: { value: 1 } })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
