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
  const name = source?.name ?? source?.songName ?? source?.title ?? value?.uiElement?.mainTitle?.title
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
    value?.artist ?? ext?.artistData ?? ext?.artist ?? value?.resource?.artist ?? value?.data ?? value
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

export const extractMetric = (source: any, keys: string[]) => {
  const value = deepFindValue(source, keys)
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export const formatListenDuration = (seconds?: number) => {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return '—'
  const value = Number(seconds)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${Math.max(1, minutes)} min`
}

export const extractLikedState = (source: any, id: number | string): boolean | undefined => {
  const target = String(id)
  for (const object of collectObjects(source, 6)) {
    const objectId = object?.id ?? object?.trackId ?? object?.songId
    if (objectId !== undefined && String(objectId) !== target) continue
    for (const key of ['liked', 'like', 'isLike', 'isLiked', 'red']) {
      if (typeof object?.[key] === 'boolean') return object[key]
      if (object?.[key] === 0 || object?.[key] === 1) return Boolean(object[key])
    }
  }
  return undefined
}
