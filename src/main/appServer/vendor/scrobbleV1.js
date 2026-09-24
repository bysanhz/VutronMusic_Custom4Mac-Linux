// 听歌打卡 - NCBL 加密版 (仿桌面客户端 PLV/PLD 上报)
// Vendored from NeteaseCloudMusicApiEnhanced v4.40.1 because the npm 4.40.1
// artifact used by VutronMusic does not contain module/scrobble_v1.js.

import {
  buildPlv,
  buildPld,
  buildRecords,
  extractContext,
  parseCookie,
  buildCookieStr,
  buildMetaJson,
  doUpload
} from './ncbl'
import store from '../../store'

const RECEIPTS_KEY = 'netease.scrobbleSegmentReceipts'
const MAX_RECEIPTS = 2000

const readReceipts = () => {
  const value = store.get(RECEIPTS_KEY)
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

const scrobbleV1 = async (query) => {
  const songId = Number(query.id)
  if (!songId || isNaN(songId)) {
    return { status: 400, body: { code: 400, msg: '缺少有效的 id (歌曲ID)' } }
  }

  const playTime = Number(query.time)
  if (isNaN(playTime) || playTime <= 0) {
    return {
      status: 400,
      body: { code: 400, msg: '缺少有效的 time (播放时长)' }
    }
  }

  const totalTime = Number(query.total) || playTime
  const sourceId = String(query.sourceid || query.sourceId || '')
  const sourceName = query.source || 'list'
  const segmentId = String(query.segmentId || '').trim()

  if (segmentId && readReceipts().includes(segmentId)) {
    return {
      status: 200,
      body: { code: 200, data: 'scrobble_v1 已处理', deduplicatedSegment: true }
    }
  }

  const rawCookie = query.cookie || ''
  const cookieObj = parseCookie(rawCookie)
  cookieObj.os = 'pc'
  const ctx = extractContext(cookieObj)

  if (!ctx.auth.token && rawCookie) {
    const parsed = typeof rawCookie === 'string' ? parseCookie(rawCookie) : rawCookie
    ctx.auth.token = parsed.MUSIC_U || ''
  }

  if (!ctx.auth.token) {
    return { status: 401, body: { code: 401, msg: '缺少 MUSIC_U 鉴权令牌' } }
  }

  const song = {
    id: songId,
    name: query.name || '',
    artist: query.artist || '',
    bitrate: Number(query.bitrate) || 320,
    level: query.level || 'exhigh',
    vip: query.vip === 'true' || query.vip === true,
    time: totalTime
  }
  const source = {
    id: sourceId || String(songId),
    type: 'track',
    name: sourceName
  }

  const metaJson = buildMetaJson(ctx)
  const cookieStr = buildCookieStr(ctx)
  /*
   * 持久化队列可能隔天才重试。记录时间必须使用原播放/入队时间，否则网易云会把
   * 昨天的失败记录算到今天。限制到最近 30 天并禁止未来时间，避免异常参数污染记录。
   */
  const now = Date.now()
  const requestedPlayedAt = Number(query.playedAt)
  const normalizedPlayedAt =
    requestedPlayedAt > 0 && requestedPlayedAt < 10_000_000_000
      ? requestedPlayedAt * 1000
      : requestedPlayedAt
  const playedAt = Number.isFinite(normalizedPlayedAt)
    ? Math.min(now, Math.max(now - 30 * 24 * 60 * 60 * 1000, normalizedPlayedAt))
    : now
  const ts = Math.floor(playedAt / 1000)
  const played = Math.min(playTime, totalTime)

  const plvBody = buildRecords([{ time: ts, action: '_plv', data: buildPlv(ctx, song, source) }])
  const pldBody = buildRecords([
    { time: ts, action: '_pld', data: buildPld(ctx, song, source, played) }
  ])

  try {
    const plv = await doUpload(ctx, metaJson, plvBody, cookieStr, 'PLV')
    if (!plv.success) {
      const rateMsg = plv.respBody?.data?.rate != null ? ` (rate=${plv.respBody.data.rate})` : ''
      return {
        status: 200,
        body: {
          code: plv.respBody?.code || -1,
          msg: `PLV 上报失败${rateMsg}`,
          details: plv.respBody
        }
      }
    }

    const pld = await doUpload(ctx, metaJson, pldBody, cookieStr, 'PLD')
    if (!pld.success) {
      return {
        status: 200,
        body: {
          code: pld.respBody?.code || -1,
          msg: 'PLV 成功但 PLD 失败',
          details: { plv: plv.respBody, pld: pld.respBody }
        }
      }
    }

    if (segmentId) {
      const receipts = [...new Set([...readReceipts(), segmentId])].slice(-MAX_RECEIPTS)
      store.set(RECEIPTS_KEY, receipts)
    }

    return {
      status: 200,
      body: {
        code: 200,
        data: 'scrobble_v1 上报成功',
        details: {
          plv: { fileName: plv.fileName, payloadSize: plv.payload.length },
          pld: { fileName: pld.fileName, payloadSize: pld.payload.length }
        }
      }
    }
  } catch (err) {
    return {
      status: 502,
      body: { code: 502, msg: `请求异常: ${err?.message || err}` }
    }
  }
}

export default scrobbleV1
