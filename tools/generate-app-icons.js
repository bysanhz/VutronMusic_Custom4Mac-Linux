const fs = require('fs/promises')
const path = require('path')
const sharp = require('sharp')

const projectRoot = path.resolve(__dirname, '..')
const sourceIconPath = path.join(projectRoot, 'new_icon.png')
const generatedRoot = path.join(projectRoot, 'buildAssets', 'generated-icons')
const linuxIconDirectory = path.join(generatedRoot, 'linux')
const trayIconDirectory = path.join(generatedRoot, 'tray')
const commonIconPath = path.join(generatedRoot, '1024x1024.png')
const trayIconPath = path.join(trayIconDirectory, '24x24.png')
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

// ======== newADD start======
/**
 * 判断像素是否属于与画布边界相连的近白色背景。
 *
 * Args:
 *   data: RGBA 原始像素缓冲区。
 *   offset: 当前像素在缓冲区中的字节偏移。
 *
 * Returns:
 *   像素接近中性白色时返回 true。
 *
 * Raises:
 *   不抛出异常。
 */
const isNearWhitePixel = (data, offset) => {
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  const alpha = data[offset + 3]
  const minimumChannel = Math.min(red, green, blue)
  const maximumChannel = Math.max(red, green, blue)

  return alpha > 0 && minimumChannel >= 235 && maximumChannel - minimumChannel <= 18
}

/**
 * 仅移除从图像边缘可达的近白色背景。
 *
 * 详细说明：
 * 图标主体内部可能包含白色文字或高光，因此不能按颜色全局删除白色。
 * 这里从四条画布边界执行四邻域洪泛，只把与外部背景连通的近白色像素
 * 设为透明，从而保留图标主体内部的白色细节和圆角抗锯齿边缘。
 *
 * Args:
 *   data: RGBA 原始像素缓冲区。
 *   width: 图像宽度。
 *   height: 图像高度。
 *
 * Returns:
 *   已移除外部白色背景的 RGBA 缓冲区。
 *
 * Raises:
 *   不抛出异常。
 */
const removeConnectedWhiteBackground = (data, width, height) => {
  const pixelCount = width * height
  const visited = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  let queueHead = 0
  let queueTail = 0

  const enqueuePixel = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return

    const pixelIndex = y * width + x
    if (visited[pixelIndex]) return

    const byteOffset = pixelIndex * 4
    if (!isNearWhitePixel(data, byteOffset)) return

    visited[pixelIndex] = 1
    queue[queueTail] = pixelIndex
    queueTail += 1
  }

  for (let x = 0; x < width; x += 1) {
    enqueuePixel(x, 0)
    enqueuePixel(x, height - 1)
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueuePixel(0, y)
    enqueuePixel(width - 1, y)
  }

  while (queueHead < queueTail) {
    const pixelIndex = queue[queueHead]
    queueHead += 1

    const byteOffset = pixelIndex * 4
    data[byteOffset + 3] = 0

    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    enqueuePixel(x - 1, y)
    enqueuePixel(x + 1, y)
    enqueuePixel(x, y - 1)
    enqueuePixel(x, y + 1)
  }

  return data
}

/**
 * 读取图标并生成透明外部背景的原始像素数据。
 *
 * Returns:
 *   包含 data、width、height 和 channels 的原始图像信息。
 *
 * Raises:
 *   图标读取失败时向外抛出异常。
 */
const readTransparentSourceIcon = async () => {
  const { data, info } = await sharp(sourceIconPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    data: removeConnectedWhiteBackground(data, info.width, info.height),
    width: info.width,
    height: info.height,
    channels: info.channels
  }
}

/** 根据同一份透明 RGBA 数据创建独立的 sharp 实例。 */
const createTransparentIconImage = (source) => {
  return sharp(Buffer.from(source.data), {
    raw: {
      width: source.width,
      height: source.height,
      channels: source.channels
    }
  })
}
// =========== newADD end ========

/**
 * 生成 electron-builder 需要的跨平台图标资源。
 *
 * 详细说明：
 * Linux 的图标目录必须使用 NxN.png 文件名，并且文件实际尺寸需要与名称一致。
 * macOS 和 Windows 使用同一张 1024x1024 PNG，由 electron-builder 转换为 ICNS/ICO。
 * 同时生成 24x24 透明托盘图标，供 Linux 顶部状态栏直接加载。
 *
 * Returns:
 *   Promise<void>。
 *
 * Raises:
 *   图标读取、校验或写入失败时向外抛出异常并终止构建。
 */
const generateAppIcons = async () => {
  const metadata = await sharp(sourceIconPath).metadata()
  validateSourceIcon(metadata)

  await fs.rm(generatedRoot, { recursive: true, force: true })
  await fs.mkdir(linuxIconDirectory, { recursive: true })
  await fs.mkdir(trayIconDirectory, { recursive: true })

  const transparentSource = await readTransparentSourceIcon()

  await createTransparentIconImage(transparentSource)
    .resize(1024, 1024, { fit: 'contain' })
    .png()
    .toFile(commonIconPath)

  await Promise.all(
    linuxIconSizes.map(async (size) => {
      const outputPath = path.join(linuxIconDirectory, `${size}x${size}.png`)
      await createTransparentIconImage(transparentSource)
        .resize(size, size, { fit: 'contain' })
        .png()
        .toFile(outputPath)
    })
  )

  await createTransparentIconImage(transparentSource)
    .resize(24, 24, { fit: 'contain' })
    .png()
    .toFile(trayIconPath)

  console.log(
    `[AppIcon] 已生成透明背景 1024x1024 图标、${linuxIconSizes.length} 个 Linux 图标尺寸及 24x24 托盘图标`
  )
}

generateAppIcons().catch((error) => {
  console.error('[AppIcon] 图标生成失败：', error)
  process.exitCode = 1
})
