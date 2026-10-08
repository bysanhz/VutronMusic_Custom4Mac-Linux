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
import { normalizeNeteaseScrobbleTiming } from '../../../shared/scrobbleTiming'

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

  const timing = normalizeNeteaseScrobbleTiming({
    playedSeconds: playTime,
    totalSeconds: Number(query.total),
    startedAt: query.playedAt,
    endedAt: query.endedAt
  })
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
    time: timing.totalSeconds
  }
  const source = {
    id: sourceId || String(songId),
    type: 'track',
    name: sourceName
  }

  const metaJson = buildMetaJson(ctx)
  const cookieStr = buildCookieStr(ctx)
  // 上传回执只证明日志文件被接收。PLV/PLD 要使用实际起止时间和整数秒数，
  // 否则报表可能一直不增加，即使上传接口返回 200。
  const plvBody = buildRecords([
    { time: timing.startedAtSeconds, action: '_plv', data: buildPlv(ctx, song, source) }
  ])
  const pldBody = buildRecords([
    {
      time: timing.endedAtSeconds,
      action: '_pld',
      data: buildPld(ctx, song, source, timing.playedSeconds)
    }
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
