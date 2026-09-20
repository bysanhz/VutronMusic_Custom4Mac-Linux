export type StyleTag = {
  id: number | string
  name: string
  preferred?: boolean
  description?: string
}

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null

export const isSuccessfulResponse = (value: any) => {
  if (!value) return false
  if (value.code === undefined) return true
  return Number(value.code) === 200
}

export const findFirstArray = (source: any, paths: string[]): any[] => {
  for (const path of paths) {
    const value = path.split('.').reduce((current: any, segment) => current?.[segment], source)
    if (Array.isArray(value)) return value
  }
  return []
}

export const deepFindValue = (
  source: any,
  keys: string[],
  depth = 0,
  seen = new WeakSet<object>()
): any => {
  if (depth > 8 || source == null) return undefined
  if (!isObject(source)) return undefined
  if (seen.has(source)) return undefined
  seen.add(source)

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }

  for (const value of Object.values(source)) {
    const found = deepFindValue(value, keys, depth + 1, seen)
    if (found !== undefined) return found
  }
  return undefined
}

const collectObjects = (source: any, maxDepth = 8) => {
  const objects: Record<string, any>[] = []
  const seen = new WeakSet<object>()

  const visit = (value: any, depth: number) => {
    if (depth > maxDepth || value == null) return
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1))
      return
    }
    if (!isObject(value) || seen.has(value)) return
    seen.add(value)
    objects.push(value)
    Object.values(value).forEach((item) => visit(item, depth + 1))
  }

  visit(source, 0)
  return objects
}

const normalizeArtists = (artists: any) => {
  if (!Array.isArray(artists)) return []
  return artists
    .map((artist) => ({
      ...artist,
      id: artist?.id ?? artist?.artistId,
      name: artist?.name ?? artist?.artistName ?? ''
    }))
    .filter((artist) => artist.id || artist.name)
}

export const normalizeTrack = (value: any) => {
  const resourceInfo = value?.resourceExtInfo ?? value?.extInfo ?? {}
  const source =
    value?.song ??
    resourceInfo?.songData ??
    resourceInfo?.song ??
    value?.resource?.song ??
    value?.data ??
    value

  const id = source?.id ?? source?.songId ?? source?.resourceId ?? value?.resourceId
  const name =
    source?.name ?? source?.songName ?? source?.title ?? value?.uiElement?.mainTitle?.title
  const artists = normalizeArtists(
    source?.ar ?? source?.artists ?? (source?.artist ? [source.artist] : [])
  )
  const album = source?.al ?? source?.album
  const looksLikeTrack =
    id &&
    name &&
    (artists.length > 0 || source?.dt !== undefined || source?.duration !== undefined || album)

  if (!looksLikeTrack) return null

  return {
    ...source,
    id,
    name,
    ar: source?.ar ?? artists,
    artists: source?.artists ?? artists,
    al: source?.al ?? album,
    album: source?.album ?? album,
    type: source?.type ?? 'online',
    matched: source?.matched ?? true
  }
}

export const normalizePlaylist = (value: any) => {
  const ext = value?.resourceExtInfo ?? value?.extInfo ?? {}
  const source =
    value?.playlist ??
    ext?.playlistData ??
    ext?.playlist ??
    value?.resource?.playlist ??
    value?.data ??
    value
  const id = source?.id ?? source?.playlistId ?? source?.resourceId ?? value?.resourceId
  const name = source?.name ?? source?.title ?? value?.uiElement?.mainTitle?.title
  const coverImgUrl =
    source?.coverImgUrl ??
    source?.picUrl ??
    source?.coverUrl ??
    value?.uiElement?.image?.imageUrl ??
    value?.uiElement?.image?.imageUrl2
  const looksLikePlaylist =
    id &&
    name &&
    (source?.trackCount !== undefined ||
      source?.creator ||
      /playlist/i.test(String(value?.resourceType)))

  if (!looksLikePlaylist) return null
  return { ...source, id, name, coverImgUrl, picUrl: source?.picUrl ?? coverImgUrl }
}

