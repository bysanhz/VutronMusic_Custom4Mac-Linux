import { defineStore } from 'pinia'
import { ref, toRaw, toRefs } from 'vue'
import { useSettingsStore } from './settings'
import { useNormalStateStore } from './state'
import { compare } from 'compare-versions'
import difference from 'lodash/difference'
import merge from 'lodash/merge'
import { Track, Playlist, lyricLine } from '@/types/music'

export const sortList = ['default', 'byname', 'ascend', 'descend'] as const

export const useLocalMusicStore = defineStore(
  'localMusic',
  () => {
    const enable = ref(true)
    const version = ref('2.4.0')
    const localTracks = ref<Track[]>([])
    const playlists = ref<Playlist[]>([])
    const sortBy = ref<(typeof sortList)[number]>('default')
    const artistBy = ref(0)
    const sortPlaylistsIDs = ref<number[]>([])

    const updateTrack = (filePath: string, track: any) => {
      const localTrack = localTracks.value.find((t) => t.filePath === filePath)
      if (!localTrack) return

      playlists.value.forEach((playlist) => {
        if (playlist.trackIds.includes(localTrack.id)) {
          playlist.trackIds.splice(playlist.trackIds.indexOf(localTrack.id), 1, track.id)
          playlist.coverImgUrl = `atom://local-asset?type=pic&id=${playlist.trackIds.at(-1)}&size=512`
          playlist.updateTime = Date.now()
        }
      })

      merge(localTrack, track)
      localTrack.matched = true
      localTrack.type = 'local'
      localTrack.album.matched = true
      localTrack.artists.forEach((artist: any) => {
        artist.matched = true
      })
    }

    const getNextLocalPlaylistId = (): number => {
      let highestId = 0
      for (const playlist of playlists.value) {
        const id = Number(playlist.id)
        if (Number.isSafeInteger(id) && id > highestId) highestId = id
      }
      return highestId + 1
    }

    const createLocalPlaylist = async (params: any) => {
      const playlist = {
        id: getNextLocalPlaylistId(),
        name: params.name as string,
        description: '',
        coverImgUrl: params.coverImgUrl as string,
        updateTime: Date.now(),
        trackCount: params.trackCount as number,
        trackIds: params.trackIds as number[]
      }
      const result = await window.mainApi?.invoke('upsertLocalPlaylist', playlist)
      if (result) {
        playlists.value.push(playlist)
        sortPlaylistsIDs.value.unshift(playlist.id)
        return playlist
      }
      return false
    }

    const addTrackToLocalPlaylist = (playlistId: number, tracks: number[]) => {
      return new Promise((resolve) => {
        const playlist = playlists.value.find((item) => item.id === playlistId)
        if (!playlist) return resolve(false)
        const newIDs = difference(tracks, playlist.trackIds) as number[]
        if (newIDs.length === 0) return resolve(false)
        const imgID = tracks.at(-1)
        if (imgID !== undefined) {
          playlist.coverImgUrl = `atom://local-asset?type=pic&id=${imgID}&size=512`
        }
        playlist.trackIds = [...playlist.trackIds, ...newIDs]
        playlist.trackCount = playlist.trackIds.length
        window.mainApi?.invoke('upsertLocalPlaylist', toRaw(playlist))
        resolve(true)
      })
    }

    const deleteLocalTracks = (trackIDs: number[]) => {
      for (const trackId of trackIDs) {
        const index = localTracks.value.findIndex((track) => track.id === trackId)
        if (index === -1) continue

        const affectedPlaylists = playlists.value.filter((playlist) =>
          playlist.trackIds.includes(trackId)
        )
        affectedPlaylists.forEach((playlist) => {
          removeTrackFromPlaylist(playlist.id, trackId)
        })
        localTracks.value.splice(index, 1)
      }
    }

    const updateLocalPlaylist = async (
      playlistId: number,
      info: { name: string; desc: string }
    ) => {
      const result: boolean = await window.mainApi?.invoke('updateLocalPlaylist', playlistId, info)
      if (!result) return false
      const playlist = playlists.value.find((item) => item.id === playlistId)
      if (!playlist) return false
      playlist.name = info.name
      playlist.description = info.desc
      playlist.updateTime = Date.now()
      return true
    }

    const removeTrackFromPlaylist = (playlistId: number, trackId: number) => {
      return new Promise((resolve) => {
        const playlist = playlists.value.find((item) => item.id === playlistId)
        if (!playlist) return resolve(false)
        playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId)
        const imageTrackId = playlist.trackIds.at(-1)
        playlist.coverImgUrl =
          imageTrackId !== undefined
            ? `atom://local-asset?type=pic&id=${imageTrackId}&size=512`
            : 'https://p1.music.126.net/jWE3OEZUlwdz0ARvyQ9wWw==/109951165474121408.jpg?param=512y512'
        playlist.trackCount = playlist.trackIds.length
        window.mainApi?.invoke('upsertLocalPlaylist', toRaw(playlist))
        resolve(true)
      })
    }

    const deleteLocalPlaylist = async (playlistId: number) => {
      const result = (await window.mainApi?.invoke('deleteLocalPlaylist', playlistId)) as boolean
      if (result) {
        playlists.value = playlists.value.filter((playlist) => playlist.id !== playlistId)
        sortPlaylistsIDs.value = sortPlaylistsIDs.value.filter((id) => id !== playlistId)
      }
      return result
    }

    const fetchLocalMusic = async () => {
      const result = await window.mainApi?.invoke('getLocalMusic')
      if (!result || !Array.isArray(result.songs) || !Array.isArray(result.playlists)) return

      localTracks.value = result.songs
      playlists.value = result.playlists
      if (playlists.value.length !== sortPlaylistsIDs.value.length) {
        sortPlaylistsIDs.value = playlists.value.map((playlist) => playlist.id)
      }
    }

    const getLocalLyric = async (id: number) => {
      const response = await fetch(`atom://local-asset?type=lyric&id=${id}`)
      return (await response.json()) as lyricLine[]
    }

    const getALocalTrack = (query: Partial<Track>): Track | undefined => {
      return localTracks.value.find((track) =>
        Object.entries(query).every(([key, value]) => track[key as keyof Track] === value)
      )
    }

    const getLocalPic = async (id: number, size: number) => {
      const defaultPic = new URL(`../assets/images/default.jpg`, import.meta.url).href
      const result = await fetch(`atom://local-asset?type=pic&id=${id}&size=${size}`)
        .then((response) => response.blob())
        .then((blob) => URL.createObjectURL(blob))
        .catch(() => null)
      return result ?? defaultPic
    }

    const scanLocalMusic = async (update = false) => {
      const settingsStore = useSettingsStore()
      const { scanDir, scanning, enble } = toRefs(settingsStore.localMusic)

      window.mainApi?.send('clearDeletedMusic')

      if (!scanDir.value.length || !enble.value) return
      const existResults = (await window.mainApi?.invoke(
        'msgCheckFileExist',
        toRaw(scanDir.value)
      )) as {
        path: string
        exist: boolean
      }[]
      const validDirs = existResults.filter((item) => item.exist).map((item) => item.path)
      if (!validDirs.length) return
      scanning.value = true
      window.mainApi?.send('msgScanLocalMusic', { filePath: validDirs, update })
    }

    const resetLocalMusic = () => {
      localTracks.value = []
      playlists.value = []
      sortBy.value = 'default'
    }

    const updateApp = async () => {
      const result = (await window.mainApi?.invoke('msgRequestGetVersion')) as string
      if (compare(version.value || '2.4.0', '2.9.0', '<=')) {
        const { showToast } = useNormalStateStore()
        showToast('扫描歌曲开始')
        scanLocalMusic(true)
      }
      version.value = result
    }
    updateApp()

    return {
      enable,
      version,
      localTracks,
      playlists,
      sortPlaylistsIDs,
      sortBy,
      artistBy,
      updateTrack,
      scanLocalMusic,
      fetchLocalMusic,
      getLocalLyric,
      getALocalTrack,
      resetLocalMusic,
      createLocalPlaylist,
      updateLocalPlaylist,
      addTrackToLocalPlaylist,
      removeTrackFromPlaylist,
      deleteLocalPlaylist,
      getLocalPic,
      deleteLocalTracks
    }
  },
  {
    persist: {
      pick: ['sortBy', 'sortPlaylistsIDs', 'version']
    }
  }
)
