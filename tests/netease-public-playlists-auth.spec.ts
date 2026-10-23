import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { prepareNeteaseRequestParams } from '../src/main/appServer/neteaseRequestParams'

const accountCookies = { MUSIC_U: 'signed-in-account-token', __csrf: 'account-csrf' }

test('Explore all-category hot playlists are identical for signed-in and logged-out requests', () => {
  const query = { cat: '全部', order: 'hot', limit: '24', offset: '0' }
  const loggedIn = prepareNeteaseRequestParams('top/playlist', query, accountCookies)
  const loggedOut = prepareNeteaseRequestParams('top/playlist', query, {})

  expect(loggedIn).toEqual(loggedOut)
  expect(loggedIn).toEqual({ ...query, cookie: {} })
  expect(loggedIn.cookie).not.toHaveProperty('MUSIC_U')
  expect(query).not.toHaveProperty('cookie')
  // Empty object is truthy, so the upstream library does not fall back to
  // NETEASE_COOKIE set in the process environment.
  expect(Boolean(loggedIn.cookie)).toBe(true)
})

test('public all-category requests do not pass explicit authenticated query cookies', () => {
  const result = prepareNeteaseRequestParams(
    'top/playlist',
    { cat: '全部', cookie: 'MUSIC_U=private-token', offset: '24', proxy: 'http://localhost:7890' },
    accountCookies
  )
  expect(result.cookie).toEqual({})
  expect(result.offset).toBe('24')
  expect(result.proxy).toBe('http://localhost:7890')
  expect(prepareNeteaseRequestParams('top/playlist', { limit: '24' }, accountCookies).cookie).toEqual({})
})

test('named playlist genres and personalized recommendation endpoints retain account cookies', () => {
  for (const [name, query] of [
    ['top/playlist', { cat: 'ACG', order: 'hot' }],
    ['top/playlist', { cat: '流行' }],
    ['recommend/resource', {}],
    ['personalized', { limit: '24' }],
    ['playlist/detail', { id: '42' }]
  ] as const) {
    expect(prepareNeteaseRequestParams(name, query, accountCookies).cookie).toEqual(accountCookies)
  }
  expect(
    prepareNeteaseRequestParams('recommend/resource', { cookie: 'MUSIC_U=explicit' }, accountCookies).cookie
  ).toBe('MUSIC_U=explicit')
})

test('Netease Fastify handler uses policy on request query before calling upstream', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/main/appServer/netease.ts'), 'utf8')
  expect(source).toContain("import { prepareNeteaseRequestParams } from './neteaseRequestParams'")
  expect(source).toContain('prepareNeteaseRequestParams(name, req.query, (req as any).cookies)')
  expect(source).toContain('neteaseApi(withDevSystemProxy(params, devSystemProxy))')
})
