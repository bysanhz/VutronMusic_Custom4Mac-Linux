import cors from '@fastify/cors'
import { BrowserWindow } from 'electron'
import fastify from 'fastify'

export type LikeStatus = 'INDIFFERENT' | 'LIKE' | 'DISLIKE'
export type RepeatType = 'NONE' | 'ALL' | 'ONE'

export interface PlayerInfo {
  hasSong: boolean
  isPaused: boolean
  volumePercent: number
  seekbarCurrentPosition: number
  seekbarCurrentPositionHuman: string
  statePercent: number
  likeStatus: string
  repeatType: string
}

export interface TrackInfo {
  author: string
  title: string
  album: string
  cover: string
  duration: number
  durationHuman: string
  url: string
  id: string
  isVideo: boolean
  isAdvertisement: boolean
  inLibrary: boolean
}

export interface AmuseInfo {
  player: PlayerInfo
  track: TrackInfo
}

export interface Album {
  id: number
  name: string
  picUrl: string
  tns: string[]
}

export interface Artist {
  id: number
  name: string
  tns: string[]
  alias: string[]
}

export interface Track {
  name: string
  id: number
  ar?: Artist[]
  artists?: Artist[]
  al?: Album
  album?: Album
  dt: number
  alia: string[]
  tns?: string[]
}

export interface Lyric {
  lrc: string
  tlyric: string
  romalrc: string
}

export interface GlobalVutronMusic {
  progress: number
  playing: boolean
  volume: number
  currentTrack: Track | {}
  isLiked: boolean
  repeatMode: 'on' | 'one' | 'off'
  lyric: Lyric
}

const emptyAmuse = {
  player: {
    hasSong: false,
    isPaused: true,
    volumePercent: 0,
    seekbarCurrentPosition: 0,
    seekbarCurrentPositionHuman: '0:00',
    statePercent: 0,
    likeStatus: 'INDIFFERENT',
    repeatType: 'NONE'
  },
  track: {
    author: '',
    title: '',
    album: '',
    cover: '',
    duration: 0,
    durationHuman: '0:00',
    url: '',
    id: '',
    isVideo: false,
    isAdvertisement: false,
    inLibrary: false
  }
} satisfies AmuseInfo

export function toDurationHuman(duration: number): string {
  const minutes = Math.floor(duration / 60)
  const seconds = Math.floor(duration % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function transformRepeatMode(mode: string): RepeatType {
  return ({ on: 'ALL', one: 'ONE' } as const)[mode] ?? 'NONE'
}

export async function getAmuseInfo(win: BrowserWindow): Promise<AmuseInfo> {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return emptyAmuse

  const info: GlobalVutronMusic | null | undefined = await win.webContents.executeJavaScript(
    'window.vutronmusic',
    true
  )

  if (!info || !('id' in info.currentTrack)) return emptyAmuse

  const { playing, volume, progress, isLiked, repeatMode, currentTrack: track } = info
  const trackDurationSeconds = Math.max(0, Number(track.dt) / 1000)
  const coverUrl = (track.al || track.album)?.picUrl || ''
  let cover = coverUrl
  try {
    const thumbnailUrl = new URL(coverUrl)
    thumbnailUrl.searchParams.set('param', '256y256')
    cover = thumbnailUrl.toString()
  } catch {
    cover = coverUrl
  }

  return {
    player: {
      hasSong: true,
      isPaused: !playing,
      volumePercent: Math.max(0, Math.min(100, volume * 100)),
      seekbarCurrentPosition: progress,
      seekbarCurrentPositionHuman: toDurationHuman(progress),
      statePercent: trackDurationSeconds > 0 ? progress / trackDurationSeconds : 0,
      likeStatus: isLiked ? 'LIKED' : 'INDIFFERENT',
      repeatType: transformRepeatMode(repeatMode)
    },
    track: {
      author: (track.ar || track.artists || []).map((artist) => artist.name).join(', '),
      title: `${track.name}${track.tns?.length ? ` (${track.tns[0]})` : ''}`,
      album: (track.al || track.album)?.name || '',
      cover,
      duration: trackDurationSeconds,
      durationHuman: toDurationHuman(trackDurationSeconds),
      url: `https://music.163.com/song?id=${track.id}`,
      id: `${track.id}`,
      isVideo: false,
      isAdvertisement: false,
      inLibrary: false
    }
  }
}

export const amuseDefaultPort = 9863

export async function startInstance(win: BrowserWindow) {
  const allowedOrigins = new Set([
    'http://localhost:41830',
    'http://127.0.0.1:41830',
    'http://localhost:40001',
    'http://127.0.0.1:40001'
  ])

  const instance = fastify({
    ignoreTrailingSlash: true,
    bodyLimit: 64 * 1024
  })
    .register(cors, {
      origin: (origin, callback) => {
        callback(null, !origin || allowedOrigins.has(origin))
      },
      methods: ['GET']
    })
    .addHook('onSend', async (_request, reply, payload) => {
      reply.header('Cache-Control', 'no-store')
      reply.header('X-Content-Type-Options', 'nosniff')
      return payload
    })
    .register(async (server) => {
      server.get('/query', async () => await getAmuseInfo(win))
    })

  await instance.listen({ host: '127.0.0.1', port: amuseDefaultPort })
  console.log(`AmuseServer is running at http://127.0.0.1:${amuseDefaultPort}`)

  return instance
}
