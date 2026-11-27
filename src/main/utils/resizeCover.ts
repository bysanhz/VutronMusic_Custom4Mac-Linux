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
  if (!Number.isInteger(size) || size < 1 || size > 2048) throw new Error('封面输出尺寸无效或过大')
  const format = sourceFormat.split(';')[0].trim().toLowerCase()
  // Jimp does not decode WebP/AVIF. NetEase serves these at a bounded 1024px URL,
  // so keep the original image rather than loading native libvips in Electron.
  if (format === 'image/webp' || format === 'image/avif') return { pic, format }

  const image = await Jimp.read(pic)
  const { width, height } = image.bitmap
  if (!width || !height || width * height > MAX_COVER_PIXELS) {
    throw new Error('封面尺寸无效或过大')
  }

  // Crop before resizing: scaling a panoramic image by its short side can
  // otherwise allocate billions of pixels before discarding almost all of them.
  const side = Math.min(width, height)
  if (width !== height) {
    const offsetX = Math.floor((width - side) / 2)
    const offsetY = Math.floor((height - side) / 2)
    const cropped = Buffer.alloc(side * side * 4)
    for (let row = 0; row < side; row += 1) {
      image.bitmap.data.copy(
        cropped,
        row * side * 4,
        ((offsetY + row) * width + offsetX) * 4,
        ((offsetY + row) * width + offsetX + side) * 4
      )
    }
    image.bitmap = { data: cropped, width: side, height: side }
  }
  image.resize(size, size)

  const outputFormat = image.getMIME() === Jimp.MIME_PNG ? Jimp.MIME_PNG : Jimp.MIME_JPEG
  return { pic: await image.getBufferAsync(outputFormat), format: outputFormat }
}
