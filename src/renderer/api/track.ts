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
 * 这里优先使用传统 `/scrobble`：Enhanced API 的该端点会同时发送
 * `startplay` 与 `play` feedback 日志，其中 `play` 明确用于更新听歌排行计数，
 * 与“听歌足迹”页读取的 `/user/record`、`/listen/data/*` 语义更直接一致。
 *
 * 若传统端点不可用或返回失败，再回退 NCBL `/scrobble/v1`，保留新版桌面
 * 客户端 PLV/PLD 上报能力。这样既优先保证足迹/排行可见更新，也不牺牲兼容性。
 */
export async function scrobble(params: ScrobbleParams) {
  const legacyResult = await request({
    url: '/scrobble',
    method: 'get',
    params: {
      id: params.id,
      sourceid: params.sourceid,
      time: params.time,
      timestamp: Date.now()
    }
  })

  if (isSuccessfulResponse(legacyResult)) return legacyResult

  console.warn('[Track API] /scrobble 上报失败，回退 /scrobble/v1：', legacyResult)

  const modernResult = await request({
    url: '/scrobble/v1',
    method: 'post',
    params: {
      ...params,
      timestamp: Date.now()
    }
  })

  if (isSuccessfulResponse(modernResult)) return modernResult

  console.warn('[Track API] /scrobble/v1 上报同样失败：', modernResult)
  return modernResult ?? legacyResult
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
