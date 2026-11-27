import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { resolveTrackAsset } from '../src/main/utils/trackAssetResolver'
import * as failures from '../src/main/utils/neteaseFailure'
import * as playbackInfo from '../src/shared/playbackInfo'
import * as playbackRecovery from '../src/shared/playbackRecovery'
import { serveLocalCover } from '../src/main/utils/coverImageResponse'

// Execute the production utility functions while isolating Electron, accounts and network I/O.
const loadUtils = (
  options: {
    order?: string[]
    readFile?: (path: string) => Promise<Buffer>
    metadata?: () => Promise<any>
    request?: (config: any) => Promise<any>
    cover?: () => Promise<any>
  } = {}
) => {
  const nativeRequire = createRequire(resolve('package.json'))
  const warnings: any[] = []
  const mocks: Record<string, any> = {
    '../store': {
      get: (key: string) =>
        ({
          'settings.trackInfoOrder': options.order || ['online', 'path', 'embedded'],
          'settings.musicQuality': 'lossless'
        })[key]
    },
    '../log': { warn: (...args: any[]) => warnings.push(args) },
    '../appServer/request': options.request || (async () => []),
    './trackAssetResolver': { resolveTrackAsset },
    './neteaseFailure': failures,
    '../../shared/playbackInfo': playbackInfo,
    '../../shared/playbackRecovery': playbackRecovery,
    './coverFetch': {
      fetchNeteaseCover: options.cover || (async () => ({ pic: null, format: '' }))
    },
    './unblockMatcher': {
      matchVerifiedUnblock: async () => ({
        url: 'https://example.com/fallback.flac',
        source: 'fixture'
      })
    },
    './audioDiagnostics': {
      beginAudioDiagnostic: (fields: any) => ({ ...fields }),
      audioFailureCode: () => 'fixture-error'
    },
    electron: { net: {} },
    'music-metadata': {
      parseFile: options.metadata || (async () => ({ common: {}, native: {}, format: {} }))
    },
    fs: {
      promises: {
        readFile:
          options.readFile ||
          (async () => {
            throw Error('ENOENT')
          })
      }
    },
    'file-type': {
      fileTypeFromBuffer: async (buffer: Buffer) =>
        buffer.toString() === 'image' ? { mime: 'image/png' } : undefined
    },
    jschardet: { detect: () => ({ encoding: 'utf-8' }) },
    'iconv-lite': { decode: (buffer: Buffer) => buffer.toString() }
  }
  const code = ts.transpileModule(readFileSync(resolve('src/main/utils/index.ts'), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} as any }
  runInNewContext(code, {
    module,
    exports: module.exports,
    Buffer,
    URL,
    process: { env: {} },
    global: {},
    require: (id: string) =>
      Object.hasOwn(mocks, id)
        ? mocks[id]
        : id.startsWith('node:') || ['path', 'worker_threads'].includes(id)
          ? nativeRequire(id)
          : {}
  })
  return { utils: module.exports, warnings }
}

test('unmatched tracks and online tracks without a file have finite empty-lyric results', async () => {
  for (const order of [
    ['online', 'path', 'embedded'],
    ['path', 'online', 'embedded']
  ]) {
    const { utils } = loadUtils({ order })
    expect(await utils.getLyric({ id: 1, matched: false })).toEqual([])
    expect(await utils.getLyric({ id: 1, matched: true })).toEqual([])
  }
})

test('bad online lyrics and a broken embedded source still allow a sidecar lyric', async () => {
  const { utils, warnings } = loadUtils({
    order: ['online', 'embedded', 'path'],
    request: async () => ({ code: 200, lrc: null }),
    metadata: async () => {
      throw Error('corrupt metadata')
    },
    readFile: async () => Buffer.from('[00:01.00]sidecar lyric')
  })
  const lyrics = await utils.getLyric({ id: 1, matched: true, filePath: '/fixture/song.flac' })
  expect(lyrics[0].lyric.text).toBe('sidecar lyric')
  expect(warnings).toHaveLength(1)
  expect(
    await loadUtils().utils.getLyric({ id: 1, matched: false, filePath: '/missing.flac' })
  ).toEqual([])
})

