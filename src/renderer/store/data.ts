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
     * 从“我喜欢的音乐”歌单详情重建喜欢歌曲 ID。
     *
     * 这是 `/likelist` 的独立兜底路径。只要“我喜欢的音乐”页面能够正常显示，
     * 这里就能从同一个歌单详情里的 `trackIds` 恢复所有红心，而不依赖 `/likelist`。
     */
    const fetchLikedSongsFromPlaylist = async () => {
      if (!likedSongPlaylistID.value) {
        await fetchLikedPlaylist()
      }
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
     * 优先使用 `/likelist`；如果接口返回异常、空结构或直接报错，则自动切换到
     * “我喜欢的音乐”歌单详情作为权威兜底。这样页面已经能显示喜欢歌单时，播放器
     * 不会再出现“歌曲明明在喜欢歌单里，红心却仍是空心”的状态分裂。
     */
    const fetchLikedSongs = async () => {
      if (!user.value.userId) return false

      try {
        const res = await userLikedSongsIDs(user.value.userId)
        if (Array.isArray(res?.ids)) {
          syncLikedSongs(res.ids)
          return true
        }

        console.warn('[Data] /likelist 未返回 ids，改用喜欢歌单详情恢复红心状态')
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
     * `trackIds` 是整个喜欢歌单，而 `tracks` 可能只包含接口首批返回的若干歌曲。
     * 因此必须先用完整 `trackIds` 更新 `liked.songs`，再只取前几首加载详情。
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