export const normalizeAlbum = (value: any) => {
  const ext = value?.resourceExtInfo ?? value?.extInfo ?? {}
  const source =
    value?.album ?? ext?.albumData ?? ext?.album ?? value?.resource?.album ?? value?.data ?? value
  const id = source?.id ?? source?.albumId ?? source?.resourceId ?? value?.resourceId
  const name = source?.name ?? source?.title ?? value?.uiElement?.mainTitle?.title
  const picUrl =
    source?.picUrl ?? source?.coverImgUrl ?? source?.coverUrl ?? value?.uiElement?.image?.imageUrl
  const artists = normalizeArtists(source?.artists ?? (source?.artist ? [source.artist] : []))
  const looksLikeAlbum =
    id &&
    name &&
    (source?.publishTime !== undefined || source?.company !== undefined || artists.length > 0)
  if (!looksLikeAlbum) return null
  return { ...source, id, name, picUrl, artists, artist: source?.artist ?? artists[0] }
}

export const normalizeArtist = (value: any) => {
  const ext = value?.resourceExtInfo ?? value?.extInfo ?? {}
  const source =
    value?.artist ??
    ext?.artistData ??
    ext?.artist ??
    value?.resource?.artist ??
    value?.data ??
    value
  const id = source?.id ?? source?.artistId ?? source?.resourceId ?? value?.resourceId
  const name = source?.name ?? source?.artistName ?? value?.uiElement?.mainTitle?.title
  const picUrl =
    source?.picUrl ?? source?.img1v1Url ?? source?.coverUrl ?? value?.uiElement?.image?.imageUrl
  const looksLikeArtist =
    id &&
    name &&
    (source?.albumSize !== undefined || source?.musicSize !== undefined || source?.img1v1Url)
  if (!looksLikeArtist) return null
  return { ...source, id, name, picUrl, img1v1Url: source?.img1v1Url ?? picUrl }
}

const collectNormalized = <T>(source: any, normalize: (value: any) => T | null, limit = 200) => {
  const result: T[] = []
  const ids = new Set<string>()
  for (const object of collectObjects(source)) {
    const normalized: any = normalize(object)
    if (!normalized?.id) continue
    const key = String(normalized.id)
    if (ids.has(key)) continue
    ids.add(key)
    result.push(normalized)
    if (result.length >= limit) break
  }
  return result
}

export const extractTracks = (source: any, limit = 200) =>
  collectNormalized(source, normalizeTrack, limit)

export const extractPlaylists = (source: any, limit = 100) =>
  collectNormalized(source, normalizePlaylist, limit)

export const extractAlbums = (source: any, limit = 100) =>
  collectNormalized(source, normalizeAlbum, limit)

export const extractArtists = (source: any, limit = 100) =>
  collectNormalized(source, normalizeArtist, limit)

export const collectStyleTags = (source: any, preferredSource?: any): StyleTag[] => {
  const tags: StyleTag[] = []
  const ids = new Set<string>()
  const preferredIds = new Set<string>()

  const collect = (value: any, target: Set<string> | null = null) => {
    for (const object of collectObjects(value, 7)) {
      const id = object?.tagId ?? object?.id
      const name = object?.tagName ?? object?.name
      if ((typeof id !== 'number' && typeof id !== 'string') || typeof name !== 'string') continue
      if (!name.trim()) continue
      if (target) {
        target.add(String(id))
        continue
      }
      const key = String(id)
      if (ids.has(key)) continue
      ids.add(key)
      tags.push({
        id,
        name: name.trim(),
        description: object?.desc ?? object?.description ?? object?.tagDesc
      })
    }
  }

  if (preferredSource) collect(preferredSource, preferredIds)
  collect(source)

  return tags
    .map((tag) => ({ ...tag, preferred: preferredIds.has(String(tag.id)) }))
    .sort((a, b) => Number(Boolean(b.preferred)) - Number(Boolean(a.preferred)))
}

