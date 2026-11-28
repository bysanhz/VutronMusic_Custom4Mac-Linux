import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import { pipeline } from 'node:stream/promises'

const MAX_METADATA_BYTES = 8 * 1024 * 1024
const MAX_METADATA_BLOCKS = 256
const STREAMINFO_END = 42

type ReadAt = (target: Buffer, position: number) => Promise<number>

// RFC 9639 §8. The last-block flag determines where the untouched audio frames start.
const findMetadataEnd = async (read: ReadAt, limit: number): Promise<number | null> => {
  const header = Buffer.alloc(4)
  if ((await read(header, 0)) !== 4 || header.toString('ascii') !== 'fLaC') return null

  let offset = 4
  for (let index = 0; index < MAX_METADATA_BLOCKS && offset + 4 <= limit; index++) {
    if ((await read(header, offset)) !== 4) return null
    const type = header[0] & 0x7f
    const length = header.readUIntBE(1, 3)
    if (index === 0 ? type !== 0 || length !== 34 : type === 0 || type === 127) return null
    offset += 4 + length
    if (offset > limit) return null
    if (header[0] & 0x80) return offset
  }
  return null
}

/** Rewrite a bounded FLAC header and stream all following bytes unchanged. */
export const writeFlacMetadata = async (
  source: string,
  destination: string,
  size: number,
  rewrite: (metadata: Buffer) => Promise<Uint8Array>
): Promise<boolean> => {
  const input = await fs.open(source, 'r')
  let original: Buffer
  try {
    const end = await findMetadataEnd(
      async (target, position) => (await input.read(target, 0, target.length, position)).bytesRead,
      Math.min(size - 1, MAX_METADATA_BYTES)
    )
    if (end === null) return false
    original = Buffer.alloc(end)
    if ((await input.read(original, 0, end, 0)).bytesRead !== end) return false
  } finally {
    await input.close()
  }

  let updated: Buffer
  try {
    const output = await rewrite(original)
    updated = Buffer.from(output.buffer, output.byteOffset, output.byteLength)
  } catch {
    // Some variants need the complete file for TagLib to open or save them.
    return false
  }
  const updatedEnd = await findMetadataEnd(
    async (target, position) => updated.copy(target, 0, position, position + target.length),
    updated.length
  )
  if (
    updatedEnd !== updated.length ||
    !updated.subarray(8, STREAMINFO_END).equals(original.subarray(8, STREAMINFO_END))
  ) {
    return false
  }

  async function* withAudioFrames() {
    yield updated
    yield* createReadStream(source, { start: original.length })
  }
  await pipeline(withAudioFrames(), createWriteStream(destination, { flags: 'wx' }))
  return true
}
