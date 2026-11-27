import { test, expect } from '@playwright/test'
import { readNeteaseMembership } from '../src/renderer/services/neteaseMembership'

test('membership grade comes from a current subscription, independently of user account level', () => {
  const response = {
    code: 200,
    data: {
      redVipLevel: 6,
      level: 10,
      associator: { expireTime: 2000 },
      musicPackage: { expireTime: 0 }
    }
  }
  expect(readNeteaseMembership(response, 1000)).toEqual({ kind: 'vip', level: 6, expiresAt: 2000 })
  expect(readNeteaseMembership(response, 2000)).toEqual({
    kind: 'none',
    level: null,
    expiresAt: null
  })
  expect(
    readNeteaseMembership({ code: 200, data: { ...response.data, redVipLevel: undefined } }, 1000)
      .level
  ).toBeNull()
})

test('SVIP and music packages use their own expiry; inactive tiers do not override a current tier', () => {
  const data = {
    redVipLevel: 7,
    redplus: { expireTime: 3000 },
    associator: { expireTime: 2000 },
    musicPackage: { expireTime: 4000 }
  }
  expect(readNeteaseMembership({ code: 200, data }, 1000)).toMatchObject({ kind: 'svip', level: 7 })
  expect(readNeteaseMembership({ code: 200, data }, 3500)).toMatchObject({
    kind: 'music',
    level: null
  })
})

test('failed, incomplete or malformed responses do not turn cached membership into confirmed rights', () => {
  for (const response of [
    null,
    { code: 500 },
    { code: 200, data: {} },
    { code: 200, data: { vipType: 10, redVipLevel: 7 } },
    { code: 200, data: { associator: { expireTime: 'invalid' }, musicPackage: { expireTime: 0 } } }
  ]) {
    expect(readNeteaseMembership(response, 1000)).toEqual({
      kind: 'unknown',
      level: null,
      expiresAt: null
    })
  }
})
