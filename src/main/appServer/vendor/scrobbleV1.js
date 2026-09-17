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
  const ts = Math.floor(Date.now() / 1000)
  const played = Math.min(playTime, totalTime)

  const plvBody = buildRecords([
    { time: ts, action: '_plv', data: buildPlv(ctx, song, source) }
  ])
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
