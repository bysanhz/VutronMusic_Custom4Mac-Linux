import request from '../utils/request'

export type ListenReportType = 'week' | 'month' | 'year'
export type StyleResourceType = 'song' | 'album' | 'artist' | 'playlist'

const withTimestamp = <T extends Record<string, any>>(params: T = {} as T) => ({
  ...params,
  timestamp: Date.now()
})

export function homepageBlockPage(params: { refresh?: boolean; cursor?: string | number } = {}) {
  return request({
    url: '/homepage/block/page',
    method: 'get',
    params: withTimestamp(params)
  })
}

/**
 * 今日收听歌曲排行。
 *
 * 使用网易云听歌足迹专用的 `/listen/data/today/song`，不要用周实时报告伪装今日接口。
 * 页面层会把这里的今日排行与周报告的 `weekTodayListenBlock.songCount` 交叉校验，
 * 以兼容网易云两个统计接口偶尔存在的短暂同步延迟。
 */
export function listenTodaySongs() {
  return request({
    url: '/listen/data/today/song',
    method: 'get',
    params: withTimestamp({})
  })
}

/**
 * 网易云账号真实播放记录。
 * type=1 返回最近一周 weekData，type=0 返回全量 allData。
 */
export function userPlayRecord(uid: number | string, type: 0 | 1 = 1) {
  return request({
    url: '/user/record',
    method: 'get',
    params: withTimestamp({ uid, type })
  })
}

export function listenSongPlayRank(
  params: {
    type?: Exclude<ListenReportType, 'year'>
    endTime?: string | number
  } = {}
) {
  return request({
    url: '/listen/data/song/play/rank',
    method: 'get',
    params: withTimestamp({ type: 'month', ...params })
  })
}

export function listenTotal() {
  return request({
    url: '/listen/data/total',
    method: 'get',
    params: withTimestamp({})
  })
}

export function listenRealtimeReport(type: Exclude<ListenReportType, 'year'> = 'week') {
  return request({
    url: '/listen/data/realtime/report',
    method: 'get',
    params: withTimestamp({ type })
  })
}

export function listenReport(params: { type?: ListenReportType; endTime?: string | number } = {}) {
  return request({
    url: '/listen/data/report',
    method: 'get',
    params: withTimestamp({ type: 'week', ...params })
  })
}

export function listenYearReport() {
  return request({
    url: '/listen/data/year/report',
    method: 'get',
    params: withTimestamp({})
  })
}

export function styleDetail(tagId: number | string) {
  return request({
    url: '/style/detail',
    method: 'get',
    params: withTimestamp({ tagId })
  })
}

export function styleResource(
  type: StyleResourceType,
  params: {
    tagId: number | string
    cursor?: number | string
    size?: number
    sort?: number
  }
) {
  return request({
    url: `/style/${type}`,
    method: 'get',
    params: withTimestamp({ cursor: 0, size: 40, sort: 0, ...params })
  })
}

export function playlistTrackAll(params: {
  id: number | string
  limit?: number
  offset?: number
  s?: number
}) {
  return request({
    url: '/playlist/track/all',
    method: 'get',
    params: withTimestamp({ limit: 1000, offset: 0, ...params })
  })
}

export function publishPrivatePlaylist(id: number | string) {
  return request({
    url: '/playlist/privacy',
    method: 'post',
    params: withTimestamp({ id })
  })
}

export function updatePlaylistOrder(ids: Array<number | string>) {
  return request({
    url: '/playlist/order/update',
    method: 'post',
    params: withTimestamp({ ids: ids.join(',') })
  })
}

export function cloudMatch(params: {
  uid: number | string
  sid: number | string
  asid: number | string
}) {
  return request({
    url: '/cloud/match',
    method: 'post',
    params: withTimestamp(params)
  })
}

export function cloudLyricGet(params: { uid: number | string; sid: number | string }) {
  return request({
    url: '/cloud/lyric/get',
    method: 'get',
    params: withTimestamp(params)
  })
}

export function aiDjContentRecommend() {
  return request({
    url: '/aidj/content/rcmd',
    method: 'get',
    params: withTimestamp({})
  })
}

export function similarSongs(id: number | string) {
  return request({
    url: '/simi/song',
    method: 'get',
    params: withTimestamp({ id })
  })
}

export function songWikiSummary(id: number | string) {
  return request({
    url: '/song/wiki/summary',
    method: 'get',
    params: withTimestamp({ id })
  })
}

export function songMusicDetail(id: number | string) {
  return request({
    url: '/song/music/detail',
    method: 'get',
    params: withTimestamp({ id })
  })
}

export function songRedCount(id: number | string) {
  return request({
    url: '/song/red/count',
    method: 'get',
    params: withTimestamp({ id })
  })
}

export function songDynamicCover(id: number | string) {
  return request({
    url: '/song/dynamic/cover',
    method: 'get',
    params: withTimestamp({ id })
  })
}
