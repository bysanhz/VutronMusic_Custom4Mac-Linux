import { expect, test } from '@playwright/test'
import {
  isPathInside,
  isPrivateIpAddress,
  isUnsafeHostname,
  parseSafeExternalUrl
} from '../src/main/security/validation'

test.describe('security validation', () => {
  test('rejects unsafe URL schemes and local targets', () => {
    expect(parseSafeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(parseSafeExternalUrl('file:///etc/passwd')).toBeNull()
    expect(parseSafeExternalUrl('http://127.0.0.1:9863/query')).toBeNull()
    expect(parseSafeExternalUrl('https://example.com/music')).not.toBeNull()
  })

  test('detects private IP ranges', () => {
    expect(isPrivateIpAddress('10.0.0.1')).toBe(true)
    expect(isPrivateIpAddress('172.16.2.4')).toBe(true)
    expect(isPrivateIpAddress('192.168.1.1')).toBe(true)
    expect(isPrivateIpAddress('8.8.8.8')).toBe(false)
    expect(isUnsafeHostname('localhost')).toBe(true)
  })

  test('prevents path traversal outside an allowed root', () => {
    expect(isPathInside('/music/album/song.flac', '/music')).toBe(true)
    expect(isPathInside('/etc/passwd', '/music')).toBe(false)
  })
})
