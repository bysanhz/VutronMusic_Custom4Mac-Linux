const fs = require('fs/promises')
const crypto = require('crypto')
const path = require('path')
const sharp = require('sharp')

const projectRoot = path.resolve(__dirname, '..')
const sourceIconPath = path.join(projectRoot, 'src/renderer/assets/branding/app-icon.png')
const expectedSourceIconSha256 = 'c4bae4f2da4961dbffb2278b0820bf810a2bea15a31f66a24424863290350bf6'
const generatedRoot = path.join(projectRoot, 'buildAssets/generated-icons')
const macIconSize = 1024
const linuxIconSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]

/**
 * Produce an opaque, full-bleed macOS 26 icon while retaining every fully
 * opaque source pixel. Tahoe may inset transparent legacy artwork in a white
 * squircle; filling *only* the transparent/antialiased corners lets its native
 * icon mask define the outer shape instead. Other platforms keep the original
 * approved rounded transparent source.
 */
const generateMacIcon = async (source) => {
  const { data, info } = await sharp(source)
    .resize(macIconSize, macIconSize)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.channels !== 4) throw new Error('Expected source icon RGBA pixels')

  const image = Buffer.alloc(macIconSize * macIconSize * 3)
  const middle = (macIconSize - 1) / 2
  const centerIndex = (Math.floor(middle) * macIconSize + Math.floor(middle)) * 4
  let maxAlpha = 0
  for (let i = 3; i < data.length; i += 4) maxAlpha = Math.max(maxAlpha, data[i])
  if (maxAlpha < 200) throw new Error('Approved icon has unexpectedly low opacity')
  // Raster exports can have a 254/255 interior. Preserve these colors as-is.
  const solidAlpha = maxAlpha - 1
  console.log(`[AppIcon] Original alpha: max=${maxAlpha}, center=${data[centerIndex + 3]}`)

  for (let y = 0; y < macIconSize; y += 1) {
    for (let x = 0; x < macIconSize; x += 1) {
      const originalIndex = (y * macIconSize + x) * 4
      let colorIndex = originalIndex
      if (data[originalIndex + 3] < solidAlpha) {
        // Extend the nearest opaque color inwards along a ray to the center.
        // The system-rounded corners hide these reconstructed outer pixels.
        const distance = Math.max(Math.abs(x - middle), Math.abs(y - middle))
        let bestAlpha = data[originalIndex + 3]
        for (let step = 1; step <= Math.ceil(distance); step += 1) {
          const progress = Math.min(1, step / distance)
          const sx = Math.round(x + (middle - x) * progress)
          const sy = Math.round(y + (middle - y) * progress)
          const candidate = (sy * macIconSize + sx) * 4
          const alpha = data[candidate + 3]
          if (alpha > bestAlpha) {
            bestAlpha = alpha
            colorIndex = candidate
          }
          if (alpha >= solidAlpha) break
        }
        if (bestAlpha === 0) throw new Error('No visible color along macOS edge ray')
      }
      const outputIndex = (y * macIconSize + x) * 3
      image[outputIndex] = data[colorIndex]
      image[outputIndex + 1] = data[colorIndex + 1]
      image[outputIndex + 2] = data[colorIndex + 2]
    }
  }

  await sharp(image, {
    raw: { width: macIconSize, height: macIconSize, channels: 3 }
  }).png().toFile(path.join(generatedRoot, 'macos-1024x1024.png'))
}

/** Generate build/runtime icons from the approved, already-transparent rounded artwork. */
const generateAppIcons = async () => {
  const source = await fs.readFile(sourceIconPath)
  const hash = crypto.createHash('sha256').update(source).digest('hex')
  if (hash !== expectedSourceIconSha256) throw new Error('Approved icon source SHA-256 mismatch')

  const { width, height } = await sharp(source).metadata()
  if (!width || width !== height || width < 512) {
    throw new Error('Approved icon must be square and at least 512px')
  }

  // The source already has transparent corners. Removing near-white pixels would damage highlights.
  await fs.rm(generatedRoot, { recursive: true, force: true })
  await fs.mkdir(path.join(generatedRoot, 'linux'), { recursive: true })
  await fs.mkdir(path.join(generatedRoot, 'tray'), { recursive: true })
  await sharp(source).resize(1024, 1024).png().toFile(path.join(generatedRoot, '1024x1024.png'))
  await generateMacIcon(source)
  await Promise.all(
    linuxIconSizes.map((size) =>
      sharp(source)
        .resize(size, size)
        .png()
        .toFile(path.join(generatedRoot, 'linux', `${size}x${size}.png`))
    )
  )
  // Use the approved native-size tray export instead of resizing the full illustration again.
  await fs.copyFile(
    path.join(projectRoot, 'src/public/images/tray/vutronmusic-color.png'),
    path.join(generatedRoot, 'tray/24x24.png')
  )
  console.log(
    `[AppIcon] Generated app and opaque macOS icons, ${linuxIconSizes.length} Linux sizes and portrait tray`
  )
}

generateAppIcons().catch((error) => {
  console.error('[AppIcon] Icon generation failed:', error)
  process.exitCode = 1
})