export const extractCursor = (source: any) => {
  const value = deepFindValue(source, ['cursor', 'nextCursor', 'lasttime', 'lastTime'])
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

const parseDateLike = (value: unknown, fallbackYear = new Date().getFullYear()): Date | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null

    // 网易云 durationDetails.period 偶尔以 YYYYMMDD 数字返回。
    const compact = String(Math.trunc(value))
    if (/^\d{8}$/.test(compact)) {
      const year = Number(compact.slice(0, 4))
      const month = Number(compact.slice(4, 6))
      const day = Number(compact.slice(6, 8))
      const date = new Date(year, month - 1, day)
      return Number.isFinite(date.getTime()) ? date : null
    }

    if (value < 1_000_000_000) return null
    const timestamp = value < 10_000_000_000 ? value * 1000 : value
    const date = new Date(timestamp)
    return Number.isFinite(date.getTime()) ? date : null
  }

  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim()

    // API 的实际字段名是 period；常见格式包括 YYYY-MM-DD / YYYY.MM.DD / MM-DD。
    const fullDate = normalized.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
    if (fullDate) {
      const date = new Date(Number(fullDate[1]), Number(fullDate[2]) - 1, Number(fullDate[3]))
      return Number.isFinite(date.getTime()) ? date : null
    }

    const monthDay = normalized.match(/^(\d{1,2})[-/.月](\d{1,2})日?$/)
    if (monthDay) {
      const date = new Date(fallbackYear, Number(monthDay[1]) - 1, Number(monthDay[2]))
      return Number.isFinite(date.getTime()) ? date : null
    }

    if (/^\d{8}$/.test(normalized)) {
      const date = new Date(
        Number(normalized.slice(0, 4)),
        Number(normalized.slice(4, 6)) - 1,
        Number(normalized.slice(6, 8))
      )
      return Number.isFinite(date.getTime()) ? date : null
    }

    const date = new Date(normalized)
    return Number.isFinite(date.getTime()) ? date : null
  }

  return null
}

const isSameLocalDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

const reportReferenceDate = (source: any): Date => {
  const end = parseDateLike(source?.data?.endTime)
  return end ?? new Date()
}

const getDurationDetailDate = (item: any, source: any, index: number): Date | null => {
  if (!item || typeof item !== 'object') return null

  const reference = reportReferenceDate(source)
  const candidates = [
    item.period,
    item.date,
    item.dayDate,
    item.statDate,
    item.bizDate,
    item.timestamp,
    item.time,
    item.startTime
  ]
  for (const candidate of candidates) {
    const parsed = parseDateLike(candidate, reference.getFullYear())
    if (parsed) return parsed
  }

  // 兼容极少数没有 period 的旧响应：按报告 startTime + 数组索引恢复日期。
  const reportStart = parseDateLike(source?.data?.startTime)
  if (reportStart) {
    const derived = new Date(reportStart)
    derived.setHours(0, 0, 0, 0)
    derived.setDate(derived.getDate() + index)
    return derived
  }
  return null
}

/**
 * 提取今天的收听时长（秒）。
 *
 * 网易云 durationDetails 的日期字段实际叫 period。旧实现没有读取 period，
 * 因而经常匹配不到“今天”，直接退化成 details 最后一项；周边界时会把周期值
 * 误当作今日值。现在优先按 period/日期精确匹配。
 */
export const extractTodayListenSeconds = (source: any, now = new Date()): number | undefined => {
  const details = source?.data?.listenTimeDistributionBlock?.durationDetails
  if (!Array.isArray(details) || !details.length) return undefined

  const today = details.find((item: any, index: number) => {
    const date = getDurationDetailDate(item, source, index)
    return date ? isSameLocalDay(date, now) : false
  })

  const duration = Number(today?.duration)
  return Number.isFinite(duration) && duration >= 0 ? duration * 60 : undefined
}

