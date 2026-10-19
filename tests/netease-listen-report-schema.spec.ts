import { expect, test } from '@playwright/test'
import { summarizeListenReportSchema } from '../src/renderer/utils/neteaseListenReportSchema'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('cloud report schema inspection returns structural information only', () => {
  const result = summarizeListenReportSchema({
    code: 200,
    data: {
      listenTimeDistributionBlock: {
        durationDetails: [{ hour: 13, duration: 345, userId: 'private-uid' }]
      },
      cookie: 'private-cookie',
      username: 'private-username'
    }
  })
  const output = JSON.stringify(result)
  expect(output).toContain('durationDetails')
  expect(output).toContain('"length":1')
  expect(output).toContain('"path":"response.data.listenTimeDistributionBlock.durationDetails[0].hour"')
  expect(output).not.toContain('private')
  expect(output).not.toContain('345')
  expect(output).not.toContain('username')
})

test('one-click diagnostics inspects week and month report schema without raw records', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer/utils/diagnosticsSnapshotSettings.ts'), 'utf8')
  expect(source).toContain("listenRealtimeReport('week')")
  expect(source).toContain("listenRealtimeReport('month')")
  expect(source).toContain('listenReportSchema: await inspectListenReportSchemas()')
})
