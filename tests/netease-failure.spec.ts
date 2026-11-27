import { expect, test } from '@playwright/test'
import {
  isNeteaseTransportFailure,
  shouldStopNeteaseQualityFallback,
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

test('preserves risk-control business codes through both upstream and Axios errors without secrets', () => {
  const body = {
    code: -460,
    message: '检测到您的网络环境存在风险，请稍后再试 MUSIC_U=private-token'
  }
  for (const error of [
    { status: 400, body, cookie: ['private-cookie'] },
    { response: { status: 400, data: body }, config: { cookie: 'private-cookie' } }
  ]) {
    const summary = summarizeNeteaseFailure(error)
    expect(summary).toEqual({ status: 400, upstreamCode: -460, reason: 'risk-control' })
    expect(JSON.stringify(summary)).not.toContain('private')
    expect(isNeteaseTransportFailure(summary)).toBe(false)
    expect(shouldStopNeteaseQualityFallback(summary)).toBe(true)
  }
  expect(shouldStopNeteaseQualityFallback({ status: 400 })).toBe(false)
  expect(shouldStopNeteaseQualityFallback({ status: 429 })).toBe(true)
  expect(shouldStopNeteaseQualityFallback({ code: 'ETIMEDOUT' })).toBe(true)
})

test('distinguishes a quality response from a transport failure', () => {
  expect(isNeteaseTransportFailure(summarizeNeteaseFailure({ response: { status: 400 } }))).toBe(
    false
  )
  expect(
    summarizeNeteaseFailure({ status: 502, body: { msg: 'connect ECONNREFUSED 127.0.0.1' } })
  ).toEqual({ status: 502, code: 'ECONNREFUSED' })
})
