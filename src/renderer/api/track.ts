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
 * 喜欢音乐（旧接口，作为新版接口异常时的兼容回退）。
 */
export function likeTrack(params: { id: number; like?: boolean }) {
  return request({
    url: '/like',
    method: 'get',
    params: {
      ...params,
      timestamp: Date.now()
    }
  })
}

/**
 * 新版红心接口。网易云当前桌面/移动接口会返回更明确的操作结果。
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
 * 批量校验歌曲红心状态，用于 optimistic update 后和服务端最终状态对齐。
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
 * 客户端上报方式；若新版接口因 Cookie、服务端能力或风控失败，则无感回退到
 * 传统 `/scrobble`，不影响现有播放流程。
 */
export async function scrobble(params: ScrobbleParams) {
  const modernResult = await request({
    url: '/scrobble/v1',
    method: 'post',
    params: {
      ...params,
      timestamp: Date.now()
    }
  })

  if (isSuccessfulResponse(modernResult)) return modernResult

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
