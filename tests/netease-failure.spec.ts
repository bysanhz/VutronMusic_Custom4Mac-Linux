import { expect, test } from '@playwright/test'
import {
  isNeteaseTransportFailure,
  summarizeNeteaseFailure
} from '../src/main/utils/neteaseFailure'

test('keeps only safe diagnostics from a timed-out request', () => {
  const failure = summarizeNeteaseFailure({
    status: 502,
    body: {
      msg: {
        code: 'ETIMEDOUT',
        config: { params: { cookie: 'MUSIC_U=private-test-token' } }
      }
    }
  })

  expect(failure).toEqual({ status: 502, code: 'ETIMEDOUT' })
  expect(JSON.stringify(failure)).not.toContain('private-test-token')
  expect(isNeteaseTransportFailure(failure)).toBe(true)
})

test('distinguishes a quality response from a transport failure', () => {
  expect(isNeteaseTransportFailure(summarizeNeteaseFailure({ response: { status: 400 } }))).toBe(
    false
  )
  expect(
    summarizeNeteaseFailure({ status: 502, body: { msg: 'connect ECONNREFUSED 127.0.0.1' } })
  ).toEqual({ status: 502, code: 'ECONNREFUSED' })
})
