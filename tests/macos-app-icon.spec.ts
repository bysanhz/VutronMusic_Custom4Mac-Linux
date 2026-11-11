import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

test('macOS icon is opaque and preserves all approved visible pixels', async () => {
  const sourcePath = resolve('src/renderer/assets/branding/app-icon.png')
  const macPath = resolve('buildAssets/generated-icons/macos-1024x1024.png')
  const sharedPath = resolve('buildAssets/generated-icons/1024x1024.png')

  const macMetadata = await sharp(macPath).metadata()
  expect([macMetadata.width, macMetadata.height]).toEqual([1024, 1024])
  expect(macMetadata.hasAlpha).toBe(false)

  const original = await sharp(sourcePath)
    .resize(1024, 1024)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const mac = await sharp(macPath).ensureAlpha().raw().toBuffer()
  const shared = await sharp(sharedPath).ensureAlpha().raw().toBuffer()

  expect(original.info.channels).toBe(4)
  expect(original.data[3]).toBe(0)
  expect(shared[3]).toBe(0)
  expect(mac[3]).toBe(255)
  // The approved illustration is semi-opaque (often alpha 250–253).
  // Preserve all visible RGB, not just the small number of alpha-255 pixels.
  const solidAlpha = 200
  let opaquePixels = 0
  let formerlyTransparentPixels = 0
  for (let i = 0; i < original.data.length; i += 4) {
    if (mac[i + 3] !== 255) throw new Error(`Mac icon contains alpha at index ${i / 4}`)
    if (original.data[i + 3] >= solidAlpha) {
      opaquePixels += 1
      for (let channel = 0; channel < 3; channel += 1) {
        if (mac[i + channel] !== original.data[i + channel]) {
          throw new Error(`Mac icon changed a visible source pixel at index ${i / 4}`)
        }
      }
    } else {
      formerlyTransparentPixels += 1
    }
  }
  expect(opaquePixels).toBeGreaterThan(500_000)
  expect(formerlyTransparentPixels).toBeGreaterThan(0)
})

test('only macOS packaging uses the opaque icon variant', () => {
  const builder = readFileSync(resolve('buildAssets/builder/config.js'), 'utf8')
  expect(builder).toContain("icon: 'buildAssets/generated-icons/macos-1024x1024.png'")
  expect(builder).toContain("icon: 'buildAssets/generated-icons/1024x1024.png'")
  expect(builder).toContain("icon: 'buildAssets/generated-icons/linux'")
})
