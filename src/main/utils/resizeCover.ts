import configure from '@jimp/custom'
import types from '@jimp/types'
import resize from '@jimp/plugin-resize'

const Jimp = configure({ types: [types], plugins: [resize] })
const MAX_COVER_PIXELS = 20_000_000

/** Resize embedded covers in pure JavaScript so Electron never loads sharp's bundled GLib. */
export const resizeCover = async (
  pic: Buffer,
  sourceFormat: string,
  size = 512
): Promise<{ pic: Buffer; format: string }> => {
  const format = sourceFormat.split(';')[0].trim().toLowerCase()
  // Jimp does not decode WebP/AVIF. NetEase serves these at a bounded 1024px URL,
  // so keep the original image rather than loading native libvips in Electron.
  if (format === 'image/webp' || format === 'image/avif') return { pic, format }

  const image = await Jimp.read(pic)
  const { width, height } = image.bitmap
  if (!width || !height || width * height > MAX_COVER_PIXELS) {
    throw new Error('封面尺寸无效或过大')
  }

  const scale = Math.max(size / width, size / height)
  image.resize(Math.max(size, Math.ceil(width * scale)), Math.max(size, Math.ceil(height * scale)))

  const offsetX = Math.floor((image.bitmap.width - size) / 2)
  const offsetY = Math.floor((image.bitmap.height - size) / 2)
  const cropped = Buffer.alloc(size * size * 4)
  for (let row = 0; row < size; row += 1) {
    image.bitmap.data.copy(
      cropped,
      row * size * 4,
      ((offsetY + row) * image.bitmap.width + offsetX) * 4,
      ((offsetY + row) * image.bitmap.width + offsetX + size) * 4
    )
  }
  image.bitmap = { data: cropped, width: size, height: size }

  const outputFormat = image.getMIME() === Jimp.MIME_PNG ? Jimp.MIME_PNG : Jimp.MIME_JPEG
  return { pic: await image.getBufferAsync(outputFormat), format: outputFormat }
}
