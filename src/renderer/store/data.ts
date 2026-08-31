import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { userPlaylist } from '../api/auth'
import {
  userLikedSongsIDs,
  likedAlbums,
  likedArtists,
  likedMVs,
  cloudDisk,
  userPlayHistory
} from '../api/user'
import { getTrackDetail, likeTrack } from '../api/track'
import { useNormalStateStore } from './state'
import { isAccountLoggedIn } from '../utils/auth'
import { useI18n } from 'vue-i18n'
import { getPlaylistDetail } from '../api/playlist'

interface User {
  userId: number | null
  avatarUrl: string
  nickname: string
  [key: string]: any
}

const sameTrackID = (left: number | string, right: number | string) => {
  return String(left) === String(right)
}

const normalizeTrackIDs = (ids: Array<number | string>) => {
  return Array.from(
    new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  )
}

export const useDataStore = defineStore(
  'data',
  () => {
    const user = ref<User>({
      userId: null,
      avatarUrl: 'https://s4.music.126.net/style/web2/img/default/default_avatar.jpg?param=60y60',
      nickname: ''
    })
    const likedSongPlaylistID = ref<number>(0)
    const lastRefreshCookieDate = ref<number>(0)
    const loginMode = ref<string | null>(null)
    const libraryPlaylistFilter = ref<string>('all')
    const { t } = useI18n()

    const liked = reactive<{
      songs: number[]
      songsWithDetails: any[]
      playlists: any[]
      albums: any[]
      artists: any[]
      mvs: any[]
      cloudDisk: any[]
      playHistory: {
        weekData: any[]
        allData: any[]
      }
    }>({
      songs: [],
      songsWithDetails: [], // 只有前12首
      playlists: [],
      albums: [],
      artists: [],
      mvs: [],
      cloudDisk: [],
      playHistory: {
        weekData: [],
        allData: []
      }
    })

    const { showToast } = useNormalStateStore()

    /**
     * 从用户歌单列表中识别网易云真正的“我喜欢的音乐”。
     *
     * 不能再假定 `playlist[0]` 就是喜欢歌单。网易云当前返回结构会为系统喜欢歌单
     * 标记 `specialType = 5`；名称仅作为旧接口兼容兜底。这样可以修复持久化 ID
     * 指向普通歌单后，喜欢页面只显示该普通歌单、所有红心也跟着错误的问题。
     */
    const resolveLikedPlaylist = (playlists: any[]) => {
      const specialPlaylist = playlists.find((playlist) => Number(playlist?.specialType) === 5)
      if (specialPlaylist) return specialPlaylist

      const currentUserID = Number(user.value.userId)
      return playlists.find((playlist) => {
        const creatorID = Number(playlist?.creator?.userId)
        const name = String(playlist?.name ?? '')
        return (
          creatorID === currentUserID &&
          (name.includes('喜欢的音乐') || /liked\s+songs/i.test(name))
        )
      })
    }

    /**
     * 用一个已经确认属于“我喜欢的音乐”的歌曲 ID 列表刷新红心状态快照。
     *
     * `/likelist` 并不是唯一可信来源。网易云的“我喜欢的音乐”本身也是一个普通
     * 歌单，`/playlist/detail` 返回的 `trackIds` 同样是完整的喜欢歌曲集合。统一在
     * 这里归一化，避免 API 返回 number/string 混用导致红心判断失效。
     */
    const syncLikedSongs = (ids: Array<number | string>) => {
      liked.songs = normalizeTrackIDs(ids)
    }

    /**
     * 刷新用户歌单并重新确认“我喜欢的音乐”歌单 ID。
     *
     * 每次启动都会重新验证，而不是盲信旧版本持久化的 `likedSongPlaylistID`。
     * 找不到可确认的喜欢歌单时保留旧缓存，不再把任意第一个普通歌单误当成喜欢歌单。
     */
    const fetchLikedPlaylist = async () => {
      if (!user.value.userId) return false

      try {
        const res = await userPlaylist({
          uid: user.value.userId,
          limit: 2000,
          timestamp: new Date().getTime()
        })

        if (!Array.isArray(res?.playlist)) return false

        liked.playlists = res.playlist
        const likedPlaylist = resolveLikedPlaylist(res.playlist)
        const resolvedID = Number(likedPlaylist?.id)

        if (!Number.isFinite(resolvedID) || resolvedID <= 0) {
          console.warn('[Data] 用户歌单中未找到可确认的“我喜欢的音乐”，保留已有 ID')
          return false
        }

        likedSongPlaylistID.value = resolvedID
        return true
      } catch (error) {
        console.warn('[Data] 获取用户歌单失败，继续使用本地缓存：', error)
        return false
      }
    }

    /**
     * 从“我喜欢的音乐”歌单详情重建喜欢歌曲 ID。
     *
     * 先重新验证喜欢歌单 ID，避免旧版本把普通歌单第一项持久化后继续污染红心状态。
     */
    const fetchLikedSongsFromPlaylist = async () => {
      await fetchLikedPlaylist()
      if (!likedSongPlaylistID.value) return false

      try {
        const result = await getPlaylistDetail(likedSongPlaylistID.value, true)
        const trackIDs = result?.playlist?.trackIds
        if (!Array.isArray(trackIDs)) return false

        syncLikedSongs(trackIDs.map((track: any) => track?.id ?? track))
        return true
      } catch (error) {
        console.warn('[Data] 从喜欢歌单重建红心状态失败，继续使用本地缓存：', error)
        return false
      }
    }

    /**
     * 刷新喜欢歌曲 ID。
     *
     * 启动时先验证真正的喜欢歌单。`/likelist` 返回非空 ID 数组时直接使用；若返回
     * 空数组或异常，则再从已经确认的“我喜欢的音乐”歌单详情恢复，避免鉴权异常把
     * 一个原本有大量红心的账号误判成 0 首喜欢歌曲。
     */
    const fetchLikedSongs = async () => {
      if (!user.value.userId) return false

      await fetchLikedPlaylist()

      try {
        const res = await userLikedSongsIDs(user.value.userId)
        if (Array.isArray(res?.ids) && res.ids.length > 0) {
          syncLikedSongs(res.ids)
          return true
        }

        console.warn('[Data] /likelist 未返回有效喜欢歌曲，改用喜欢歌单详情恢复红心状态')
      } catch (error) {
        console.warn('[Data] 获取喜欢歌曲失败，改用喜欢歌单详情恢复：', error)
      }

      return await fetchLikedSongsFromPlaylist()
    }

    const fetchLikedAlbums = () => {
      if (!isAccountLoggedIn()) return
      return likedAlbums({ limit: 2000 }).then((result) => {
        if (result.data) {
          liked.albums = result.data
        }
      })
    }

    const fetchLikedArtists = () => {
      if (!isAccountLoggedIn()) return
      return likedArtists({ limit: 2000 }).then((result) => {
        if (result.data) {
          liked.artists = result.data
        }
      })
    }

    const fetchLikedMVs = () => {
      if (!isAccountLoggedIn()) return
      return likedMVs({ limit: 1000 }).then((result) => {
        if (result.data) {
          liked.mvs = result.data
        }
      })
    }

    const fetchCloudDisk = () => {
      if (!isAccountLoggedIn()) return
      return cloudDisk({ limit: 1000 })
        .then((result) => {
          if (result.data) {
            liked.cloudDisk = result.data
          }
        })
        .catch((err) => {
          showToast(err)
        })
    }

    const fetchPlayHistory = () => {
      if (!isAccountLoggedIn()) return
      return Promise.all([
        userPlayHistory({ uid: user.value.userId as number, type: 0 }),
        userPlayHistory({ uid: user.value.userId as number, type: 1 })
      ]).then((result) => {
        const data: { allData: any[]; weekData: any[] } = { allData: [], weekData: [] }
        const dataType = { 0: 'allData', 1: 'weekData' }
        if (result[0] && result[1]) {
          for (let i = 0; i < result.length; i++) {
            const songData = result[i][dataType[i]].map((item) => {
              const song = item.song
              song.playCount = item.playCount
              return song
            })
            data[dataType[i] as 'weekData' | 'allData'] = songData
          }
          liked.playHistory = data
        }
      })
    }

    const resetUserInfo = () => {
      user.value = {
        userId: null,
        avatarUrl: 'https://s4.music.126.net/style/web2/img/default/default_avatar.jpg?param=60y60',
        nickname: ''
      }
      likedSongPlaylistID.value = 0
    }

    const likeATrack = (id: number) => {
      if (!isAccountLoggedIn()) {
        showToast(t('toast.needToLogin'))
        return
      }

      const alreadyLiked = liked.songs.some((item) => sameTrackID(item, id))
      const like = !alreadyLiked

      likeTrack({ id, like })
        .then(() => {
          if (!like) {
            liked.songs = liked.songs.filter((item) => !sameTrackID(item, id))
          } else if (!liked.songs.some((item) => sameTrackID(item, id))) {
            liked.songs.push(id)
          }
        })
        .catch(() => {
          showToast(t('toast.addFailed'))
        })
    }

    /**
     * 获取“我喜欢的音乐”前几首详情，同时用完整 `trackIds` 修复红心状态。
     *
     * 每次加载前都重新验证喜欢歌单 ID，避免并发启动时旧 ID 抢先读取错误歌单。
     */
    const fetchLikedSongsWithDetails = async () => {
      await fetchLikedPlaylist()
      if (!likedSongPlaylistID.value) return

      try {
        const result = await getPlaylistDetail(likedSongPlaylistID.value, true)
        const trackIDs = result?.playlist?.trackIds
        if (!Array.isArray(trackIDs)) return

        syncLikedSongs(trackIDs.map((track: any) => track?.id ?? track))

        if (trackIDs.length === 0) {
          liked.songsWithDetails = []
          return
        }

        const detailResult = await getTrackDetail(
          trackIDs
            .slice(0, 8)
            .map((track) => track.id)
            .join(',')
        )

        if (Array.isArray(detailResult?.songs)) {
          liked.songsWithDetails = detailResult.songs
        }
      } catch (error) {
        console.warn('[Data] 获取喜欢歌曲详情失败，继续使用已有数据：', error)
      }
    }

    const resetLiked = () => {
      liked.songs = []
      liked.songsWithDetails = []
      liked.playlists = []
      liked.albums = []
      liked.artists = []
      liked.mvs = []
      liked.cloudDisk = []
      liked.playHistory = {
        weekData: [],
        allData: []
      }
    }

    return {
      user,
      likedSongPlaylistID,
      lastRefreshCookieDate,
      loginMode,
      liked,
      libraryPlaylistFilter,
      syncLikedSongs,
      fetchLikedPlaylist,
      fetchLikedSongs,
      fetchLikedSongsFromPlaylist,
      resetUserInfo,
      likeATrack,
      fetchLikedSongsWithDetails,
      resetLiked,
      fetchLikedAlbums,
      fetchLikedArtists,
      fetchLikedMVs,
      fetchCloudDisk,
      fetchPlayHistory
    }
  },
  {
    persist: {
      pick: ['user', 'likedSongPlaylistID', 'lastRefreshCookieDate', 'loginMode', 'liked.songs']
    }
  }
)
