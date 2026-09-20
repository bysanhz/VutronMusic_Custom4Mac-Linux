import { lyricLine } from '@/types/music'
import request from '../utils/request'
import { addPendingNeteaseListenSeconds } from '../utils/neteaseListenPending'

const isSuccessfulResponse = (result: any) =>
  Boolean(result) && (result.code === undefined || Number(result.code) === 200)

const isLegacyScrobbleSuccessful = (result: any) => {
  if (!isSuccessfulResponse(result)) return false

  // Enhanced API 的 /scrobble 外层固定返回 code=200；真正的网易云反馈结果
  // 位于 details.play。只看外层 code 会把“请求完成但上游拒绝”误判为成功，
  // 从而永远不会执行 NCBL 回退。
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

const SCROBBLE_DEDUP_WINDOW_MS = 10_000
const MIN_NETEASE_SCROBBLE_SECONDS = 30
const scrobbleInFlight = new Map<number, Promise<any>>()
const lastSuccessfulScrobbleAt = new Map<number, number>()

/**
 * scrobble 的成功/回退/去重信息只在开发环境输出。
 * 真正失败仍使用 console.warn，避免生产版控制台被正常回退路径刷屏。
 */
const debugScrobble = (...args: any[]) => {
  if (import.meta.env.DEV) console.debug(...args)
}

/**
 * VutronMusic 侧的短播放保护。
 *
 * 普通歌曲至少实际播放 30 秒才写入网易云听歌记录；不足 30 秒的短曲必须完整
 * 播放才计入。该规则用于避免快速切歌、误触下一首等行为污染“听歌足迹”。
 */
const getMinimumScrobbleSeconds = (total?: number): number => {
  const totalSeconds = Number(total)
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return MIN_NETEASE_SCROBBLE_SECONDS
  }

  return Math.min(MIN_NETEASE_SCROBBLE_SECONDS, Math.max(1, Math.floor(totalSeconds)))
}

/**
 * 执行一次真正的网易云听歌上报。
 *
 * 该函数不负责并发去重；去重统一在导出的 scrobble() 外层完成，保证来自播放器
 * 不同回调（例如 next/ended）甚至不同组件实例的重复调用也只产生一次网络写入。
 */
const performScrobble = async (params: ScrobbleParams) => {
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
    debugScrobble('[Track API] /scrobble 上报成功：', {
      trackId: params.id,
      sourceid,
      originalSourceid: params.sourceid,
      time: params.time,
      play: legacyResult?.details?.play
    })
    return legacyResult
  }

  // 当前 Enhanced API 的 legacy feedback 经常没有返回有效 play 确认，
  // 回退 NCBL 是正常路径，不应在生产环境制造 warning。
  debugScrobble('[Track API] /scrobble 未获得有效 play 确认，回退稳定 NCBL 路由：', {
    trackId: params.id,
    sourceid,
    originalSourceid: params.sourceid,
    time: params.time,
    legacyResult
  })

  const modernResult = await request({
    url: '/scrobble-v1',
    method: 'post',
    params: {
      ...params,
      sourceid,
      timestamp: Date.now()
    }
  })

  if (isSuccessfulResponse(modernResult)) {
    debugScrobble('[Track API] /scrobble-v1 上报成功：', {
      trackId: params.id,
      sourceid,
      time: params.time,
      result: modernResult
    })
    return modernResult
  }

  console.warn('[Track API] /scrobble-v1 上报失败：', {
    trackId: params.id,
    sourceid,
    time: params.time,
    modernResult,
    legacyResult
  })
  return modernResult ?? legacyResult
}

/**
 * 听歌打卡。
 *
 * 优先使用传统 `/scrobble`。Enhanced API 会先发送 `startplay`，再发送真正
 * 增加听歌排行计数的 `play` feedback。这里必须检查 `details.play` 的真实响应，
 * 不能只看外层固定的 `code=200`。
 *
 * 若传统 feedback 没有拿到明确成功确认，则回退到 VutronMusic 自己注册的
 * `/scrobble-v1` 稳定别名。该别名由主进程直接加载 vendor 的 `scrobble_v1`
 * 模块，不再依赖第三方导出名经过 `pathCase()` 后得到什么 HTTP 路径。
 *
 * `sourceid` 必须是数值 ID；每日推荐等页面可能把 `/daily/songs` 这样的路由字符串
 * 存进 playlistSource.id，这里统一规范化，并在非法时使用歌曲自身 ID。
 *
 * 快速切歌不会直接污染网易云听歌足迹：普通歌曲至少播放 30 秒；不足 30 秒的
 * 短曲要求完整播放。随后再执行并发与 10 秒窗口去重，避免 ended/next 等异步
 * 回调在切歌边界向网易云重复提交同一段播放记录。
 */
export function scrobble(params: ScrobbleParams): Promise<any> {
  const trackId = Number(params.id)
  const listenedSeconds = Number(params.time)
  const minimumSeconds = getMinimumScrobbleSeconds(params.total)

  if (!Number.isFinite(listenedSeconds) || listenedSeconds < minimumSeconds) {
    debugScrobble('[Track API] 跳过过短的网易云 scrobble：', {
      trackId,
      listenedSeconds: Number.isFinite(listenedSeconds) ? listenedSeconds : null,
      minimumSeconds,
      total: params.total
    })
    return Promise.resolve({
      code: 200,
      skipped: true,
      reason: 'short-playback',
      trackId,
      listenedSeconds: Number.isFinite(listenedSeconds) ? listenedSeconds : 0,
      minimumSeconds
    })
  }

  const existing = scrobbleInFlight.get(trackId)
  if (existing) {
    debugScrobble('[Track API] 合并同歌曲的并发 scrobble：', {
      trackId,
      time: params.time
    })
    return existing
  }

  const lastSuccessAt = lastSuccessfulScrobbleAt.get(trackId) || 0
  if (Date.now() - lastSuccessAt < SCROBBLE_DEDUP_WINDOW_MS) {
    debugScrobble('[Track API] 跳过短时间内的重复 scrobble：', {
      trackId,
      time: params.time
    })
    return Promise.resolve({
      code: 200,
      deduplicated: true,
      trackId
    })
  }

  const operation = performScrobble(params)
    .then((result) => {
      if (isSuccessfulResponse(result)) {
        lastSuccessfulScrobbleAt.set(trackId, Date.now())
        addPendingNeteaseListenSeconds(listenedSeconds)
      }
      return result
    })
    .finally(() => {
      if (scrobbleInFlight.get(trackId) === operation) {
        scrobbleInFlight.delete(trackId)
      }
    })

  scrobbleInFlight.set(trackId, operation)
  return operation
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
