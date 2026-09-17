import { lyricLine } from '@/types/music'
import request from '../utils/request'

const isSuccessfulResponse = (result: any) =>
  Boolean(result) && (result.code === undefined || Number(result.code) === 200)

const isLegacyScrobbleSuccessful = (result: any) => {
  if (!isSuccessfulResponse(result)) return false

  // Enhanced API 的 /scrobble 外层固定返回 code=200；真正的网易云反馈结果
  // 位于 details.play。只看外层 code 会把“请求完成但上游拒绝”误判为成功，
  // 从而永远不会执行 NCBL /scrobble/v1 回退。
  const playResult = result?.details?.play
  return Boolean(playResult) && isSuccessfulResponse(playResult)
}

const normalizeScrobbleSourceId = (sourceid: number | string, trackId: number): number => {
  const numericSourceId = Number(sourceid)
  if (Number.isFinite(numericSourceId) && numericSourceId > 0) {
    return Math.trunc(numericSourceId)
  }

  // 某些列表（例如每日推荐）把路由字符串 `/daily/songs` 当作 playlistSource.id。
  // 网易云 scrobble 的 sourceid 必须是歌曲/歌单/专辑的数值 ID；遇到路由字符串时
  // 使用当前歌曲 ID 作为兜底，避免 feedback 日志被网易云拒绝。
  return trackId
}

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
 * 优先使用传统 `/scrobble`。Enhanced API 会先发送 `startplay`，再发送真正
 * 增加听歌排行计数的 `play` feedback。这里必须检查 `details.play` 的真实响应，
 * 不能只看外层固定的 `code=200`。
 *
 * 若传统 feedback 没有拿到明确成功确认，则自动回退 NCBL `/scrobble/v1`。
 * `sourceid` 必须是数值 ID；每日推荐等页面可能把 `/daily/songs` 这样的路由字符串
 * 存进 playlistSource.id，这里统一规范化，并在非法时使用歌曲自身 ID。
 */
export async function scrobble(params: ScrobbleParams) {
  const sourceid = normalizeScrobbleSourceId(params.sourceid, params.id)
  const legacyResult = await request({
    url: '/scrobble',
    method: 'get',
    params: {
      id: params.id,
      sourceid,
      time: params.time,
      timestamp: Date.now()
    }
  })

  if (isLegacyScrobbleSuccessful(legacyResult)) {
    console.info('[Track API] /scrobble 上报成功：', {
      trackId: params.id,
      sourceid,
      originalSourceid: params.sourceid,
      time: params.time,
      play: legacyResult?.details?.play
    })
    return legacyResult
  }

  console.warn('[Track API] /scrobble 未获得有效 play 确认，回退 /scrobble/v1：', {
    trackId: params.id,
    sourceid,
    originalSourceid: params.sourceid,
    time: params.time,
    legacyResult
  })

  const modernResult = await request({
    url: '/scrobble/v1',
    method: 'post',
    params: {
      ...params,
      sourceid,
      timestamp: Date.now()
    }
  })

  if (isSuccessfulResponse(modernResult)) {
    console.info('[Track API] /scrobble/v1 上报成功：', {
      trackId: params.id,
      sourceid,
      time: params.time,
      result: modernResult
    })
    return modernResult
  }

  console.warn('[Track API] /scrobble/v1 上报同样失败：', {
    trackId: params.id,
    sourceid,
    time: params.time,
    modernResult,
    legacyResult
  })
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
