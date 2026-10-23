import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('PlayerBar artist keys remain unique when several artists share placeholder id 0', () => {
  const component = readFileSync(
    resolve(process.cwd(), 'src/renderer/components/PlayerBar.vue'),
    'utf8'
  )
  expect(component).toContain(
    ':key="`\u0024{ar.id ?? \'unknown\'}-\u0024{index}`"'
  )
  expect(component).not.toContain(':key="ar.id"')

  const artistIDs = [0, 0, undefined, undefined, 42, 42]
  const keys = artistIDs.map((id, index) => `${id ?? 'unknown'}-${index}`)
  expect(new Set(keys).size).toBe(artistIDs.length)
})
