import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 按服务来源隔离 ID，避免本地音乐、网易云及第三方流媒体发生数字 ID 冲突。
 * 艺人优先按平台 ID 匹配；没有 ID 时才按该来源内的完整名称匹配。
 */
export type BlockableArtist = {
  id?: number | string | null
  name?: string | null
}

export type BlockableTrack = {
  id?: number | string | null
  name?: string | null
  type?: string | null
  source?: string | null
  ar?: BlockableArtist[] | null
  artists?: BlockableArtist[] | null
}

export type BlockedSong = {
  key: string
  name: string
  artist: string
  addedAt: number
}

export type BlockedArtist = {
  key: string
  name: string
  addedAt: number
}

const normalizeId = (value: unknown): string | null => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id !== 0 ? String(id) : null
}

const normalizeName = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase() : ''

export const getMusicBlockScope = (track: Pick<BlockableTrack, 'type' | 'source'>): string => {
  if (track.type === 'local') return 'local'
  if (track.type === 'stream') {
    return 'stream:' + (normalizeName(track.source) || 'unknown')
  }
  return 'netease'
}

export const getSongBlockKey = (track: BlockableTrack): string | null => {
  const id = normalizeId(track.id)
  return id ? getMusicBlockScope(track) + ':song:' + id : null
}

export const getArtistBlockKey = (
  artist: BlockableArtist,
  track: Pick<BlockableTrack, 'type' | 'source'>
): string | null => {
  const scope = getMusicBlockScope(track)
  const id = normalizeId(artist.id)
  if (id) return scope + ':artist:' + id
  const name = normalizeName(artist.name)
  return name ? scope + ':artist-name:' + name : null
}

export const getTrackBlockArtists = (track: BlockableTrack): BlockableArtist[] => {
  if (Array.isArray(track.ar) && track.ar.length > 0) return track.ar
  return Array.isArray(track.artists) ? track.artists : []
}

export const matchesMusicBlocklist = (
  track: BlockableTrack,
  songKeys: ReadonlySet<string>,
  artistKeys: ReadonlySet<string>
): boolean => {
  const songKey = getSongBlockKey(track)
  if (songKey && songKeys.has(songKey)) return true
  return getTrackBlockArtists(track).some((artist) => {
    const artistKey = getArtistBlockKey(artist, track)
    return artistKey !== null && artistKeys.has(artistKey)
  })
}

export const useMusicBlocklistStore = defineStore(
  'musicBlocklist',
  () => {
    const blockedSongs = ref<BlockedSong[]>([])
    const blockedArtists = ref<BlockedArtist[]>([])

    const isSongBlocked = (track: BlockableTrack): boolean => {
      const key = getSongBlockKey(track)
      return Boolean(key && blockedSongs.value.some((item) => item.key === key))
    }

    const isArtistBlocked = (
      artist: BlockableArtist,
      track: Pick<BlockableTrack, 'type' | 'source'>
    ): boolean => {
      const key = getArtistBlockKey(artist, track)
      return Boolean(key && blockedArtists.value.some((item) => item.key === key))
    }

    const isTrackBlocked = (track: BlockableTrack): boolean =>
      matchesMusicBlocklist(
        track,
        new Set(blockedSongs.value.map((item) => item.key)),
        new Set(blockedArtists.value.map((item) => item.key))
      )

    /** 心动模式可在补全元数据后按歌曲 ID 和所有合唱艺人 ID 提前过滤。 */
    const isNeteaseCandidateBlocked = (
      trackId: number,
      artistIds: readonly number[] = []
    ): boolean => {
      const id = normalizeId(trackId)
      if (!id) return false
      if (blockedSongs.value.some((item) => item.key === 'netease:song:' + id)) return true
      return artistIds.some((artistId) => {
        const artistKey = normalizeId(artistId)
        return Boolean(
          artistKey &&
            blockedArtists.value.some((item) => item.key === 'netease:artist:' + artistKey)
        )
      })
    }

    const blockSong = (track: BlockableTrack): boolean => {
      const key = getSongBlockKey(track)
      if (!key || blockedSongs.value.some((item) => item.key === key)) return false
      blockedSongs.value = [
        {
          key,
          name: String(track.name || '#' + track.id),
          artist: getTrackBlockArtists(track)
            .map((artist) => String(artist.name || '').trim())
            .filter(Boolean)
            .join(' / '),
          addedAt: Date.now()
        },
        ...blockedSongs.value
      ]
      return true
    }

    const blockArtist = (
      artist: BlockableArtist,
      track: Pick<BlockableTrack, 'type' | 'source'>
    ): boolean => {
      const key = getArtistBlockKey(artist, track)
      if (!key || blockedArtists.value.some((item) => item.key === key)) return false
      blockedArtists.value = [
        { key, name: String(artist.name || '#' + artist.id), addedAt: Date.now() },
        ...blockedArtists.value
      ]
      return true
    }

    const unblockSong = (key: string): void => {
      blockedSongs.value = blockedSongs.value.filter((item) => item.key !== key)
    }

    const unblockArtist = (key: string): void => {
      blockedArtists.value = blockedArtists.value.filter((item) => item.key !== key)
    }

    return {
      blockedSongs,
      blockedArtists,
      isSongBlocked,
      isArtistBlocked,
      isTrackBlocked,
      isNeteaseCandidateBlocked,
      blockSong,
      blockArtist,
      unblockSong,
      unblockArtist
    }
  },
  {
    persist: {
      pick: ['blockedSongs', 'blockedArtists']
    }
  }
)
