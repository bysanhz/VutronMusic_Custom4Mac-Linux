import { parentPort as cachePort } from 'node:worker_threads'
import fs from 'node:fs'
import { extname, join } from 'node:path'
import sharp from 'sharp'
import { fileTypeFromBuffer } from 'file-type'
import { downloadPublicBuffer } from '../security/workerHttp'

const MAX_AUDIO_CACHE_BYTES = 1536 * 1024 * 1024
const MAX_COVER_BYTES = 20 * 1024 * 1024
const SAFE_AUDIO_EXTENSIONS = new Set([
  'mp3',
  'ogg',
  'wav',
  'flac',
  'm4a',
  'aac',
  'mp4',
  'opus',
  'aiff',
  'aif',
  'alac'
])

const normalizeContentType = (value: string) =>
  String(value || 'application/octet-stream').split(';')[0].trim().toLowerCase()

const looksLikeTextPayload = (buffer: Buffer) => {
  const prefix = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart()
  const lower = prefix.toLowerCase()
  return (
    lower.startsWith('<!doctype html') ||
    lower.startsWith('<html') ||
    lower.startsWith('<?xml') ||
    lower.startsWith('{') ||
    lower.startsWith('[')
  )
}

const validateAudioPayload = async (buffer: Buffer, contentType: string) => {
  if (!buffer.length) {
    throw new Error('音频缓存响应为空')
  }

  const normalizedType = normalizeContentType(contentType)
  if (
    normalizedType.startsWith('text/') ||
    normalizedType === 'application/json' ||
    normalizedType === 'application/xml' ||
    looksLikeTextPayload(buffer)
  ) {
    throw new Error(
      `音频缓存收到非音频响应: content-type=${normalizedType}, size=${buffer.length}`
    )
  }

  const detected = await fileTypeFromBuffer(buffer)
  if (detected && !SAFE_AUDIO_EXTENSIONS.has(detected.ext.toLowerCase())) {
    throw new Error(
      `音频缓存文件类型不受支持: ${detected.mime} (.${detected.ext}), size=${buffer.length}`
    )
  }

  const declaredAudio =
    normalizedType.startsWith('audio/') ||
    normalizedType === 'video/mp4' ||
    normalizedType === 'application/ogg' ||
    normalizedType === 'application/octet-stream'

  if (!detected && !declaredAudio) {
    throw new Error(
      `无法确认缓存响应为音频: content-type=${normalizedType}, size=${buffer.length}`
    )
  }

  return detected?.mime || normalizedType
}

const getFilePath = (
  track: Record<string, any>,
  url: URL,
  contentType: string,
  audioCachePath: string
) => {
  const typeMap: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/mp4': 'mp4',
    'audio/opus': 'opus',
    'audio/aiff': 'aiff'
  }

  const normalizedContentType = contentType.split(';')[0].trim().toLowerCase()
  let extension = typeMap[normalizedContentType] || 'mp3'
  if (url.pathname) {
    const urlExtension = extname(url.pathname).toLowerCase().slice(1)
    if (SAFE_AUDIO_EXTENSIONS.has(urlExtension)) extension = urlExtension
  }

  const name = String(track.name || 'track').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  const id = String(track.id || 'track').replace(/[^a-zA-Z0-9_-]/g, '_')
  const bitrate = String(track.br ?? 320000).replace(/[^0-9]/g, '') || '320000'
  return join(audioCachePath, `${id}-${bitrate}-${name}.${extension}`)
}

const getPic = async (value: string): Promise<{ pic: Buffer; format: string }> => {
  const url = new URL(value)
  url.searchParams.set('param', '1024y1024')
  const result = await downloadPublicBuffer(url, { maxBytes: MAX_COVER_BYTES })
  return {
    pic: result.buffer,
    format: result.contentType
  }
}

const updateMetadata = async (audioBuffer: Buffer, track: Record<string, any>) => {
  const { readTags, applyTags, replacePictureByType } = await import('taglib-wasm')
  const tags = await readTags(audioBuffer)

  const newTags = {
    ...tags,
    title: tags.title || track.name,
    album: tags.album || track.al?.name || track.album?.name || track.album,
    artist: tags.artist || ((track.ar || track.artists)?.[0]?.name ?? 'Unknown Artist')
  }

  const modifiedTagBuffer = await applyTags(audioBuffer, newTags)
  const coverUrl = track.al?.picUrl || track.album?.picUrl
  if (!coverUrl) return modifiedTagBuffer

  const image = await getPic(coverUrl)
  image.pic = await sharp(image.pic).resize(512, 512, { fit: 'cover' }).toBuffer()

  return await replacePictureByType(modifiedTagBuffer, {
    mimeType: image.format,
    data: image.pic,
    type: 3
  })
}

const runCacheTask = async (track: Record<string, any>, url: string, audioCachePath: string) => {
  const audio = await downloadPublicBuffer(url, {
    maxBytes: MAX_AUDIO_CACHE_BYTES,
    timeoutMs: 60_000
  })

  // HTTP 200 并不等于拿到了音频。错误页/登录页送进 TagLib 会产生 INVALID_FORMAT。
  // 先结合 Content-Type、文件头与 file-type 做快速校验，再进入元数据写入。
  const validatedContentType = await validateAudioPayload(audio.buffer, audio.contentType)
  const resolvedUrl = new URL(audio.url)
  const filePath = getFilePath(track, resolvedUrl, validatedContentType, audioCachePath)
  const modifiedBuffer = await updateMetadata(audio.buffer, track)
  await fs.promises.writeFile(filePath, Buffer.from(modifiedBuffer))
  const finalSize = (await fs.promises.stat(filePath)).size

  return {
    ...track,
    size: finalSize,
    url: filePath,
    cache: true,
    insertTime: Date.now()
  }
}

type CacheTask = {
  type: 'task'
  track: Record<string, any>
  url: string
  audioCachePath: string
}

const taskQueue: CacheTask[] = []
const queuedTaskKeys = new Set<string>()
let running = false
let quitRequested = false

const getTaskKey = (task: CacheTask) => `${String(task.track?.id || 'track')}::${task.url}`

const notifyFinishedWhenIdle = () => {
  if (quitRequested && !running && taskQueue.length === 0) {
    cachePort?.postMessage({ type: 'finished' })
  }
}

async function processQueue() {
  if (running || taskQueue.length === 0) {
    notifyFinishedWhenIdle()
    return
  }

  running = true
  const task = taskQueue.shift()!

  try {
    const result = await runCacheTask(task.track, task.url, task.audioCachePath)
    cachePort?.postMessage({ type: 'task-done', data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `[Worker cacheTrack] skipped track ${String(task.track?.id || 'unknown')}: ${message}`
    )
    cachePort?.postMessage({
      type: 'task-error',
      data: { trackId: task.track?.id, message }
    })
  } finally {
    queuedTaskKeys.delete(getTaskKey(task))
    running = false
    void processQueue()
  }
}

cachePort?.on('message', (data: CacheTask | { type: 'quit' }) => {
  try {
    if (data.type === 'task') {
      if (quitRequested) return
      const taskKey = getTaskKey(data)
      if (queuedTaskKeys.has(taskKey)) return
      queuedTaskKeys.add(taskKey)
      taskQueue.push(data)
      void processQueue()
    } else {
      quitRequested = true
      notifyFinishedWhenIdle()
    }
  } catch (error) {
    console.error('[Worker cacheTrack] message handler error:', error)
  }
})