/**
 * 按用户通常理解的“周一 00:00 → 今天”计算本周音乐时长。
 *
 * 网易云 realtime/report(type=week) 的周边界不保证与 UI 的周一制一致。
 * 因此从 month 报告的逐日 durationDetails 中按日期重新求和，避免周日出现
 * “今日 == 本周”但前六天明明也有收听的情况。
 */
export const extractCalendarWeekListenSeconds = (
  source: any,
  now = new Date()
): number | undefined => {
  const details = source?.data?.listenTimeDistributionBlock?.durationDetails
  if (!Array.isArray(details) || !details.length) return undefined

  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  const daysSinceMonday = (weekStart.getDay() + 6) % 7
  weekStart.setDate(weekStart.getDate() - daysSinceMonday)

  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  let found = false
  let minutes = 0
  details.forEach((item: any, index: number) => {
    const date = getDurationDetailDate(item, source, index)
    const duration = Number(item?.duration)
    if (
      date &&
      date >= weekStart &&
      date <= todayEnd &&
      Number.isFinite(duration) &&
      duration >= 0
    ) {
      found = true
      minutes += duration
    }
  })

  return found ? minutes * 60 : undefined
}

/**
 * 从周/月实时报告读取该统计周期的累计收听时长（秒）。
 */
export const extractRealtimeListenSeconds = (source: any): number | undefined => {
  const minutes = Number(source?.data?.listenTimeDistributionBlock?.playDuration)
  return Number.isFinite(minutes) && minutes >= 0 ? minutes * 60 : undefined
}

/**
 * 从累计听歌接口读取总收听时长（秒）。
 */
export const extractTotalListenSeconds = (source: any): number | undefined => {
  const seconds = Number(source?.data?.totalDuration)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}

export const extractListenReportRank = (source: any, limit = 20): any[] => {
  const sections = source?.data?.topSongBlock?.sections
  if (!Array.isArray(sections)) return []

  return sections
    .slice(0, limit)
    .map((item: any, index: number) => {
      const id = item?.songId ?? item?.id
      const name = item?.songName ?? item?.name
      if (!id || !name) return null
      return {
        id,
        songId: id,
        name,
        songName: name,
        picUrl: item?.picUrl ?? '',
        rankText: item?.text ?? `#${index + 1}`,
        rank: index + 1,
        type: 'online',
        matched: true
      }
    })
    .filter(Boolean)
}

export const extractUserPlayRecord = (source: any, type: 'week' | 'all', limit = 20): any[] => {
  const container = source?.data ?? source
  const records = type === 'week' ? container?.weekData : container?.allData
  if (!Array.isArray(records)) return []

  return records
    .slice(0, limit)
    .map((record: any, index: number) => {
      const track = normalizeTrack(record?.song ?? record)
      if (!track) return null
      const playCount = Number(record?.playCount)
      const score = Number(record?.score)
      return {
        ...track,
        rank: index + 1,
        playCount: Number.isFinite(playCount) ? playCount : undefined,
        score: Number.isFinite(score) ? score : undefined,
        rankText: Number.isFinite(playCount) ? `${playCount}次收听` : `#${index + 1}`
      }
    })
    .filter(Boolean)
}

const hasAnyKey = (keys: string[], candidates: string[]) =>
  candidates.some((candidate) => keys.includes(candidate))

const findListenSongRank = (
  source: any,
  depth = 0,
  seen = new WeakSet<object>()
): any[] | undefined => {
  if (depth > 6 || source == null) return undefined

  if (Array.isArray(source)) {
    const entries = source.filter(isObject)
    if (
      entries.length > 0 &&
      entries.some(
        (item) =>
          item?.songId !== undefined ||
          item?.songName !== undefined ||
          item?.playCount !== undefined ||
          item?.song?.id !== undefined ||
          item?.song?.songId !== undefined
      )
    ) {
      return entries
    }

    for (const item of source) {
      const nested = findListenSongRank(item, depth + 1, seen)
      if (nested) return nested
    }
    return undefined
  }

  if (!isObject(source) || seen.has(source)) return undefined
  seen.add(source)

  for (const value of Object.values(source)) {
    const nested = findListenSongRank(value, depth + 1, seen)
    if (nested) return nested
  }
  return undefined
}

