import request from '../utils/request'

export type NeteaseSoundQuality =
  | 'standard'
  | 'higher'
  | 'exhigh'
  | 'lossless'
  | 'hires'
  | 'jyeffect'
  | 'sky'
  | 'vivid'
  | 'jymaster'

export function cloudSearch(params: {
  keywords: string
  limit?: number
  offset?: number
  type?: number
}) {
  return request({
    url: '/cloudsearch',
    method: 'get',
    params
  })
}

export function searchDefault() {
  return request({
    url: '/search/default',
    method: 'get',
    params: { timestamp: Date.now() }
  })
}

export function searchHotDetail() {
  return request({
    url: '/search/hot/detail',
    method: 'get',
    params: { timestamp: Date.now() }
  })
}

export function recentSongs(limit = 100) {
  return request({
    url: '/record/recent/song',
    method: 'get',
    params: { limit, timestamp: Date.now() }
  })
}

export function historyRecommendSongs() {
  return request({
    url: '/history/recommend/songs',
    method: 'get',
    params: { timestamp: Date.now() }
  })
}

export function dislikeRecommendSong(id: number) {
  return request({
    url: '/recommend/songs/dislike',
    method: 'post',
    params: { id, timestamp: Date.now() }
  })
}

export function styleList() {
  return request({
    url: '/style/list',
    method: 'get',
    params: { timestamp: Date.now() }
  })
}

export function stylePreference() {
  return request({
    url: '/style/preference',
    method: 'get',
    params: { timestamp: Date.now() }
  })
}

export function styleSongs(params: {
  tagId: number | string
  cursor?: number | string
  size?: number
  sort?: number
}) {
  return request({
    url: '/style/song',
    method: 'get',
    params: { ...params, timestamp: Date.now() }
  })
}

export function followedArtistNewSongs(params: { limit?: number; before?: number } = {}) {
  return request({
    url: '/artist/new/song',
    method: 'get',
    params: { ...params, timestamp: Date.now() }
  })
}

export function followedArtistNewMvs(params: { limit?: number; before?: number } = {}) {
  return request({
    url: '/artist/new/mv',
    method: 'get',
    params: { ...params, timestamp: Date.now() }
  })
}

export function deleteCloudSong(id: number) {
  return request({
    url: '/user/cloud/del',
    method: 'post',
    params: { id, timestamp: Date.now() }
  })
}

export function songUrlV1(params: {
  id: number | string
  level: NeteaseSoundQuality
  immerseType?: 'c51' | 'ste' | 'aac'
}) {
  return request({
    url: '/song/url/v1',
    method: 'get',
    params
  })
}