test('native embedded lyrics remain available when common lyrics are empty', () => {
  const { utils } = loadUtils()
  expect(
    utils.getLyricFromMetadata({
      common: {},
      format: { tagTypes: ['ID3v2.3'] },
      native: { 'ID3v2.3': [{ id: 'USLT', value: { text: '[00:01.00]native lyric' } }] }
    })
  ).toContain('native lyric')
})

test('missing or corrupt covers cannot reach the native image decoder', async () => {
  let decoded = 0
  for (const pic of [null, undefined, new Uint8Array([1]), Buffer.alloc(0)]) {
    const response = await serveLocalCover(
      async () => ({ pic: pic as any, format: '' }),
      () => {
        decoded++
        throw Error('decoder should not run')
      }
    )
    expect(response.status).toBe(404)
  }
  expect(decoded).toBe(0)
  expect(
    (
      await serveLocalCover(async () => {
        throw Error('missing file')
      })
    ).status
  ).toBe(502)
  const pic = Buffer.from('fixture-image')
  const response = await serveLocalCover(
    async () => ({ pic, format: 'image/png' }),
    (cover) => {
      decoded++
      return cover
    }
  )
  expect(response.status).toBe(200)
  expect(Buffer.from(await response.arrayBuffer())).toEqual(pic)
  expect(decoded).toBe(1)
})

test('broken embedded artwork falls through to sidecar artwork, and absent artwork stays absent', async () => {
  const { utils } = loadUtils({
    order: ['embedded', 'path', 'online'],
    metadata: async () => {
      throw Error('corrupt metadata')
    },
    readFile: async () => Buffer.from('image')
  })
  expect((await utils.getPic({ matched: false, filePath: '/fixture/song.flac' })).format).toBe(
    'image/png'
  )
  const absent = await loadUtils().utils.getPic({ matched: false, filePath: '/missing.flac' })
  expect(absent).toEqual({ pic: null, format: '' })
  expect((await serveLocalCover(async () => absent)).status).toBe(404)
})

test('risk-control stops after one quality request and still resolves a fallback source', async () => {
  const levels: string[] = []
  const { utils, warnings } = loadUtils({
    request: async (config) => {
      levels.push(config.params.level)
      throw { response: { status: 400, data: { code: -460, message: 'private response' } } }
    }
  })
  const source = await utils.getAudioSource({ id: 1 })
  expect(levels).toEqual(['lossless'])
  expect(source.url).toBe('https://example.com/fallback.flac')
  expect(JSON.stringify(warnings)).toContain('risk-control')
  expect(JSON.stringify(warnings)).not.toContain('private response')
})

test('a quality-specific failure still retries a lower quality and uses official audio', async () => {
  const levels: string[] = []
  const { utils } = loadUtils({
    request: async (config) => {
      levels.push(config.params.level)
      if (levels.length === 1) throw { response: { status: 400, data: { code: 400 } } }
      return { data: [{ url: 'https://example.com/official.mp3', freeTrialInfo: null }] }
    }
  })
  expect((await utils.getAudioSource({ id: 1 })).source).toBe('netease')
  expect(levels).toEqual(['lossless', 'exhigh'])
})

test('the official source preserves returned quality and a cancelled lookup cannot start fallback work', async () => {
  const { utils } = loadUtils({
    request: async () => ({
      data: [
        {
          url: 'https://example.com/audio.flac',
          freeTrialInfo: null,
          level: 'higher',
          type: 'mp3',
          br: 192000
        }
      ]
    })
  })
  expect((await utils.getAudioSource({ id: 1 })).audioQuality).toMatchObject({
    requested: 'lossless',
    actual: 'higher',
    format: 'MP3'
  })
  const controller = new AbortController()
  const cancelled = loadUtils({
    request: async () => {
      controller.abort()
      throw Error('cancelled')
    }
  })
  await expect(
    cancelled.utils.getAudioSource({ id: 1 }, '', controller.signal)
  ).rejects.toHaveProperty('name', 'AbortError')
  expect(cancelled.warnings).toHaveLength(0)
})
