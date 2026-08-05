import { parentPort as cachePort } from 'node:worker_threads'
import fs from 'node:fs'
import { extname } from 'node:path'
import sharp from 'sharp'
import { downloadPublicBuffer } from '../security/workerHttp'

const MAX_AUDIO_CACHE_BYTES = 1536 * 1024 * 1024
const MAX_COVER_BYTES = 20 * 1024 * 1024

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
    'audio/mp4': 'mp4'
  }

  let extension = 'mp3'
  if (url.pathname) {
    const urlExt = extname(url.pathname).toLowerCase()
    if (urlExt && urlExt.length > 1) extension = urlExt.substring(1)
  }
  const normalizedContentType = contentType.split(';')[0].trim().toLowerCase()
  if (extension === 'mp3' && typeMap[normalizedContentType]) {
    extension = typeMap[normalizedContentType]
  }

  const name = String(track.name || 'track').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  return decodeURI(`${audioCachePath}/${track.id}-${track.br ?? 320000}-${name}.${extension}`)
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
  const resolvedUrl = new URL(audio.url)
  const filePath = getFilePath(track, resolvedUrl, audio.contentType, audioCachePath)
  const modifiedBuffer = await updateMetadata(audio.buffer, track)
  await fs.promises.writeFile(filePath, Buffer.from(modifiedBuffer))

  return {
    ...track,
    size: audio.size,
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
let running = false
let quitRequested = false

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
    console.error('[Worker cacheTrack] task failed:', error)
  } finally {
    running = false
    void processQueue()
  }
}

cachePort?.on(
  'message',
  (data: CacheTask | { type: 'quit' }) => {
    try {
      if (data.type === 'task') {
        if (quitRequested) return
        taskQueue.push(data)
        void processQueue()
      } else {
        quitRequested = true
        notifyFinishedWhenIdle()
      }
    } catch (error) {
      console.error('[Worker cacheTrack] message handler error:', error)
    }
  }
)
