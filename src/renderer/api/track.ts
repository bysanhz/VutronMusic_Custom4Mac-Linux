import { lyricLine } from '@/types/music'
import request from '../utils/request'

const isSuccessfulResponse = (result: any) =>
  Boolean(result) && (result.code === undefined || Number(result.code) === 200)

export function getLyric(id: number) {
  return request({
    url: '/lyric/new',
    method: 'get',
    params: { id }
  }) as Promise<lyricLine[]>
}

/**
 * 新版红心接口。
 */
export function likeTrackV1(params: { id: number; like?: boolean }) {
  return request({
    url: '/like/v1',
    method: 'post',
    params: {
      ...params,
      timestamp: Date.now()
    }
  })
}

/**
 * 批量校验歌曲红心状态，用于需要精确服务端状态时的局部同步。
 */
export function checkTrackLiked(ids: Array<number | string>) {
  return request({
    url: '/song/like/check',
    method: 'get',
    params: {
      ids: ids.join(','),
      timestamp: Date.now()
    }
  })
}

/**
 * 喜欢/取消喜欢歌曲。
 *
 * 现有调用点无需改动：优先走 `/like/v1`，失败后自动回退旧 `/like`。
 * 两个接口都失败时显式抛错，让上层保持原来的失败提示和本地状态。
 */
export async function likeTrack(params: { id: number; like?: boolean }) {
  const modernResult = await likeTrackV1(params)
  if (isSuccessfulResponse(modernResult)) {
    const verified = await checkTrackLiked([params.id])
    return { ...modernResult, likeCheck: verified }
  }

  const legacyResult = await request({
    url: '/like',
    method: 'get',
    params: {
      ...params,
      timestamp: Date.now()
    }
  })
  if (isSuccessfulResponse(legacyResult)) return legacyResult

  throw new Error('like track failed')
}

/**
 * 获取歌曲详情。
 */
export function getTrackDetail(ids: string) {
  return request({
    url: '/song/detail',
    method: 'get',
    params: {
      ids
    }
  })
}

export type ScrobbleParams = {
  id: number
  sourceid: number | string
  time?: number
  total?: number
  name?: string
  artist?: string
  bitrate?: number
  level?: string
  source?: string
  vip?: boolean
}

/**
 * 听歌打卡。
 *
 * 优先使用 NCBL `/scrobble/v1`，让桌面客户端的播放记录更贴近网易云当前
 * 客户端上报方式；若新版接口返回失败码或请求本身抛错，则回退传统 `/scrobble`。
 * 旧实现只处理“返回失败码”的情况，一旦 `/scrobble/v1` 直接 reject 就不会执行回退，
 * 会导致本机已经完成的播放没有进入网易云听歌记录。
 */
export async function scrobble(params: ScrobbleParams) {
  try {
    const modernResult = await request({
      url: '/scrobble/v1',
      method: 'post',
      params: {
        ...params,
        timestamp: Date.now()
      }
    })

    if (isSuccessfulResponse(modernResult)) return modernResult
  } catch (error) {
    console.warn('[Track API] /scrobble/v1 上报失败，回退旧接口：', error)
  }

  return request({
    url: '/scrobble',
    method: 'get',
    params: {
      id: params.id,
      sourceid: params.sourceid,
      time: params.time,
      timestamp: Date.now()
    }
  })
}

/**
 * 新歌速递。
 */
export function topSong(type: number) {
  return request({
    url: '/top/song',
    method: 'get',
    params: {
      type
    }
  })
}

/**
 * 新碟上架。
 */
export function topAlbum(params: any) {
  return request({
    url: '/top/album',
    method: 'get',
    params
  })
}
