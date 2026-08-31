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
     * 刷新用户歌单，并保留最后一次成功获取到的“我喜欢的音乐”歌单 ID。
     *
     * 网络请求失败或返回空数据时不清空本地缓存，避免启动阶段的短暂 API
     * 异常把后续“喜欢歌曲详情”请求引导到无效的歌单 ID。
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
        const firstPlaylistID = Number(res.playlist[0]?.id)
        if (Number.isFinite(firstPlaylistID) && firstPlaylistID > 0) {
          likedSongPlaylistID.value = firstPlaylistID
        }
        return true
      } catch (error) {
        console.warn('[Data] 获取用户歌单失败，继续使用本地缓存：', error)
        return false
      }
    }

    /**
     * 刷新喜欢歌曲 ID。
     *
     * `liked.songs` 会持久化为最后一次成功快照。只有服务端明确返回 ID 数组时才
     * 覆盖该快照；请求失败、Cookie 尚未就绪或 API 返回 null 时均保留旧值，避免
     * 所有红心在一次瞬时请求失败后同时变为空心。
     */
    const fetchLikedSongs = async () => {
      if (!user.value.userId) return false

      try {
        const res = await userLikedSongsIDs(user.value.userId)
        if (!Array.isArray(res?.ids)) return false

        liked.songs = res.ids
          .map((id: number | string) => Number(id))
          .filter((id: number) => Number.isFinite(id))
        return true
      } catch (error) {
        console.warn('[Data] 获取喜欢歌曲失败，继续使用本地缓存：', error)
        return false
      }
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
     * 获取“我喜欢的音乐”前几首详情。
     *
     * 启动时该函数可能早于歌单列表完成，因此在没有有效歌单 ID 时先主动刷新一次
     * 歌单。这样即使调用顺序并发，也不会因为初始 ID 为 0 而永久跳过详情加载。
     */
    const fetchLikedSongsWithDetails = async () => {
      if (!likedSongPlaylistID.value) {
        await fetchLikedPlaylist()
      }
      if (!likedSongPlaylistID.value) return

      try {
        const result = await getPlaylistDetail(likedSongPlaylistID.value, true)
        const trackIDs = result?.playlist?.trackIds
        if (!Array.isArray(trackIDs)) return

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
      fetchLikedPlaylist,
      fetchLikedSongs,
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
