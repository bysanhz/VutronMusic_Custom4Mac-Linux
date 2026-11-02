const fs = require('fs/promises')
const crypto = require('crypto')
const path = require('path')
const sharp = require('sharp')

const projectRoot = path.resolve(__dirname, '..')
const sourceIconPath = path.join(projectRoot, 'src/renderer/assets/branding/app-icon.png')
const expectedSourceIconSha256 = 'c4bae4f2da4961dbffb2278b0820bf810a2bea15a31f66a24424863290350bf6'
const generatedRoot = path.join(projectRoot, 'buildAssets/generated-icons')
const linuxIconSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]

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
    `[AppIcon] Generated app icon, ${linuxIconSizes.length} Linux sizes and portrait tray`
  )
}

generateAppIcons().catch((error) => {
  console.error('[AppIcon] Icon generation failed:', error)
  process.exitCode = 1
})
