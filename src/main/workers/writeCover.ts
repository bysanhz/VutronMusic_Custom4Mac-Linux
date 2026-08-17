import { parentPort as coverPort } from 'node:worker_threads'
import fs from 'node:fs'
import sharp from 'sharp'
import { downloadPublicBuffer } from '../security/workerHttp'

const MAX_COVER_BYTES = 20 * 1024 * 1024
const MAX_TASK_ATTEMPTS = 3

let currentPlayingPath: string | null = null
let running = false

const checkEmbeddedExist = async (filePath: string) => {
  const { readPictures } = await import('taglib-wasm')
  const decodedPath = decodeURI(filePath)
  const picture = (await readPictures(decodedPath)).find((item) => item.type === 3)
  return Boolean(picture)
}

const writeCoverToEmbedded = async (filePath: string, image: { pic: Buffer; format: string }) => {
  const { replacePictureByType } = await import('taglib-wasm')
  const decodedPath = decodeURI(filePath)
  const modifiedBuffer = await replacePictureByType(decodedPath, {
    mimeType: image.format,
    data: image.pic,
    type: 3
  })
  await fs.promises.writeFile(decodedPath, Buffer.from(modifiedBuffer))
}

const getPicFromApi = async (value: string): Promise<{ pic: Buffer; format: string }> => {
  const url = new URL(value)
  url.searchParams.set('param', '1024y1024')
  const result = await downloadPublicBuffer(url, { maxBytes: MAX_COVER_BYTES })
  return {
    pic: result.buffer,
    format: result.contentType
  }
}

const writeCoverToFile = async (filePath: string, url: string, embedStyle: number) => {
  if (embedStyle === 0) {
    for (const extension of ['.jpg', '.png', '.jpeg', '.webp']) {
      const possibleFile = filePath.replace(/\.[^/.]+$/, extension)
      const exists = await fs.promises
        .access(possibleFile, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false)
      if (exists) return
    }
  }

  const image = await getPicFromApi(url)
  image.pic = await sharp(image.pic).resize(512, 512, { fit: 'cover' }).toBuffer()

  const extension = image.format.includes('image/png') ? '.png' : '.jpg'
  const coverPath = filePath.replace(/\.[^/.]+$/, extension)
  await fs.promises.writeFile(coverPath, image.pic)
}

type EmbedTask = {
  url: string
  functions: Array<typeof writeCoverToEmbedded>
  attempts: number
}

const embeddedMap = new Map<string, EmbedTask>()

const runEmbedTasks = async () => {
  if (running) return
  running = true

  try {
    while (embeddedMap.size > 0) {
      const entries = [...embeddedMap.entries()]
      let processedTask = false

      for (const [filePath, task] of entries) {
        if (filePath === currentPlayingPath) continue
        processedTask = true

        try {
          const image = await getPicFromApi(task.url)
          image.pic = await sharp(image.pic).resize(512, 512, { fit: 'cover' }).toBuffer()
          for (const writeFunction of task.functions) {
            await writeFunction(filePath, image)
          }
          embeddedMap.delete(filePath)
        } catch (error) {
          task.attempts += 1
          console.error(
            `[Cover Writer] 写入 ${filePath} 失败（${task.attempts}/${MAX_TASK_ATTEMPTS}）：`,
            error
          )
          if (task.attempts >= MAX_TASK_ATTEMPTS) {
            embeddedMap.delete(filePath)
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1500))
          }
        }
      }

      if (!processedTask) break
    }
  } finally {
    running = false
  }
}

coverPort?.on(
  'message',
  async (data: {
    type: 'finished' | 'normal'
    filePath: string | null
    currentPlayingPath?: string
    picUrl: string | null
    embedOption: number
    embedStyle: number
  }) => {
    try {
      if (data.type === 'normal') {
        currentPlayingPath = data.currentPlayingPath ?? currentPlayingPath

        if (data.filePath && data.picUrl) {
          const shouldEmbed = data.embedOption === 1 || data.embedOption === 3
          const shouldWriteFile = data.embedOption === 2 || data.embedOption === 3
          const functions: Array<typeof writeCoverToEmbedded> = []

          if (shouldEmbed) {
            const embeddedExists =
              data.embedStyle === 0 ? await checkEmbeddedExist(data.filePath) : false
            if (!embeddedExists) functions.push(writeCoverToEmbedded)
          }

          if (shouldWriteFile) {
            await writeCoverToFile(data.filePath, data.picUrl, data.embedStyle)
          }

          if (functions.length > 0) {
            embeddedMap.set(data.filePath, {
              url: data.picUrl,
              functions,
              attempts: 0
            })
          }
        }
      } else {
        currentPlayingPath = null
      }

      await runEmbedTasks()
      if (data.type === 'finished') {
        coverPort?.postMessage({ status: 'done' })
      }
    } catch (error) {
      console.error('[Worker writeCover] message handler error:', error)
      if (data.type === 'finished') {
        coverPort?.postMessage({ status: 'done' })
      }
    }
  }
)