const countListenSongRank = (source: any): number | undefined => {
  const rows = findListenSongRank(source)
  if (!rows) return undefined

  const ids = new Set<string>()
  for (const item of rows) {
    const id = item?.songId ?? item?.id ?? item?.song?.id ?? item?.song?.songId
    if (id !== undefined && id !== null && String(id)) ids.add(String(id))
  }

  return ids.size > 0 ? ids.size : rows.length
}

const extractListenSongCount = (source: any): number | undefined => {
  const data = source?.data
  const directCandidates = [
    data?.songCount,
    data?.listenSongCount,
    data?.count,
    source?.songCount,
    source?.listenSongCount,
    source?.count
  ]
  const direct = directCandidates
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value >= 0)
  if (direct !== undefined) return direct

  if (Array.isArray(data?.songDTOs)) {
    const ids = new Set(
      data.songDTOs
        .map((item: any) => item?.songId ?? item?.id ?? item?.song?.id)
        .filter((id: any) => id !== undefined && id !== null)
        .map((id: any) => String(id))
    )
    return ids.size || data.songDTOs.length
  }

  // /listen/data/today/song 返回的是今日歌曲播放排行；每一行的 playCount 是该歌曲
  // 的播放次数，而不是“今天总歌曲数”。这里只统计不同歌曲条目。
  return countListenSongRank(data)
}

/**
 * 今日不同歌曲数。
 *
 * 主来源是专用 `/listen/data/today/song`；周实时报告里的
 * `weekTodayListenBlock.songCount` 作为交叉校验。两个网易云端点存在短暂同步延迟时，
 * 取同一天内较大的非负值，避免一个端点晚几秒同步导致数字倒退或长期卡住。
 */
export const extractTodaySongCount = (todaySource: any, weekSource?: any): number | undefined => {
  const todayCount = extractListenSongCount(todaySource)
  const reportCount = Number(weekSource?.data?.weekTodayListenBlock?.songCount)
  const candidates = [todayCount, reportCount].filter(
    (value): value is number => Number.isFinite(value) && Number(value) >= 0
  )
  return candidates.length ? Math.max(...candidates) : undefined
}

export const extractMetric = (source: any, keys: string[]) => {
  const data = source?.data
  const asksForSongCount = hasAnyKey(keys, ['songCount', 'count', 'listenSongCount', 'playCount'])

  if (asksForSongCount) {
    const songCount = extractListenSongCount(source)
    if (songCount !== undefined) return songCount
  }

  const realtimeSeconds = extractRealtimeListenSeconds(source)
  if (
    realtimeSeconds !== undefined &&
    hasAnyKey(keys, ['listenTime', 'totalTime', 'duration', 'playTime', 'time'])
  ) {
    return realtimeSeconds
  }

  const totalSeconds = extractTotalListenSeconds(source)
  if (
    totalSeconds !== undefined &&
    hasAnyKey(keys, ['listenTime', 'totalTime', 'duration', 'playTime', 'time'])
  ) {
    return totalSeconds
  }

  // playCount belongs to an individual rank row. Never treat the first row's playCount
  // as a page-level "number of songs" metric when an endpoint does not expose a count.
  const fallbackKeys = asksForSongCount ? keys.filter((key) => key !== 'playCount') : keys
  const value = deepFindValue(source, fallbackKeys)
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export const formatListenDuration = (seconds?: number) => {
  if (!Number.isFinite(seconds) || Number(seconds) < 0) return '—'
  const value = Number(seconds)
  if (value === 0) return '0分'

  const days = Math.floor(value / 86400)
  const hours = Math.floor((value % 86400) / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${minutes}分`
  return `${Math.max(1, minutes)}分`
}
