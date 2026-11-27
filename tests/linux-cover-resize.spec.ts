import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { resizeCover } from '../src/main/utils/resizeCover'

test('resizes a JPEG cover without a native libvips dependency', async () => {
  const source = readFileSync(resolve(process.cwd(), 'src/public/images/default.jpg'))
  const result = await resizeCover(source, 'image/jpeg', 96)
  const decoded = jpeg.decode(result.pic, { useTArray: true })

  expect(result.format).toBe('image/jpeg')
  expect(decoded.width).toBe(96)
  expect(decoded.height).toBe(96)
})

test('preserves PNG transparency while producing a centered square', async () => {
  const source = new PNG({ width: 4, height: 2 })
  source.data.fill(0)
  for (let y = 0; y < 2; y += 1) {
    for (let x = 1; x < 3; x += 1) {
      const pixel = (y * 4 + x) * 4
      source.data[pixel] = 255
      source.data[pixel + 3] = 255
    }
  }

  const result = await resizeCover(PNG.sync.write(source), 'image/png', 2)
  const decoded = PNG.sync.read(result.pic)
  expect(result.format).toBe('image/png')
  expect(decoded.width).toBe(2)
  expect(decoded.height).toBe(2)
  expect(decoded.data[0]).toBe(255)
  expect(decoded.data[3]).toBe(255)
})

test('crops a panoramic cover before scaling its short edge', async () => {
  const source = new PNG({ width: 4096, height: 2 })
  source.data.fill(0)
  for (let y = 0; y < 2; y++) {
    for (let x = 2047; x <= 2048; x++) {
      const pixel = (y * 4096 + x) * 4
      source.data[pixel] = 255
      source.data[pixel + 3] = 255
    }
  }
  const result = await resizeCover(PNG.sync.write(source), 'image/png', 512)
  const decoded = PNG.sync.read(result.pic)
  expect([decoded.width, decoded.height]).toEqual([512, 512])
  expect([...decoded.data.subarray(0, 4)]).toEqual([255, 0, 0, 255])
  expect([...decoded.data.subarray(-4)]).toEqual([255, 0, 0, 255])
})

test('rejects an excessive output size before allocating the destination', async () => {
  await expect(resizeCover(Buffer.alloc(0), 'image/png', 8192)).rejects.toThrow('输出尺寸')
})
