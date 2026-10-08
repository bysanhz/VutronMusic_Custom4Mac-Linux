import { expect, test } from '@playwright/test'
import { getDevSystemProxy, withDevSystemProxy } from '../src/main/appServer/devSystemProxy'

test('routes development reads through the same system proxy as uploads', () => {
  const proxy = getDevSystemProxy('http://127.0.0.1:7890')
  const params = { cookie: 'MUSIC_U=private-test-token', type: 'month' }

  expect(withDevSystemProxy(params, proxy)).toEqual({ ...params, proxy })
  expect(params).not.toHaveProperty('proxy')
})

test('preserves an explicit app proxy and rejects malformed environment values', () => {
  const params = { proxy: 'http://127.0.0.1:8888' }
  expect(withDevSystemProxy(params, 'http://127.0.0.1:7890/')).toBe(params)
  expect(getDevSystemProxy('invalid')).toBe('')
  expect(getDevSystemProxy('file:///tmp/proxy')).toBe('')
})
