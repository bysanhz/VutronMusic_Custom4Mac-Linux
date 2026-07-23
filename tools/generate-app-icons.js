const fs = require('fs/promises')
const path = require('path')
const sharp = require('sharp')

const projectRoot = path.resolve(__dirname, '..')
const sourceIconPath = path.join(projectRoot, 'new_icon.png')
const generatedRoot = path.join(projectRoot, 'buildAssets', 'generated-icons')
const linuxIconDirectory = path.join(generatedRoot, 'linux')
const commonIconPath = path.join(generatedRoot, '1024x1024.png')
const linuxIconSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]

/**
 * 验证应用图标源文件是否满足打包要求。
 *
 * Args:
 *   metadata: sharp 读取到的图像元数据。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   源图不是正方形或尺寸小于 512 像素时抛出异常。
 */
const validateSourceIcon = (metadata) => {
  const width = Number(metadata.width)
  const height = Number(metadata.height)

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('无法读取 new_icon.png 的尺寸')
  }

  if (width !== height) {
    throw new Error(`new_icon.png 必须为正方形，当前为 ${width}x${height}`)
  }

  if (width < 512) {
    throw new Error(`new_icon.png 至少需要 512x512，当前为 ${width}x${height}`)
  }
}

/**
 * 生成 electron-builder 需要的跨平台图标资源。
 *
 * 详细说明：
 * Linux 的图标目录必须使用 NxN.png 文件名，并且文件实际尺寸需要与名称一致。
 * macOS 和 Windows 使用同一张 1024x1024 PNG，由 electron-builder 转换为 ICNS/ICO。
 *
 * Returns:
 *   Promise<void>。
 *
 * Raises:
 *   图标读取、校验或写入失败时向外抛出异常并终止构建。
 */
const generateAppIcons = async () => {
  const sourceImage = sharp(sourceIconPath)
  const metadata = await sourceImage.metadata()
  validateSourceIcon(metadata)

  await fs.rm(generatedRoot, { recursive: true, force: true })
  await fs.mkdir(linuxIconDirectory, { recursive: true })

  await sharp(sourceIconPath).resize(1024, 1024, { fit: 'contain' }).png().toFile(commonIconPath)

  await Promise.all(
    linuxIconSizes.map(async (size) => {
      const outputPath = path.join(linuxIconDirectory, `${size}x${size}.png`)
      await sharp(sourceIconPath).resize(size, size, { fit: 'contain' }).png().toFile(outputPath)
    })
  )

  console.log(`[AppIcon] 已生成 1024x1024 通用图标及 ${linuxIconSizes.length} 个 Linux 图标尺寸`)
}

generateAppIcons().catch((error) => {
  console.error('[AppIcon] 图标生成失败：', error)
  process.exitCode = 1
})
