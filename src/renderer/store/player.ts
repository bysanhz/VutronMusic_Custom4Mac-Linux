import { defineStore } from 'pinia'
import shuffleFn from 'lodash/shuffle'
import cloneDeep from 'lodash/cloneDeep'
import {
  ref,
  computed,
  reactive,
  watch,
  watchEffect,
  onMounted,
  onBeforeUnmount,
  toRaw,
  nextTick
} from 'vue'
import { useLocalMusicStore } from './localMusic'
import { useStreamMusicStore } from './streamingMusic'
import { useSettingsStore } from './settings'
import { useNormalStateStore } from './state'
import { useOsdLyricStore } from './osdLyric'
import { useDataStore } from './data'
import { searchMatch, fmTrash, personalFM, songChorus } from '../api/other'
import {
  getLyric as getApiLyric,
  getTrackDetail,
  scrobble,
  type ScrobbleParams
} from '../api/track'
import { useI18n } from 'vue-i18n'
import _ from 'lodash'
import { extractExpirationFromUrl } from '../utils'
import { globalLyricOffset, setGlobalLyricOffset } from '../utils/globalLyricOffset'
import {
  cancelSleepTimerForTrackChange,
  consumeSleepTimerAtTrackEnd,
  registerSleepTimerPauseHandler
} from '../utils/sleepTimerSettings'
import { markPlaybackEndReason } from '../utils/playbackFeedback'
import {
  claimPendingNeteaseListenEntries,
  flushNeteaseListenLedger,
  hasPendingNeteaseListenEntries,
  markNeteaseListenEntryAccepted,
  markNeteaseListenEntryFailed,
  recordNeteaseListenSegment,
  setActiveNeteaseListenAccount,
  setProvisionalNeteaseListen,
  type NeteaseListenEntry
} from '../utils/neteaseListenLedger'
import { Track, serviceName, lyricLine } from '@/types/music'

interface biquadType {
  31: number
  62: number
  125: number
  250: number
  500: number
  1000: number
  2000: number
  4000: number
  8000: number
  16000: number
}

interface userBiquadType {
  [key: string]: biquadType
}

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('')
    }, ms)
  })

export const usePlayerStore = defineStore(
  'player',
  () => {
    const playing = ref(false)
    const playingNext = ref(false)
    const enabled = ref(false)
    const progress = ref(0)
    const _progress = ref(0)
    const repeatMode = ref('off')
    const _shuffle = ref(false)
    const volume = ref(1)
    const volumeBeforeMuted = ref(1)
    const isPersonalFM = ref(false)
    const currentTrack = ref<Track | null>(null)
    const title = ref<string | null>('VutronMusic')
    const outputDevice = ref('')
    const backRate = ref(1.0)
    const pitch = ref(1.0)
    const isLocalList = ref(false)
    const chorus = ref(0)
    // ======== newADD start======
    // 保存接口返回的原始副歌时间，最终位置统一叠加有效歌词偏移。
    const chorusStartTime = ref(0)
    // =========== newADD end ========
    const pic = ref<string>(
      currentTrack.value?.album?.picUrl ||
        'https://p2.music.126.net/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg'
    )
    const playlistSource = ref<{
      type: string
      id: number | string
    }>({ type: 'album', id: 0 })

    const lyrics = ref<lyricLine[]>([])
    const _personalFMLoading = ref(false)
    const _personalFMTrack = ref<{
      id: number
      [key: string]: any
    }>({ id: 0 })
    const _personalFMNextTrack = ref<{
      id: number
      [key: string]: any
    }>({ id: 0 })

    let lastUpdateTime = 0
    let trackLoadRevision = 0
    let trackLookupFailureRevision = -1
    let neteaseSessionListenedSeconds = 0
    let neteaseSessionCommittedSeconds = 0
    let neteaseSessionStartedAt = 0
    let neteaseSessionCommittedAt = 0
    let neteaseSessionId = ''
    let neteaseSessionAccountId = 'anonymous'
    let neteaseSessionSlices: Array<{
      startedAt: number
      endedAt: number
      seconds: number
    }> = []
    let neteaseScrobbleQueue: Promise<void> = Promise.resolve()
    let neteaseRetryTimer: number | null = null
    const NETEASE_SCROBBLE_QUEUE_GAP_MS = 350
    const MIN_NETEASE_CHECKPOINT_SECONDS = 30
    const NETEASE_RETRY_POLL_MS = 30_000

    // 同一首歌曲的远程音源只自动刷新一次。
    // 第二次仍无法播放时直接切歌，避免 CORS/坏音源导致 replaceCurrentTrack 无限递归。
    const MAX_PLAYBACK_SOURCE_RETRIES = 1
    let playbackSourceRetryTrackId: string | null = null
    let playbackSourceRetryCount = 0

    const isTrackLoadCurrent = (revision: number, track?: Track | null) => {
      if (revision !== trackLoadRevision) return false
      if (!track || !currentTrack.value) return true
      return (
        String(currentTrack.value.id) === String(track.id) ||
        (!!track.filePath && track.filePath === currentTrack.value.filePath)
      )
    }

    const localMusicStore = useLocalMusicStore()
    const streamMusicStore = useStreamMusicStore()
    const { updateTrack, fetchLocalMusic, getALocalTrack, getLocalLyric, getLocalPic } =
      localMusicStore
    const {
      scrobble: scrobbleStream,
      fetchStreamMusic,
      getStreamLyric,
      getStreamPic,
      getAStreamTrack,
      likeAStreamTrack
    } = streamMusicStore
    const dataStore = useDataStore()
    const { likeATrack } = dataStore
    const { t } = useI18n()

    const settingsStore = useSettingsStore()
    const stateStore = useNormalStateStore()
    const { showToast } = stateStore

    const osdLyricStore = useOsdLyricStore()

    /**
     * 播放器最终使用的歌词偏移。
     *
     * 单曲 offset 保留歌曲自身的校正值；globalLyricOffset 是用户针对全部歌曲设置的
     * 统一偏移。二者相加后供主歌词、逐字歌词、桌面歌词和托盘歌词共同使用。
     */
    const lyricOffset = computed(() => {
      const trackOffset = Number(currentTrack.value?.offset) || 0
      return Math.round((trackOffset + globalLyricOffset.value) * 10) / 10
    })

    // ======== newADD start======
    const updateChorusPosition = () => {
      chorus.value = chorusStartTime.value > 0 ? chorusStartTime.value - lyricOffset.value : 0
    }

    /**
     * 获取歌曲副歌起始时间，并保证异步结果不会覆盖已经切换的新歌曲。
     *
     * Args:
     *   track: 需要查询副歌位置的歌曲，默认使用当前歌曲。
     */
    const loadCurrentTrackChorus = async (
      track: Track | null = currentTrack.value,
      revision = trackLoadRevision
    ) => {
      if (!isTrackLoadCurrent(revision, track)) return

      chorusStartTime.value = 0
      chorus.value = 0

      if (!settingsStore.general.showChorus || !track?.matched) return

      const requestedTrackID = track.id
      try {
        const result = await songChorus(requestedTrackID)
        if (
          !isTrackLoadCurrent(revision, track) ||
          !settingsStore.general.showChorus
        ) {
          return
        }

        const startTime = Number(result?.chorus?.[0]?.startTime)
        if (!Number.isFinite(startTime) || startTime < 0) return

        chorusStartTime.value = startTime / 1000
        updateChorusPosition()
      } catch (error) {
        if (isTrackLoadCurrent(revision, track)) {
          console.warn('[Player] 获取副歌时间失败：', error)
        }
      }
    }
    // =========== newADD end ========

    const _shuffleList = ref<number[]>([])
    const _list = ref<number[]>([])
    const _playNextList = ref<number[]>([])
    const currentTrackIndex = ref(0)

    const currentIndex = ref(-1)

    let timer: any = null

    const biquadParams = reactive<biquadType>({
      31: 0,
      62: 0,
      125: 0,
      250: 0,
      500: 0,
      1000: 0,
      2000: 0,
      4000: 0,
      8000: 0,
      16000: 0
    })

    const biquadUser = ref<userBiquadType[]>([])
    const biquadParamsKeys = Object.keys(biquadParams)
    const convolverParams = reactive<{
      fileName: string
      buffer: AudioBuffer | null
      mainGain: number
      sendGain: number
    }>({
      fileName: '',
      buffer: null,
      mainGain: 1,
      sendGain: 0
    })

    const audioNodes = {
      audio: null as HTMLAudioElement | null,
      audioContext: null as AudioContext | null,
      audioSource: null as MediaElementAudioSourceNode | null,
      soundtouch: null as null | AudioWorkletNode,
      biquads: new Map<string, BiquadFilterNode>(),
      dynamics: null as DynamicsCompressorNode | null,
      convolverSourceGain: null as GainNode | null,
      convolverOutputGain: null as GainNode | null,
      convolver: null as ConvolverNode | null,
      masterGain: null as GainNode | null
    }

    const currentTrackDuration = computed(() => {
      return ~~((currentTrack.value?.dt || currentTrack.value?.duration || 1000) / 1000)
    })

    const isLiked = computed(() => {
      return (
        !!dataStore.liked.songs.find((id) => id === currentTrack.value?.id) ||
        !!_.flatten(Object.values(streamMusicStore.streamLikedTracks)).find(
          (t) => t.id === currentTrack.value?.id
        )
      )
    })

    const list = computed({
      get: () => (_shuffle.value ? _shuffleList.value : _list.value),
      set: (list) => {
        _list.value = list
      }
    })

    const shuffle = computed({
      get: () => _shuffle.value,
      set: (value) => {
        _shuffle.value = value
        if (value) {
          shuffleTheList()
        }
      }
    })

    watch(volume, (value) => {
      if (!audioNodes.masterGain) return
      const fade = fadeDuration.value
      smoothGain(value, fade)
    })

    watch(pitch, (value) => {
      nextTick(() => {
        // @ts-ignore
        if (audioNodes.soundtouch) audioNodes.soundtouch.parameters.get('pitch').value = value
      })
    })

    const seek = computed({
      get() {
        return _progress.value
      },
      set(value) {
        if (!audioNodes.audio) return
        audioNodes.audio.currentTime = value
        _progress.value = value
        progress.value = value
        lastUpdateTime = value
        currentIndex.value = getLyricIndex(lyrics.value, 0, 1)
        if (window.env?.isLinux) {
          window.mainApi?.send('updatePlayerState', { progress: value })
        }
        navigator.mediaSession.setPositionState({
          duration: currentTrackDuration.value,
          playbackRate: playbackRate.value,
          position: value
        })
        clearTimeout(timer)
        updateIndex()
      }
    })

    const useBiquad = computed(() => {
      return biquadParamsKeys.some((key) => biquadParams[Number(key) as keyof biquadType] !== 0)
    })

    const useConvolver = computed(() => {
      return convolverParams.fileName !== ''
    })

    const usePitch = computed(() => {
      return pitch.value !== 1.0
    })

    const enableDRP = computed(() => settingsStore.misc.enableDiscordRichPresence)

    watch(enableDRP, (value) => {
      if (value) {
        playing.value
          ? playDiscordPresence(currentTrack.value!, audioNodes.audio?.currentTime || 0)
          : pauseDiscordPresence(currentTrack.value!)
      } else {
        pauseDiscordPresence(currentTrack.value!)
      }
    })

    const enableFM = computed(() => settingsStore.misc.lastfm.enable)

    watch(
      () => [audioNodes.audioSource, useBiquad.value, useConvolver.value, usePitch.value],
      (value) => {
        if (!value[0]) return
        audioNodes.audioSource?.disconnect()
        audioNodes.soundtouch?.disconnect()
        audioNodes.biquads.get(`hz${biquadParamsKeys[biquadParamsKeys.length - 1]}`!)?.disconnect()
        audioNodes.masterGain?.disconnect()

        let start = audioNodes.audioSource!
        const lst: Function[] = []
        if (value[3]) lst.push(connectToSoundtouch)
        if (value[1]) lst.push(connectToBiquad)
        if (value[2]) lst.push(connectToConvolver)

        for (const func of lst) {
          start = func(start)
        }
        start.connect(audioNodes.masterGain!)
        audioNodes.masterGain!.connect(audioNodes.audioContext!.destination)
      },
      { immediate: true }
    )

    const fadeDuration = computed(() => {
      const d = settingsStore.general.fadeDuration
      return Math.max(0.1, Math.min(1, Number(d) || 0.2))
    })

    const source = computed(() => {
      if (!currentTrack.value) return ''
      const sourceMap = {
        localTrack: '本地音乐',
        navidrome: 'navidrome',
        emby: 'emby',
        netease: '网易云音乐',
        qq: 'QQ音乐',
        kugou: '酷狗音乐',
        kuwo: '酷我音乐',
        bodian: '波点音乐',
        bilibili: '哔哩哔哩',
        pyncmd: '第三方网易云音乐',
        migu: '咪咕音乐',
        cache: '缓存'
      }
      const sources = currentTrack.value.source?.split('-')
      if (!sources) return sourceMap.netease
      let source = ''
      if (sources.length === 1) {
        source = sourceMap[sources[0]]
      } else {
        source = `${sourceMap[sources[0]]}-${sourceMap[sources[1]]}`
      }
      return `${currentTrack.value.name}, 音源：${source ?? currentTrack.value.source}`
    })

    const playbackRate = computed({
      get: () => backRate.value,
      set: (value) => {
        backRate.value = value
        audioNodes.audio!.playbackRate = value
      }
    })

    watch(playbackRate, (value) => {
      window.mainApi?.send('updatePlayerState', {
        rate: value,
        progress: audioNodes.audio?.currentTime ?? 0
      })
      navigator.mediaSession.setPositionState({
        duration: currentTrackDuration.value,
        playbackRate: value,
        position: seek.value > currentTrackDuration.value ? 0 : seek.value
      })
      clearTimeout(timer)
      updateIndex()
    })

    const shouldGetLrcIndex = computed(() => {
      return (
        stateStore.showLyrics ||
        osdLyricStore.show ||
        (window.env?.isMac && settingsStore.tray.showLyric) ||
        (window.env?.isLinux && settingsStore.tray.enableExtension)
      )
    })

    const noLyric = computed(() => lyrics.value.length === 0)

    // 对于网易云官方的歌曲链接，其有效时间只有 25 分钟，过期后需要重新获取链接
    const isValidUrl = (url: string) => {
      if (!currentTrack.value || !audioNodes.audio) return false
      if (currentTrack.value.source === 'netease') {
        const expiration = extractExpirationFromUrl(url)
        if (!expiration) return true
        const now = new Date()
        const endTime = (now.getTime() +
          (currentTrack.value.dt || currentTrack.value.duration || 0)) as number
        const validTime = new Date(endTime)
        if (validTime >= expiration) return false
        return true
      }
      return true
    }

    const getLyricIndex = (
      lst: { start: number; end: number }[],
      start = 0,
      rate: 1 | 1000 = 1
    ) => {
      if (!lst.length || !audioNodes.audio) return -1
      start = Math.max(start, 0)
      for (let i = start; i < lst.length; i++) {
        if (
          lst[i]?.start &&
          lst[i]?.start / rate > audioNodes.audio.currentTime + lyricOffset.value
        ) {
          return i - 1
        }
      }

      const end = lst.at(-1)!.end
      if (audioNodes.audio.currentTime + lyricOffset.value > end / rate) {
        return lst.length
      } else {
        return lst.length - 1
      }
    }

    watch(shouldGetLrcIndex, (value) => {
      if (value) {
        updateIndex()
      } else {
        clearTimeout(timer)
      }
    })

    watch(
      () => convolverParams.buffer,
      async (value) => {
        if (!audioNodes.audioContext) return
        await nextTick()
        if (value instanceof AudioBuffer) {
          if (audioNodes.convolver) audioNodes.convolver.buffer = value
          audioNodes.convolverSourceGain?.gain.setValueAtTime(
            convolverParams.mainGain,
            audioNodes.audioContext.currentTime
          )
          audioNodes.convolverOutputGain?.gain.setValueAtTime(
            convolverParams.sendGain,
            audioNodes.audioContext.currentTime
          )
        } else {
          if (audioNodes.convolver) audioNodes.convolver.buffer = null
          audioNodes.convolverSourceGain?.gain.setValueAtTime(
            convolverParams.mainGain,
            audioNodes.audioContext.currentTime
          )
          audioNodes.convolverOutputGain?.gain.setValueAtTime(
            convolverParams.sendGain,
            audioNodes.audioContext.currentTime
          )
        }
      }
    )

    watch(outputDevice, (value) => {
      setDevice(value)
    })

    watch(
      () => convolverParams.mainGain,
      (value) => {
        if (convolverParams.buffer && audioNodes.convolverSourceGain) {
          audioNodes.convolverSourceGain.gain.setValueAtTime(
            value,
            audioNodes.audioContext?.currentTime || 0
          )
        }
      }
    )

    watch(
      () => !audioNodes.audio?.paused,
      (value) => {
        playing.value = value
      }
    )

    watch(
      () => convolverParams.sendGain,
      (value) => {
        if (convolverParams.buffer && audioNodes.convolverOutputGain) {
          audioNodes.convolverOutputGain.gain.setValueAtTime(
            value,
            audioNodes.audioContext?.currentTime || 0
          )
        }
      }
    )

    const _refreshLineIdx = () => {
      if (!lyrics.value.length || !shouldGetLrcIndex.value) return
      currentIndex.value = getLyricIndex(lyrics.value, 0, 1)
      const nextLine = lyrics.value[currentIndex.value + 1]

      if (nextLine) {
        const driftTime =
          nextLine.start - ((audioNodes.audio?.currentTime || 0) + lyricOffset.value)
        if (playing.value) {
          timer = setTimeout(
            () => {
              clearTimeout(timer)
              if (!playing.value) return
              _refreshLineIdx()
            },
            (driftTime * 1000) / playbackRate.value
          )
        }
      }
    }
    const updateIndex = () => {
      if (!lyrics.value.length || !shouldGetLrcIndex.value) return
      currentIndex.value = getLyricIndex(lyrics.value, 0, 1)
      if (!shouldGetLrcIndex.value) return
      if (!playing.value) return
      _refreshLineIdx()
    }

    const currentLyric = computed(() => {
      const line = lyrics.value[currentIndex.value]
      if (!line) return { content: currentTrack.value?.name || '听你想听的音乐', time: 0, start: 0 }
      const nextLine = lyrics.value[currentIndex.value + 1]
      const diff = (nextLine ? nextLine.start : currentTrackDuration.value) - line?.start
      return { content: line?.lyric?.text || '', time: diff, start: line?.start || 0 }
    })

    watch(currentLyric, (value) => {
      if (
        window.env?.isLinux &&
        settingsStore.tray.enableExtension &&
        stateStore.extensionCheckResult
      ) {
        window.mainApi?.send('updateLyricInfo', { currentLyric: toRaw(value) })
      }
    })

    watch(
      () => settingsStore.general.showChorus,
      () => {
        void loadCurrentTrackChorus()
      }
    )

    watch(
      () => window.env?.isLinux && settingsStore.tray.enableExtension,
      (value) => {
        if (!stateStore.extensionCheckResult) return
        if (value) {
          window.mainApi?.send('updateLyricInfo', { currentLyric: toRaw(currentLyric.value) })
        } else {
          window.mainApi?.send('updateLyricInfo', { currentLyric: { content: '', time: 10 } })
        }
      }
    )

    watch(playing, (value) => {
      window.mainApi?.send('updatePlayerState', {
        playing: value,
        progress: audioNodes.audio?.currentTime || 0
      })
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = value ? 'playing' : 'paused'
        navigator.mediaSession.setPositionState({
          duration: currentTrackDuration.value,
          playbackRate: playbackRate.value,
          position: seek.value > currentTrackDuration.value ? 0 : seek.value
        })
      }
      if (osdLyricStore.show) {
        window.mainApi?.sendMessage({ type: 'update-osd-status', data: { playing: value } })
      }
      progress.value = audioNodes.audio?.currentTime || 0
      _progress.value = audioNodes.audio?.currentTime || 0
      if (value) {
        updateIndex()
      } else {
        if (currentTrack.value) commitNeteaseSessionProgress(currentTrack.value)
        flushNeteaseListenLedger(true)
        clearTimeout(timer)
        timer = null
      }
    })

    watch(
      () => playing.value && settingsStore.general.preventSuspension,
      (value) => {
        window.mainApi?.send('update-powersave', value)
      }
    )

    // ======== newADD start======
    /**
     * 同步当前歌曲的喜欢状态。
     *
     * 详细说明：
     * 1. updatePlayerState 用于同步托盘菜单等原有界面；
     * 2. update-osd-status 用于同步紧凑桌面歌词中的爱心按钮；
     * 3. 当前歌曲切换、收藏或取消收藏后，只要 isLiked 重新计算，
     *    桌面歌词窗口就会自动收到最新状态。
     *
     * Args:
     *   value: 当前歌曲是否已经加入喜欢。
     *
     * Returns:
     *   无返回值。
     *
     * Raises:
     *   mainApi 不存在时使用可选链静默跳过。
     */
    watch(isLiked, (value) => {
      window.mainApi?.send('updatePlayerState', { like: value })

      if (osdLyricStore.show) {
        window.mainApi?.sendMessage({
          type: 'update-osd-status',
          data: {
            isLiked: value
          }
        })
      }
    })
    // =========== newADD end ========

    watch(repeatMode, (value) => {
      window.mainApi?.send('updatePlayerState', { repeatMode: value })
    })

    watch(isPersonalFM, (value) => {
      window.mainApi?.send('updatePlayerState', { isPersonalFM: value })
    })

    watch(shuffle, (value) => {
      window.mainApi?.send('updatePlayerState', { shuffle: value })
    })

    watchEffect(() => {
      for (const biquad of biquadParamsKeys) {
        const value = biquadParams[biquad]
        const biquadNode = audioNodes.biquads.get(`hz${biquad}`)
        if (biquadNode) biquadNode.gain.value = value
      }
    })

    watch(lyricOffset, (value) => {
      clearTimeout(timer)
      updateIndex()
      updateChorusPosition()
      if (window.env?.isLinux && currentTrack.value) {
        void updateMediaSessionMetaData(currentTrack.value)
      }
      if (osdLyricStore.show) {
        window.mainApi?.sendMessage({
          type: 'update-osd-status',
          data: { lyricOffset: [value, audioNodes.audio?.currentTime || 0] }
        })
      }
    })

    watch(
      () => [osdLyricStore.mode, osdLyricStore.translationMode],
      () => {
        if (osdLyricStore.show) {
          window.mainApi?.sendMessage({
            type: 'update-osd-status',
            data: { seek: audioNodes.audio?.currentTime || 0 }
          })
        }
      }
    )

    const updateLocalID2OnlineID = (localID: number, onlineID: number) => {
      _list.value = _list.value.map((id) => (id === localID ? onlineID : id))
      if (_shuffle.value) {
        _shuffleList.value = _shuffleList.value.map((id) => (id === localID ? onlineID : id))
        _playNextList.value = _playNextList.value.map((id) => (id === localID ? onlineID : id))
      }
    }

    const searchMatchForLocal = async (track: Track, revision = trackLoadRevision) => {
      if (!isTrackLoadCurrent(revision, track)) return

      if (track.type === 'local' && !track.matched) {
        const params = {
          title: track.name,
          album: '',
          artist: track.artists[0].name,
          duration: (track.dt || track.duration) / 1000,
          md5: track.md5,
          localID: track.id
        }

        try {
          const result = await searchMatch(params)
          if (!isTrackLoadCurrent(revision, track)) return

          if (result?.result?.songs?.length > 0) {
            const newTrack = result.result.songs[0]
            updateLocalID2OnlineID(track.id, newTrack.id)
            updateTrack(track.filePath, newTrack)
            const matchedTrack = getALocalTrack({ filePath: track.filePath })
            if (matchedTrack) track = matchedTrack
          }
        } catch (error) {
          if (!isTrackLoadCurrent(revision, track)) return
          showToast(error instanceof Error ? error.message : String(error))
        }
      }

      if (!isTrackLoadCurrent(revision, track)) return

      window.mainApi?.send('write-cover', {
        filePath: track.filePath,
        picUrl: track.matched ? track.album?.picUrl || track.al?.picUrl : null,
        currentPlayingPath: track.filePath
      })
      if (track.type === 'online' && !track.cache && settingsStore.autoCacheTrack.enable) {
        window.mainApi?.send('cacheATrack', { id: track.id, url: track.url })
      }

      await getCurrentTrackInfo(track, revision)
      if (!isTrackLoadCurrent(revision, track)) return

      await updateMediaSessionMetaData(track, revision)
      if (!isTrackLoadCurrent(revision, track)) return

      if (osdLyricStore.show) {
        window.mainApi?.sendMessage({
          type: 'update-osd-status',
          data: { title: `${(track.artists || track.ar)[0]?.name} - ${track.name}` }
        })
      }
    }

    const setConvolver = (data: {
      name: string
      source: string
      mainGain: number
      sendGain: number
    }) => {
      convolverParams.fileName = data.source
      convolverParams.mainGain = data.mainGain
      convolverParams.sendGain = data.sendGain

      if (!data.source) {
        convolverParams.buffer = null
        return
      }

      const path = new URL(`../assets/medias/${data.source}`, import.meta.url).href
      try {
        fetch(path)
          .then((res) => res.arrayBuffer())
          .then((arrayBuffer) => audioNodes.audioContext?.decodeAudioData(arrayBuffer))
          .then((buffer) => {
            if (buffer) convolverParams.buffer = buffer
          })
          .catch((err) => {
            console.log(err)
          })
      } catch {
        console.log('set convolver failed!')
      }
    }

    const getCurrentTrackInfo = async (track: Track, revision = trackLoadRevision) => {
      if (!track || !isTrackLoadCurrent(revision, track)) return
      void loadCurrentTrackChorus(track, revision)
      await getLyric(track, revision)
      if (!isTrackLoadCurrent(revision, track)) return
      currentIndex.value = getLyricIndex(lyrics.value, 0, 1)
    }

    const getLyric = async (track: Track, revision = trackLoadRevision) => {
      let data: lyricLine[] = []
      switch (track.type!) {
        case 'stream':
          data = await getStreamLyric(track)
          break
        case 'online':
          data = await getApiLyric(track.id)
          break
        case 'local':
          data = await _getLocalLyric(track)
          break
        default:
          break
      }

      if (!isTrackLoadCurrent(revision, track)) return

      data = data.filter((l) => !/^作(词|曲)\s*(:|：)\s*无$/.exec(l.lyric.text))
      if (data.length) {
        const trackDuration = ~~((track.dt || track.duration || 1000) / 1000)
        data.at(-1)!.end =
          data.at(-1)!.end || Math.min(trackDuration, data.at(-1)!.start + 10)
      }
      const includeAM =
        data.length <= 10 && data.map((l) => l.lyric.text).includes('纯音乐，请欣赏')
      if (includeAM) {
        const reg = /^作(词|曲)\s*(:|：)\s*/
        const artists = track.artists ?? track.ar
        const author = artists[0]?.name
        data = data.filter((l) => {
          const regExpArr = l.lyric.text.match(reg)
          return !regExpArr || l.lyric.text.replace(regExpArr[0], '') !== author
        })
      }

      if (!isTrackLoadCurrent(revision, track)) return
      lyrics.value = data.length === 1 && includeAM ? [] : data
    }

    const _getLocalLyric = async (track: Track) => {
      let data: lyricLine[] = []
      const trackInfoOrder = settingsStore.localMusic.trackInfoOrder
      for (const order of trackInfoOrder) {
        switch (order) {
          case 'online':
            if (track.matched) data = await getApiLyric(track.id)
            break
          default:
            data = await getLocalLyric(track.id)
            break
        }
        if (data.length) return data
      }
      return data
    }

    /**
     * 替换播放列表，前两个参数的目的是为了实现网易云听歌记录的功能，同时为了实现优先本地歌曲时的提示功能
     * @param playlistSourceType 播放列表类型
     * @param playlistSourceID 播放列表ID
     * @param trackIDS 播放列表歌曲ID
     * @param autoPlayTrackID 自动播放歌曲的index
     */
    const replacePlaylist = async (
      playlistSourceType: string,
      playlistSourceID: number | string,
      trackIDS: number[],
      autoPlayTrackID = 0
    ) => {
      if (playlistSourceType.includes('local') && settingsStore.localMusic.scanning) {
        showToast(t('toast.scanning'))
        return
      }

      isPersonalFM.value = false
      _list.value = trackIDS
      isLocalList.value = playlistSourceType.includes('local')

      playlistSource.value = {
        type: playlistSourceType,
        id: playlistSourceID
      }

      if (_shuffle.value) {
        shuffleTheList(autoPlayTrackID)
        currentTrackIndex.value = 0
        replaceCurrentTrack(list.value[currentTrackIndex.value], true)
      } else {
        currentTrackIndex.value = autoPlayTrackID
        replaceCurrentTrack(list.value[autoPlayTrackID], true)
      }
      if (!enabled.value) enabled.value = true
    }

    const replaceCurrentTrack = async (trackID: number | string, autoPlay = true) => {
      const revision = ++trackLoadRevision
      trackLookupFailureRevision = -1

      const retryTrackId = String(trackID)
      if (playbackSourceRetryTrackId !== retryTrackId) {
        playbackSourceRetryTrackId = retryTrackId
        playbackSourceRetryCount = 0
      }

      cancelSleepTimerForTrackChange(trackID)
      if (autoPlay && currentTrack.value?.name) {
        scrobbleFM(currentTrack.value, seek.value)
        void scrobbleNetease(currentTrack.value, seek.value)
      }

      let track: Track | undefined
      try {
        track = await getLocalMusic(trackID as number)
      } catch (error) {
        if (revision !== trackLoadRevision) return false
        trackLookupFailureRevision = revision
        console.error(`[Player] 获取歌曲信息失败: ${trackID}`, error)
        showToast(t('toast.trackInfoFailed'))
        return false
      }
      if (revision !== trackLoadRevision) return false

      if (!track) {
        showToast(t('toast.trackMissingNext'))
        void _playNextTrack(isPersonalFM.value)
        return false
      }

      const resumePosition =
        !autoPlay &&
        currentTrack.value?.id !== undefined &&
        String(currentTrack.value.id) === String(trackID)
          ? seek.value
          : 0

      currentTrack.value = track
      neteaseSessionListenedSeconds = 0
      neteaseSessionCommittedSeconds = 0
      neteaseSessionStartedAt = 0
      neteaseSessionCommittedAt = 0
      neteaseSessionId = createNeteaseSessionId()
      neteaseSessionAccountId = currentNeteaseAccountId()
      neteaseSessionSlices = []
      setProvisionalNeteaseListen()
      lyrics.value = []
      currentIndex.value = -1
      chorusStartTime.value = 0
      chorus.value = 0
      if (pic.value.startsWith('blob:')) URL.revokeObjectURL(pic.value)
      pic.value = new URL('../assets/images/default.jpg', import.meta.url).href
      seek.value = resumePosition

      void searchMatchForLocal(track, revision)

      const source = await getTrackSource(track)
      if (revision !== trackLoadRevision) return false

      if (!source) {
        showToast(track.reason || t('toast.audioSourceUnavailable', { name: track.name }))
        markPlaybackEndReason('playback-error')
        void _playNextTrack(isPersonalFM.value)
        return false
      }

      const replaced = await playAudioSource(source, autoPlay, revision)
      if (revision !== trackLoadRevision) return false

      if (autoPlay && currentTrack.value?.type === 'stream') {
        scrobbleStream(track)
      }
      return replaced
    }

    const resolveNeteaseScrobbleSourceID = (track: Track): number | string => {
      const sourceType = String(playlistSource.value.type || '').toLowerCase()
      const usePlaylistSource =
        playlistSource.value.id !== 0 &&
        !sourceType.includes('local') &&
        sourceType !== 'personalfm'

      if (usePlaylistSource) return playlistSource.value.id
      return track.al?.id || track.album?.id || 0
    }

    const currentNeteaseAccountId = (): string =>
      String(dataStore.user?.userId || 'anonymous')

    const createNeteaseSessionId = (): string => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
      }
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }

    const buildNeteaseScrobbleParams = (track: Track): ScrobbleParams | null => {
      const id = Number(track.id)
      const trackDuration = Math.floor((track.dt || track.duration || 0) / 1000)
      if (!Number.isFinite(id) || id <= 0 || trackDuration <= 0) return null
      const artists = track.artists ?? track.ar ?? []
      return {
        id,
        sourceid: resolveNeteaseScrobbleSourceID(track),
        total: trackDuration,
        name: track.name,
        artist: artists.map((artist) => artist.name).filter(Boolean).join('/'),
        source: playlistSource.value.type,
        allowShort: true,
        allowRepeat: true
      }
    }

    const commitNeteaseSessionProgress = (
      track: Track,
      { force = false }: { force?: boolean } = {}
    ): number => {
      if (!shouldTrackNeteaseListenTime(track)) return 0
      if (
        neteaseSessionAccountId === 'anonymous' ||
        neteaseSessionAccountId !== currentNeteaseAccountId()
      ) {
        return 0
      }
      const trackDuration = Math.max(
        1,
        Math.floor((track.dt || track.duration || 0) / 1000)
      )
      const minimumSeconds = Math.min(MIN_NETEASE_CHECKPOINT_SECONDS, trackDuration)
      const listenedSeconds = Math.max(0, neteaseSessionListenedSeconds)
      if (!force && listenedSeconds < minimumSeconds) return 0

      const delta = Math.max(0, listenedSeconds - neteaseSessionCommittedSeconds)
      const params = buildNeteaseScrobbleParams(track)
      if (delta <= 0 || !params) return 0

      const endedAt = Date.now()
      const sessionId = neteaseSessionId || createNeteaseSessionId()
      const slices = neteaseSessionSlices.length
        ? neteaseSessionSlices
        : [
            {
              startedAt: neteaseSessionCommittedAt || neteaseSessionStartedAt || endedAt,
              endedAt,
              seconds: delta
            }
          ]
      for (const slice of slices) {
        recordNeteaseListenSegment({
          accountId: neteaseSessionAccountId,
          sessionId,
          startedAt: slice.startedAt,
          endedAt: slice.endedAt,
          seconds: slice.seconds,
          params
        })
      }
      neteaseSessionCommittedSeconds = listenedSeconds
      neteaseSessionCommittedAt = endedAt
      neteaseSessionSlices = []
      setProvisionalNeteaseListen()
      return delta
    }

    const submitNeteaseListenEntries = async (
      entries: NeteaseListenEntry[]
    ): Promise<number> => {
      let submittedCount = 0
      for (const entry of entries) {
        try {
          const result = await scrobble({
            ...entry.params,
            segmentId: entry.id,
            playedAt: entry.startedAt,
            time: entry.seconds,
            allowShort: true,
            allowRepeat: true,
            requireDurationAware: true
          })
          const success =
            result?.durationAware === true &&
            !result?.skipped &&
            (result.code === undefined || Number(result.code) === 200)
          if (!success) {
            markNeteaseListenEntryFailed(
              entry.id,
              result?.msg || result?.message || '网易云未确认接收播放片段'
            )
            continue
          }

          markNeteaseListenEntryAccepted(entry.id)
          submittedCount += 1
          window.dispatchEvent(
            new CustomEvent('vutronmusic-netease-scrobble', {
              detail: {
                trackId: entry.params.id,
                time: entry.seconds,
                segmentId: entry.id
              }
            })
          )
        } catch (error) {
          markNeteaseListenEntryFailed(entry.id, error)
          console.warn('[Player] 网易云听歌片段提交失败：', error)
        }
        await delay(NETEASE_SCROBBLE_QUEUE_GAP_MS)
      }
      return submittedCount
    }

    const queueNeteaseListenSubmission = (options: {
      sessionId?: string
      excludeSessionId?: string
      force?: boolean
      accountId?: string
    }): Promise<number> => {
      const entries = claimPendingNeteaseListenEntries({
        accountId: options.accountId || currentNeteaseAccountId(),
        sessionId: options.sessionId,
        excludeSessionId: options.excludeSessionId,
        force: options.force
      })
      if (!entries.length) return Promise.resolve(0)

      const queued = neteaseScrobbleQueue.then(
        () => submitNeteaseListenEntries(entries),
        () => submitNeteaseListenEntries(entries)
      )
      neteaseScrobbleQueue = queued.then(
        () => undefined,
        () => undefined
      )
      return queued
    }

    const scrobbleNetease = async (
      track: Track,
      _time: number,
      completed = false,
      checkpoint = false
    ): Promise<boolean> => {
      if (track.type === 'stream' || (track.type === 'local' && !track.matched)) return false
      const committed = commitNeteaseSessionProgress(track, {
        force: completed || checkpoint
      })
      const submitted = await queueNeteaseListenSubmission({
        sessionId: neteaseSessionId,
        force: checkpoint,
        accountId: neteaseSessionAccountId
      })
      return committed > 0 || submitted > 0
    }

    const retryNeteaseScrobbleOutbox = async (): Promise<number> => {
      // 当前歌曲的 pending 条目是正在增长的草稿，应等到自然结束或切歌时再一次提交。
      // 定时器只重试以前歌曲遗留的失败条目，避免重新产生每分钟一个回执。
      return queueNeteaseListenSubmission({
        excludeSessionId: neteaseSessionId || undefined,
        force: false
      })
    }

    const syncCurrentNeteaseListenCheckpoint = async (): Promise<boolean> => {
      const submittedCurrent = currentTrack.value
        ? await scrobbleNetease(
            currentTrack.value,
            audioNodes.audio?.currentTime || seek.value,
            false,
            true
          )
        : false
      const retriedCount = await retryNeteaseScrobbleOutbox()
      return submittedCurrent || retriedCount > 0
    }

    const scrobbleFM = (track: Track, time: number, completed = false) => {
      if (!enableFM.value) return
      const trackDuration = ~~(track.dt / 1000)
      time = completed ? trackDuration : ~~time
      if (time >= trackDuration / 2 || time >= 240) {
        const timestamp = ~~(new Date().getTime() / 1000) - time
        const info = {
          artist: (track.artists || track.ar)[0]?.name || '未知歌手',
          track: track.name,
          timestamp,
          album: track.album?.name || (track.al?.name as string) || '未知专辑',
          tracnNumber: track.no || 1,
          duration: trackDuration
        }
        window.mainApi?.send('track-scrobble', info)
      }
    }

    const updateNowPlaying = () => {
      if (!enableFM.value) return
      const track = currentTrack.value!
      const info = {
        artist: (track.artists || track.ar)[0]?.name || '未知歌手',
        track: track!.name,
        album: track.album?.name || (track.al?.name as string) || '未知专辑',
        duration: ~~((track.dt || track.duration) / 1000)
      }
      window.mainApi?.send('update-now-playing', info)
    }

    const playAudioSource = async (
      source: string,
      autoPlay = true,
      revision = trackLoadRevision
    ) => {
      if (revision !== trackLoadRevision) return false

      // 切歌时先淡出。淡出期间如果又切歌，旧请求不得再覆盖媒体源。
      const fade = fadeDuration.value
      await smoothGain(0, fade)
      if (revision !== trackLoadRevision) return false

      audioNodes.audio!.removeAttribute('src')
      audioNodes.audio!.load()
      audioNodes.audio!.src = source
      audioNodes.audio!.load()

      if (autoPlay) {
        const isPlaying = await play()
        if (revision !== trackLoadRevision) return false
        playing.value = isPlaying
      }
      return true
    }

    const getLocalMusic = async (id: number): Promise<Track | undefined> => {
      let matchTrack = getALocalTrack({ id })
      if (matchTrack) {
        if (!isLocalList.value) {
          showToast(t('toast.usingLocalFile'))
        }
        matchTrack.source = 'localTrack'
        return matchTrack
      }

      matchTrack = getAStreamTrack(id)
      if (matchTrack) return matchTrack

      if (window.env?.isElectron) {
        let lastError: unknown = null
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await fetch(`atom://local-asset?type=track&id=${id}`)
            if (response.status === 200) {
              return (await response.json()) as Track
            }
            if (response.status === 404) return undefined

            const details = await response.text().catch(() => '')
            throw new Error(
              `歌曲信息请求失败 (${response.status})${details ? `: ${details}` : ''}`
            )
          } catch (error) {
            lastError = error
            if (attempt === 0) await delay(400)
          }
        }

        throw lastError instanceof Error ? lastError : new Error('歌曲信息请求失败')
      }

      const data = await getTrackDetail(id.toString())
      if (data?.code === 200 && data.songs?.length) return data.songs[0]
      return undefined
    }

    const getTrackSource = (track: Track) => {
      return new Promise<string>((resolve) => {
        if (track.type === 'online' && !track.url) {
          return resolve('')
        }

        if (track.type === 'local' || track.cache) {
          return resolve(
            `atom://local-asset?type=stream&path=${encodeURIComponent(track.cache ? track.url : track.filePath)}`
          )
        }

        const remoteUrl = String(track.url || '')
        if (!remoteUrl) return resolve('')

        // Renderer 直接加载网易云/UNM 的 HTTP(S) 地址会受目标站 CORS 约束，
        // 尤其 createMediaElementSource() 会把该失败表现为 DOMException。
        // 所有公网音频统一交给主进程 atom:// 代理，Range 请求和用户代理配置也由主进程处理。
        if (/^https?:\/\//i.test(remoteUrl)) {
          return resolve(`atom://get-online-music/${remoteUrl}`)
        }

        resolve(remoteUrl)
      })
    }

    const getPrevTrack = () => {
      const next = currentTrackIndex.value - 1

      if (repeatMode.value === 'on') {
        if (currentTrackIndex.value === 0) {
          return [list.value[list.value.length - 1], list.value.length - 1]
        }
        if (list.value.length === currentTrackIndex.value + 1) {
          return [list.value[0], 0]
        }
      }
      return [list.value[next], next]
    }

    const playPrev = async () => {
      const [trackID, index] = getPrevTrack()
      if (!trackID) {
        playing.value = false
        return false
      }

      const previousIndex = currentTrackIndex.value
      currentTrackIndex.value = index!
      const replaced = await replaceCurrentTrack(trackID, true)
      if (
        !replaced &&
        trackLookupFailureRevision === trackLoadRevision &&
        currentTrackIndex.value === index
      ) {
        currentTrackIndex.value = previousIndex
      }
      return replaced
    }

    const getNextTrack = (): [number | undefined, number, boolean] => {
      const next = currentTrackIndex.value + 1

      if (_playNextList.value.length > 0) {
        const trackID = _playNextList.value.shift()
        return [trackID!, next, true]
      }

      if (repeatMode.value === 'on') {
        if (list.value.length === currentTrackIndex.value + 1) {
          return [list.value[0], 0, false]
        }
      }
      return [list.value[next], next, false]
    }

    const _playNextTrack = async (isPersonal: boolean) => {
      await pause()
      if (isPersonal) {
        return playNextFMTrack()
      }
      return playNext()
    }

    const playNext = async () => {
      if (playingNext.value) {
        list.value.splice(currentTrackIndex.value, 0, currentTrack.value!.id)
      }
      const [trackID, index, isPlayingNext] = getNextTrack()
      const previousIndex = currentTrackIndex.value
      const previousPlayingNext = playingNext.value
      playingNext.value = isPlayingNext
      if (!trackID) {
        playing.value = false
        return false
      }
      currentTrackIndex.value = index
      const replaced = await replaceCurrentTrack(trackID, true)
      if (
        !replaced &&
        trackLookupFailureRevision === trackLoadRevision &&
        currentTrackIndex.value === index
      ) {
        currentTrackIndex.value = previousIndex
        playingNext.value = previousPlayingNext
      }
      return replaced
    }

    const nextTrackCallback = () => {
      markPlaybackEndReason('natural-end')
      const endedTrack = currentTrack.value
      if (endedTrack) {
        scrobbleFM(endedTrack, 0, true)
        void scrobbleNetease(endedTrack, currentTrackDuration.value, true)
      }
      seek.value = 0
      clearTimeout(timer)

      if (consumeSleepTimerAtTrackEnd(currentTrack.value?.id)) {
        playing.value = false
        void pause()
        return
      }

      if (!isPersonalFM.value && repeatMode.value === 'one') {
        replaceCurrentTrack(currentTrack.value!.id)
      } else {
        _playNextTrack(isPersonalFM.value)
      }
    }

    const playDiscordPresence = (track: Track, seekTime = 0) => {
      if (!enableDRP.value) return
      const copyTrack = { ...track }
      copyTrack.dt -= seekTime * 1000
      window.mainApi?.send('playDiscordPresence', cloneDeep(copyTrack))
    }

    const pauseDiscordPresence = (track: Track) => {
      if (!enableDRP.value) return
      window.mainApi?.send('pauseDiscordPresence', cloneDeep(track))
    }

    const handlePlaybackSourceFailure = (error: unknown) => {
      const track = currentTrack.value
      if (!track) return

      const trackId = String(track.id)
      if (playbackSourceRetryTrackId !== trackId) {
        playbackSourceRetryTrackId = trackId
        playbackSourceRetryCount = 0
      }

      console.warn('[Player] 音频播放失败', {
        trackId: track.id,
        source: track.source,
        retryCount: playbackSourceRetryCount,
        error
      })

      if (playbackSourceRetryCount < MAX_PLAYBACK_SOURCE_RETRIES) {
        playbackSourceRetryCount += 1
        showToast(t('toast.audioSourceRetrying', { name: track.name }))
        void replaceCurrentTrack(track.id, true)
        return
      }

      // 已经刷新过一次仍失败：停止对同一首递归刷新，直接进入下一首。
      playbackSourceRetryCount = 0
      showToast(t('toast.audioPlaybackFailedNext', { name: track.name }))
      markPlaybackEndReason('playback-error')
      void _playNextTrack(isPersonalFM.value)
    }

    const play = async (): Promise<boolean> => {
      if (!audioNodes.audio) return false

      try {
        if (!isValidUrl(currentTrack.value?.url || '')) {
          handlePlaybackSourceFailure(new Error('当前音频 URL 已过期或有效期不足'))
          return false
        }

        const arts = currentTrack.value?.artists ?? currentTrack.value?.ar
        audioNodes.audio.playbackRate = playbackRate.value

        if (audioNodes.audioContext?.state === 'suspended') {
          await audioNodes.audioContext?.resume()
        }

        // 先让媒体元素以静音增益启动，再对正在播放的音频执行淡入。
        // 旧实现先等待淡入完成再调用 play()，因此淡入发生在无声阶段，听起来等同于失效。
        const fade = fadeDuration.value
        await smoothGain(0, 0)
        await audioNodes.audio.play()
        void smoothGain(volume.value, fade)

        title.value = `${currentTrack.value?.name} · ${arts[0].name} - VutronMusic`
        if (!window.env?.isMac) {
          window.mainApi?.send('updateTooltip', title.value)
        }
        document.title = title.value

        playDiscordPresence(currentTrack.value!, audioNodes.audio.currentTime)
        updateNowPlaying()

        playbackSourceRetryTrackId = String(currentTrack.value?.id ?? '')
        playbackSourceRetryCount = 0
        return !audioNodes.audio.paused
      } catch (error) {
        if (currentTrack.value?.cache) {
          const cachedTrack = currentTrack.value
          const isOk = (await window.mainApi?.invoke(
            'deleteACacheTrack',
            cachedTrack.id
          )) as boolean

          if (isOk) {
            showToast(t('toast.audioSourceRetrying', { name: cachedTrack.name }))
            void replaceCurrentTrack(cachedTrack.id, true)
          } else {
            showToast(t('toast.audioPlaybackFailedNext', { name: cachedTrack.name }))
            markPlaybackEndReason('playback-error')
            void _playNextTrack(isPersonalFM.value)
          }
        } else {
          handlePlaybackSourceFailure(error)
        }
        return false
      }
    }

    const pause = async () => {
      if (!audioNodes.audio) return
      const fade = fadeDuration.value
      await smoothGain(0, fade)
      audioNodes.audio?.pause()
      title.value = 'VutronMusic'
      if (!window.env?.isMac) {
        window.mainApi?.send('updateTooltip', title.value)
      }
      document.title = title.value
      pauseDiscordPresence(currentTrack.value!)
    }

    const playOrPause = async () => {
      if (playing.value) {
        playing.value = false
        await pause()
        audioNodes.audioContext?.suspend()
      } else {
        playing.value = await play()
      }
    }

    registerSleepTimerPauseHandler(async () => {
      if (!playing.value) return
      playing.value = false
      await pause()
      await audioNodes.audioContext?.suspend()
    })

    const setDevice = (device: string) => {
      if ('setSinkId' in AudioContext.prototype) {
        // @ts-ignore
        audioNodes.audioContext?.setSinkId(device)
      }
    }

    const switchRepeatMode = () => {
      if (repeatMode.value === 'on') {
        repeatMode.value = 'one'
      } else if (repeatMode.value === 'one') {
        repeatMode.value = 'off'
      } else {
        repeatMode.value = 'on'
      }
    }

    const shuffleTheList = (firstTrackID = 0) => {
      const id = _list.value[firstTrackID]
      const list = _list.value.filter((trackID) => trackID !== id)
      // if (firstTrackID === 0) list = _list.value
      _shuffleList.value = shuffleFn(list)
      _shuffleList.value.unshift(id)
    }

    const addTrackToPlayNext = (trackID: number | number[], playNow = false, addToHead = false) => {
      if (typeof trackID === 'object') {
        _playNextList.value = [..._playNextList.value, ...trackID]
      } else {
        addToHead ? _playNextList.value.unshift(trackID) : _playNextList.value.push(trackID)
      }
      if (playNow) playNext()
    }

    /**
     * 向当前播放列表尾部追加歌曲，不替换当前歌曲、不中断播放。
     *
     * Heart Mode rolling queue 使用该动作补充后续歌曲；重复 ID 会被忽略。
     */
    const appendTracksToPlaylist = (trackIDs: number[]): number[] => {
      const existing = new Set(_list.value)
      const appended = Array.from(
        new Set(
          trackIDs
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0 && !existing.has(id))
        )
      )

      if (!appended.length) return []
      _list.value.push(...appended)

      // Heart Mode 会强制 shuffle=false；这里仍保持通用行为，避免其他调用方
      // 在 shuffle 模式下追加后看不到新歌曲。
      if (_shuffle.value) {
        _shuffleList.value.push(...appended)
      }

      return appended
    }

    const shouldTrackNeteaseListenTime = (track: Track | null): boolean => {
      if (!track) return false
      if (track.type === 'stream') return false
      if (track.type === 'local' && !track.matched) return false
      if (currentNeteaseAccountId() === 'anonymous') return false
      return true
    }

    const _handleTimeUpdate = () => {
      if (!audioNodes.audio) return

      const currentTime = audioNodes.audio.currentTime
      const delta = currentTime - lastUpdateTime
      if (Math.abs(delta) >= 1) {
        /*
         * session 内持续累计真实播放；达到有效播放门槛后才把整段加入待同步，避免
         * 不会上报的短试听污染全局账本。seek setter 会同步 lastUpdateTime，因此手动
         * 拖动进度条不会被算成收听时长；异常的大跳变也会被上限保护过滤。
         */
        const maxExpectedDelta = Math.max(5, 5 * Number(playbackRate.value || 1))
        if (
          playing.value &&
          delta > 0 &&
          delta <= maxExpectedDelta &&
          shouldTrackNeteaseListenTime(currentTrack.value)
        ) {
          const now = Date.now()
          if (!neteaseSessionStartedAt) {
            neteaseSessionStartedAt = now - Math.max(1, delta) * 1000
          }
          const sliceStartedAt = now - delta * 1000
          const previousSlice = neteaseSessionSlices.at(-1)
          if (previousSlice && sliceStartedAt - previousSlice.endedAt <= 2000) {
            previousSlice.endedAt = now
            previousSlice.seconds += delta
          } else {
            neteaseSessionSlices.push({ startedAt: sliceStartedAt, endedAt: now, seconds: delta })
          }
          neteaseSessionListenedSeconds += delta

          const trackDuration = Math.max(
            1,
            Math.floor((currentTrack.value?.dt || currentTrack.value?.duration || 0) / 1000)
          )
          const minimumSeconds = Math.min(MIN_NETEASE_CHECKPOINT_SECONDS, trackDuration)
          if (neteaseSessionListenedSeconds >= minimumSeconds) {
            commitNeteaseSessionProgress(currentTrack.value!)
          } else {
            setProvisionalNeteaseListen({
              accountId: neteaseSessionAccountId,
              startedAt: neteaseSessionStartedAt,
              endedAt: now,
              seconds: neteaseSessionListenedSeconds - neteaseSessionCommittedSeconds,
              segments: neteaseSessionSlices
            })
          }
        }

        _progress.value = currentTime
        lastUpdateTime = currentTime
      }

      if (window.env?.isLinux) {
        window.mainApi?.send('updatePlayerState', { progress: currentTime })
      }
    }

    const destroAudioNode = async () => {
      if (audioNodes.audio) {
        audioNodes.audio.removeEventListener('timeupdate', _handleTimeUpdate)
        audioNodes.audio.removeEventListener('ended', nextTrackCallback)
        audioNodes.audio.pause()

        audioNodes.audioSource?.disconnect()
        audioNodes.biquads.forEach((filter) => {
          filter.disconnect()
        })
        audioNodes.soundtouch?.disconnect()
        audioNodes.dynamics?.disconnect()
        audioNodes.convolver?.disconnect()
        audioNodes.convolverOutputGain?.disconnect()
        audioNodes.convolverSourceGain?.disconnect()
        audioNodes.masterGain?.disconnect()

        audioNodes.audio = null
        audioNodes.audioSource = null
        audioNodes.soundtouch = null
        audioNodes.biquads.clear()
        audioNodes.dynamics = null
        if (audioNodes.convolver) audioNodes.convolver.buffer = null
        audioNodes.convolver = null
        audioNodes.convolverOutputGain = null
        audioNodes.convolverSourceGain = null
        audioNodes.masterGain = null
        await audioNodes.audioContext?.close()
        audioNodes.audioContext = null
      }
    }

    const connectToBiquad = (sourceNode: AudioNode) => {
      const first = biquadParamsKeys[0]
      sourceNode.connect(audioNodes.biquads.get(`hz${first}`)!)
      const last = biquadParamsKeys[biquadParamsKeys.length - 1]
      return audioNodes.biquads.get(`hz${last}`)!
    }

    const connectToConvolver = (sourceNode: AudioNode) => {
      sourceNode.connect(audioNodes.convolverSourceGain!)
      sourceNode.connect(audioNodes.convolver!)
      // audioNodes.dynamics!.connect(audioNodes.masterGain!)
      return audioNodes.dynamics!
    }

    const connectToSoundtouch = (sourceNode: AudioNode) => {
      sourceNode.connect(audioNodes.soundtouch!)
      return audioNodes.soundtouch!
    }

    const setupAudioNode = async () => {
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.preload = 'metadata'
      audio.preservesPitch = true
      audio.volume = 1
      audio.onended = null
      audioNodes.audio = audio
      seek.value = progress.value
      playbackRate.value = backRate.value

      audioNodes.audio.addEventListener('timeupdate', _handleTimeUpdate)
      audioNodes.audio.addEventListener('ended', nextTrackCallback)

      audioNodes.audioContext = new AudioContext()
      audioNodes.audioSource = audioNodes.audioContext.createMediaElementSource(audioNodes.audio)
      await audioNodes.audioContext.suspend()

      setConvolver({
        name: '',
        source: convolverParams.fileName,
        mainGain: convolverParams.mainGain,
        sendGain: convolverParams.sendGain
      })

      for (const [key, value] of Object.entries(biquadParams)) {
        const filter = audioNodes.audioContext.createBiquadFilter()
        audioNodes.biquads.set(`hz${key}`, filter)
        filter.type = 'peaking'
        filter.frequency.value = Number(key)
        filter.Q.value = 1.4
        filter.gain.value = value
      }
      for (let i = 1; i < biquadParamsKeys.length; i++) {
        const prev = biquadParamsKeys[i - 1]
        const curr = biquadParamsKeys[i]
        audioNodes.biquads.get(`hz${prev}`)!.connect(audioNodes.biquads.get(`hz${curr}`)!)
      }

      audioNodes.dynamics = audioNodes.audioContext.createDynamicsCompressor()
      audioNodes.convolver = audioNodes.audioContext.createConvolver()
      audioNodes.convolverOutputGain = audioNodes.audioContext.createGain()
      audioNodes.convolverSourceGain = audioNodes.audioContext.createGain()
      audioNodes.masterGain = audioNodes.audioContext.createGain()
      audioNodes.masterGain.gain.value = 0

      audioNodes.convolver.connect(audioNodes.convolverOutputGain)
      audioNodes.convolverSourceGain.connect(audioNodes.dynamics)
      audioNodes.convolverOutputGain.connect(audioNodes.dynamics)
      audioNodes.convolver.buffer =
        convolverParams.buffer instanceof ArrayBuffer ? convolverParams.buffer : null
      audioNodes.convolverSourceGain.gain.value = convolverParams.mainGain
      audioNodes.convolverOutputGain.gain.value = convolverParams.sendGain

      audioNodes.masterGain.gain.setValueAtTime(0, audioNodes.audioContext.currentTime)

      await audioNodes.audioContext.audioWorklet.addModule(
        new URL('../utils/soundtouch-worklet.js', import.meta.url)
      )
      const soundtouch = new AudioWorkletNode(audioNodes.audioContext, 'soundtouch-processor')
      audioNodes.soundtouch = soundtouch
      // @ts-ignore
      audioNodes.soundtouch.parameters.get('pitch').value = pitch.value

      let start = audioNodes.audioSource
      const lst: Function[] = []
      if (usePitch.value) lst.push(connectToSoundtouch)
      if (useBiquad.value) lst.push(connectToBiquad)
      if (useConvolver.value) lst.push(connectToConvolver)

      for (const func of lst) {
        start = func(start)
      }
      start.connect(audioNodes.masterGain)
      audioNodes.masterGain.connect(audioNodes.audioContext!.destination)

      setDevice(outputDevice.value)
    }

    const getPic = async (track: Track, size: number = 128) => {
      if (track.type === 'local') {
        return await getLocalPic(track.id, size)
      } else if (track.type === 'stream') {
        return getStreamPic(track, size)!
      } else {
        let url = (track.album || track.al).picUrl
        url = url.replace('http://', 'https://')
        return url + `?param=${size}y${size}`
      }
    }

    const updateMediaSessionMetaData = async (
      track: Track,
      revision = trackLoadRevision
    ) => {
      if ('mediaSession' in navigator === false || !isTrackLoadCurrent(revision, track)) return

      const cover512 = await getPic(track, 512)
      if (!isTrackLoadCurrent(revision, track)) {
        if (cover512?.startsWith('blob:')) URL.revokeObjectURL(cover512)
        return
      }

      const cover1024 = await getPic(track, 1024)
      if (!isTrackLoadCurrent(revision, track)) {
        if (cover512?.startsWith('blob:')) URL.revokeObjectURL(cover512)
        if (cover1024?.startsWith('blob:')) URL.revokeObjectURL(cover1024)
        return
      }

      let artwork = [
        {
          src: cover512,
          type: 'image/jpg',
          sizes: '512x512'
        },
        {
          src: cover1024,
          type: 'image/jpg',
          sizes: '1024x1024'
        }
      ]

      if (window.env?.isWindows) {
        const cover2048 = await getPic(track, 2048)
        if (!isTrackLoadCurrent(revision, track)) {
          if (cover512?.startsWith('blob:')) URL.revokeObjectURL(cover512)
          if (cover1024?.startsWith('blob:')) URL.revokeObjectURL(cover1024)
          if (cover2048?.startsWith('blob:')) URL.revokeObjectURL(cover2048)
          return
        }
        artwork = [
          {
            src: cover2048,
            type: 'image/jpg',
            sizes: '2048x2048'
          }
        ]
      }

      if (pic.value?.startsWith('blob:') && pic.value !== cover512) {
        URL.revokeObjectURL(pic.value)
      }
      pic.value = cover512

      const arts = track.artists ?? track.ar
      const artists = arts.map((a) => a.name)
      const metadata = {
        title: track.name,
        artist: artists.join(','),
        album: track.album?.name ?? track.al?.name,
        artwork,
        length: ~~((track.dt || track.duration || 1000) / 1000),
        trackId: track.id,
        url: '/trackid/' + track.id,
        progress: audioNodes.audio?.currentTime ?? 0,
        rate: playbackRate.value,
        asText: lyrics.value.map((lrc) => `${formatTime(lrc.start)}${lrc.lyric.text}`).join('\n'),
        lyricOffset: lyricOffset.value
      }

      if (!isTrackLoadCurrent(revision, track)) return

      navigator.mediaSession.metadata = null
      navigator.mediaSession.metadata = new MediaMetadata(metadata)
      if (window.env?.isLinux) {
        if (track.type === 'stream') {
          metadata.artwork.map((art) => {
            const url = `http://localhost:${window.env?.isDev ? 40001 : 41830}` + art.src
            art.src = url
          })
        } else if (track.type === 'local') {
          metadata.artwork.map((art) => {
            const url = `http://localhost:${window.env?.isDev ? 40001 : 41830}/local-asset?id=${track.id}&size=${art.sizes.split('x')[0]}`
            art.src = url
          })
        }
        window.mainApi?.send('metadata', metadata)
      }
    }

    const resetPlayer = (resetBiq = true) => {
      trackLoadRevision += 1
      list.value = []
      enabled.value = false
      currentTrackIndex.value = 0
      currentTrack.value = null
      neteaseSessionListenedSeconds = 0
      neteaseSessionCommittedSeconds = 0
      neteaseSessionStartedAt = 0
      neteaseSessionCommittedAt = 0
      neteaseSessionId = ''
      neteaseSessionAccountId = 'anonymous'
      neteaseSessionSlices = []
      setProvisionalNeteaseListen()
      progress.value = 0
      _shuffleList.value = []
      _list.value = []
      isPersonalFM.value = false
      lyrics.value = []
      chorusStartTime.value = 0
      chorus.value = 0
      if (pic.value.startsWith('blob:')) {
        URL.revokeObjectURL(pic.value)
        pic.value = new URL(`../assets/images/default.jpg`, import.meta.url).href
      }

      if (resetBiq) {
        volume.value = 1
        _shuffle.value = false
        repeatMode.value = 'off'
        for (const key in biquadParams) {
          biquadParams[key] = 0
        }
      }
    }

    const buildOsdFallbackTrackInfo = () => {
      const track = currentTrack.value
      const artists = track?.artists ?? track?.ar ?? []
      const artistText = artists
        .map((artist: { name?: string }) => artist?.name)
        .filter(Boolean)
        .join(' / ')
      const titleText = track?.name || '听你想听的音乐'

      return {
        isFallbackTrackInfo: !lyrics.value.length,
        fallbackTrackText: artistText ? `${artistText} - ${titleText}` : titleText
      }
    }

    const handleIpcRenderer = () => {
      window.addEventListener('message', (event) => {
        if (event.data.type === 'init-from-osd') {
          const track = currentTrack.value
          const artists = track?.artists ?? track?.ar ?? []
          const currentTime = audioNodes.audio?.currentTime || 0
          const osdLyrics = _.cloneDeep(lyrics.value)
          const fallbackTrackInfo = buildOsdFallbackTrackInfo()

          if (!osdLyrics.length) {
            osdLyrics[0] = {
              start: 0,
              end: 0,
              lyric: {
                text: fallbackTrackInfo.fallbackTrackText
              }
            }
          }

          window.mainApi?.sendMessage({
            type: 'update-osd-status',
            data: {
              lyrics: toRaw(osdLyrics),
              isFallbackTrackInfo: fallbackTrackInfo.isFallbackTrackInfo,
              fallbackTrackText: fallbackTrackInfo.fallbackTrackText,
              line: [currentIndex.value, currentTime],
              playing: playing.value,
              seek: currentTime,
              rate: playbackRate.value,
              lyricOffset: [lyricOffset.value, currentTime],
              title: track
                ? `${artists[0]?.name || '未知歌手'} - ${track.name}`
                : '听你想听的音乐',
              isLiked: isLiked.value,
              pic: pic.value
            }
          })
        } else if (event.data.type === 'get-seek') {
          window.mainApi?.sendMessage({
            type: 'update-osd-status',
            data: {
              seek: audioNodes.audio?.currentTime || 0,
              syncGuard: event.data.source === 'osd-sync-guard'
            }
          })
        }
      })

      watch(
        () => [currentIndex.value, progress.value],
        (value) => {
          if (osdLyricStore.show)
            window.mainApi?.sendMessage({
              type: 'update-osd-status',
              data: { line: [value[0], audioNodes.audio?.currentTime || 0] }
            })
        }
      )

      watch(backRate, (value) => {
        if (osdLyricStore.show)
          window.mainApi?.sendMessage({
            type: 'update-osd-status',
            data: { rate: value }
          })
      })

      watch(lyrics, (value) => {
        if (osdLyricStore.show) {
          const newLyric = _.cloneDeep(value)
          const fallbackTrackInfo = buildOsdFallbackTrackInfo()

          if (!newLyric.length) {
            newLyric[0] = {
              start: 0,
              end: 0,
              lyric: {
                text: fallbackTrackInfo.fallbackTrackText
              }
            }
          }

          const currentTime = audioNodes.audio?.currentTime || 0
          window.mainApi?.sendMessage({
            type: 'update-osd-status',
            data: {
              lyrics: toRaw(newLyric),
              isFallbackTrackInfo: fallbackTrackInfo.isFallbackTrackInfo,
              fallbackTrackText: fallbackTrackInfo.fallbackTrackText,
              // 歌词与当前行/seek 必须原子同步。否则换歌时 OSD sync guard 可能拿
              // 上一首歌的时间锚点去计算新歌词，短暂把新歌词误判为“已播放”。
              line: [currentIndex.value, currentTime],
              seek: currentTime
            }
          })
        }
      })

      watch(
        () => osdLyricStore.show,
        (value) => {
          if (!value) window.mainApi?.closeMessagePort()
        }
      )

      window.mainApi?.on('resume', async () => {
        if (!currentTrack.value) return
        const trackId = currentTrack.value.id
        const savedProgress = _progress.value

        // replaceCurrentTrack(..., false) 会重新解析音源，并通过 getTrackSource()
        // 恢复 atom:// 主进程代理。不要再把原始 HTTP(S) URL 写回 <audio>.src。
        const replaced = await replaceCurrentTrack(trackId, false)
        if (replaced && currentTrack.value?.id === trackId) {
          seek.value = savedProgress
        }
      })

      window.mainApi?.on('play-from-osd', () => {
        playOrPause()
      })

      window.mainApi?.on('play', () => {
        if (
          document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.classList?.contains('comment-input')
        ) {
          return
        }
        playOrPause()
      })
      window.mainApi?.on('previous', () => {
        if (!isPersonalFM.value) playPrev()
        else moveToFMTrash()
      })
      window.mainApi?.on('next', () => _playNextTrack(isPersonalFM.value))
      window.mainApi?.on('repeat', (_: any, value: string) => {
        repeatMode.value = value
      })
      window.mainApi?.on('repeat-shuffle', (_: any, value: boolean) => {
        shuffle.value = value
      })
      window.mainApi?.on('like', () => {
        if (!currentTrack.value) return
        if (currentTrack.value?.type === 'stream') {
          const op = currentTrack.value.starred ? 'unstar' : 'star'
          likeAStreamTrack(op, currentTrack.value)
        } else if (currentTrack.value?.matched) {
          likeATrack(currentTrack.value.id)
        }
      })
      window.mainApi?.on('fm-trash', () => {
        moveToFMTrash()
      })
      window.mainApi?.on('setPosition', (_: any, value: number) => {
        seek.value = value
      })
      window.mainApi?.on('increaseVolume', () => {
        if (volume.value + 0.1 >= 1) return (volume.value = 1)
        volume.value += 0.1
      })
      window.mainApi?.on('decreaseVolume', () => {
        if (volume.value - 0.1 <= 0) return (volume.value = 0)
        volume.value -= 0.1
      })
    }

    const initMediaSession = () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
          play()
          playing.value = true
        })
        navigator.mediaSession.setActionHandler('pause', () => {
          pause()
          playing.value = false
        })
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          if (!isPersonalFM.value) playPrev()
          else moveToFMTrash()
        })
        navigator.mediaSession.setActionHandler('nexttrack', () =>
          _playNextTrack(isPersonalFM.value)
        )
        navigator.mediaSession.setActionHandler('stop', () => {
          pause()
          playing.value = false
        })
        navigator.mediaSession.setActionHandler('seekto', (event) => {
          seek.value = event.seekTime!
        })
        navigator.mediaSession.setActionHandler('seekbackward', (event) => {
          seek.value -= event.seekOffset || 10
        })
        navigator.mediaSession.setActionHandler('seekforward', (event) => {
          seek.value += event.seekOffset || 10
        })
        navigator.mediaSession.setPositionState({
          duration: currentTrackDuration.value,
          playbackRate: playbackRate.value,
          position: seek.value > currentTrackDuration.value ? 0 : seek.value
        })
      }
    }

    const loadPersonalFMNextTrack = () => {
      if (_personalFMLoading.value) {
        return [false, { id: 0 }]
      }
      _personalFMLoading.value = true
      return personalFM()
        .then((result: any) => {
          if (!Array.isArray(result?.data) || !result.data.length) {
            _personalFMNextTrack.value = { id: 0 }
            _personalFMLoading.value = false
            return [false, _personalFMNextTrack.value]
          } else {
            _personalFMNextTrack.value = result.data[0]
            // 缓存下一首歌，待处理
          }
          _personalFMLoading.value = false
          return [true, _personalFMNextTrack.value]
        })
        .catch(() => {
          _personalFMNextTrack.value = { id: 0 }
          _personalFMLoading.value = false
          return [false, _personalFMNextTrack.value]
        })
    }

    const playNextFMTrack = async () => {
      if (_personalFMLoading.value) return false

      isPersonalFM.value = true
      if (!_personalFMNextTrack.value?.id) {
        _personalFMLoading.value = true
        let result: any = null
        let retryCount = 5
        for (; retryCount >= 0; retryCount--) {
          result = await personalFM().catch(() => null)
          if (!result) {
            _personalFMLoading.value = false
            showToast(t('player.getFMTimeout'))
            return false
          }
          if (result.data?.length > 0) {
            break
          } else if (retryCount > 0) {
            await delay(1000)
          }
        }
        _personalFMLoading.value = false
        if (retryCount < 0) {
          showToast(t('player.getFMOverCount'))
          return false
        }
        _personalFMTrack.value = result.data[0]
      } else {
        if (
          _personalFMNextTrack.value &&
          _personalFMNextTrack.value.id === _personalFMTrack.value.id
        ) {
          return false
        }
        _personalFMTrack.value = _personalFMNextTrack.value
      }
      if (isPersonalFM.value && _personalFMTrack.value) {
        replaceCurrentTrack(_personalFMTrack.value.id)
      }
      loadPersonalFMNextTrack()
      return true
    }

    const personalFMTrack = computed(() => _personalFMTrack.value)
    const personalFMNextTrack = computed(() => _personalFMNextTrack.value)

    const playPersonalFM = () => {
      isPersonalFM.value = true
      if (!enabled.value) enabled.value = true
      if (currentTrack.value?.id !== _personalFMTrack.value.id) {
        playlistSource.value.type = 'personalFM'
        playlistSource.value.id = _personalFMTrack.value.id
        replaceCurrentTrack(_personalFMTrack.value.id, true)
      } else {
        playOrPause()
      }
    }

    const moveToFMTrash = async () => {
      isPersonalFM.value = true
      const id = _personalFMTrack.value.id
      if (await playNextFMTrack()) {
        fmTrash(id)
      }
    }

    const clearPlayNextList = () => {
      _playNextList.value = []
    }

    const smoothGain = async (to: number, duration: number) => {
      if (!audioNodes.audioContext || !audioNodes.masterGain) return
      const now = audioNodes.audioContext.currentTime
      audioNodes.masterGain?.gain.cancelAndHoldAtTime(now)

      if (audioNodes.audioContext.state === 'running') {
        audioNodes.masterGain?.gain.linearRampToValueAtTime(to, now + duration)
        await delay(duration * 1000)
      } else {
        audioNodes.masterGain?.gain.setValueAtTime(to, now)
      }
    }

    const formatTime = (seconds: number) => {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      const formattedMinutes = minutes.toString().padStart(2, '0')
      const formattedSeconds = remainingSeconds.toFixed(3).padStart(6, '0')
      return `[${formattedMinutes}:${formattedSeconds}]`
    }

    if (typeof window !== 'undefined') {
      window.vutronmusic = {
        get progress() {
          return audioNodes.audio?.currentTime || 0
        },
        get playing() {
          return playing.value
        },
        get volume() {
          return volume.value
        },
        get currentTrack() {
          return toRaw(currentTrack.value || {})
        },
        get isLiked() {
          return isLiked.value
        },
        get repeatMode() {
          return repeatMode.value
        },
        get lyric() {
          const hasTLyric = lyrics.value.some((lrc) => lrc.tlyric && lrc.tlyric.text.trim() !== '')
          const hasRLyric = lyrics.value.some((lrc) => lrc.rlyric && lrc.rlyric.text.trim() !== '')

          const result = {
            lrc: lyrics.value.map((lrc) => `${formatTime(lrc.start)}${lrc.lyric.text}`).join('\n'),
            tlyric: hasTLyric
              ? lyrics.value
                  .filter((lrc) => lrc.tlyric)
                  .map((lrc) => `${formatTime(lrc.start)}${lrc.tlyric?.text}`)
                  .join('\n')
              : '',
            romalrc: hasRLyric
              ? lyrics.value
                  .filter((lrc) => lrc.rlyric)
                  .map((lrc) => `${formatTime(lrc.start)}${lrc.rlyric?.text}`)
                  .join('\n')
              : ''
          }
          return result
        }
      }
    }

    const retryPendingNeteaseListen = (): void => {
      const accountId = currentNeteaseAccountId()
      setActiveNeteaseListenAccount(accountId)
      if (accountId !== 'anonymous' && hasPendingNeteaseListenEntries(accountId)) {
        void retryNeteaseScrobbleOutbox()
      }
    }

    watch(
      () => dataStore.user?.userId,
      (userId, previousUserId) => {
        const nextAccountId = String(userId || 'anonymous')
        const previousAccountId = String(previousUserId || 'anonymous')
        if (nextAccountId !== previousAccountId) {
          // Cookie 已经随账号切换，不能再把旧会话提交到新账号。已落账片段保留在旧账号
          // 的独立队列中；当前歌曲从切换时刻开始建立一个全新的账号会话。
          neteaseSessionListenedSeconds = 0
          neteaseSessionCommittedSeconds = 0
          neteaseSessionStartedAt = 0
          neteaseSessionCommittedAt = 0
          neteaseSessionId = createNeteaseSessionId()
          neteaseSessionAccountId = nextAccountId
          neteaseSessionSlices = []
          setProvisionalNeteaseListen()
          flushNeteaseListenLedger(true)
        }
        retryPendingNeteaseListen()
      },
      { flush: 'post' }
    )

    onMounted(async () => {
      await Promise.all([fetchLocalMusic(), fetchStreamMusic()])
      await nextTick()
      await setupAudioNode()
      playing.value = false
      title.value = 'VutronMusic'
      handleIpcRenderer()
      initMediaSession()
      retryPendingNeteaseListen()
      window.addEventListener('online', retryPendingNeteaseListen)
      neteaseRetryTimer = window.setInterval(
        retryPendingNeteaseListen,
        NETEASE_RETRY_POLL_MS
      )
      if (enabled.value) {
        if (currentTrack.value?.type === 'stream') {
          if (
            !streamMusicStore.loginedServices.length ||
            !streamMusicStore.loginedServices
              .map((s) => s.name)
              .includes(currentTrack.value.source as serviceName)
          ) {
            resetPlayer(false)
            return
          }
        }
        replaceCurrentTrack(currentTrack.value!.id, false).then(() => {
          playDiscordPresence(currentTrack.value!, audioNodes.audio!.currentTime)
          setTimeout(() => {
            window.mainApi?.send('updatePlayerState', {
              playing: playing.value,
              progress: audioNodes.audio?.currentTime || 0,
              isPersonalFM: isPersonalFM.value,
              like: isLiked.value,
              repeatMode: repeatMode.value,
              shuffle: shuffle.value
            })
          })
        })
      }
      if (
        _personalFMTrack.value.id === 0 ||
        _personalFMNextTrack.value.id === 0 ||
        _personalFMTrack.value.id === _personalFMNextTrack.value.id
      ) {
        personalFM()
          .then((result: any) => {
            const tracks = Array.isArray(result?.data) ? result.data : []
            if (!tracks.length) return
            _personalFMTrack.value = tracks[0] ?? { id: 0 }
            _personalFMNextTrack.value = tracks[1] ?? { id: 0 }
          })
          .catch((error) => {
            console.warn('[Player] 初始化私人 FM 失败：', error)
          })
      }
    })

    onBeforeUnmount(() => {
      if (currentTrack.value) {
        void scrobbleNetease(
          currentTrack.value,
          audioNodes.audio?.currentTime || seek.value
        )
      }
      // scrobbleNetease 会在首个 await 前把有效 session 写入账本；必须随后强制落盘。
      flushNeteaseListenLedger(true)
      window.removeEventListener('online', retryPendingNeteaseListen)
      if (neteaseRetryTimer !== null) {
        window.clearInterval(neteaseRetryTimer)
        neteaseRetryTimer = null
      }
      trackLoadRevision += 1
      registerSleepTimerPauseHandler(null)
      progress.value = audioNodes.audio?.currentTime || 0
      if (pic.value.startsWith('blob:')) URL.revokeObjectURL(pic.value)
      destroAudioNode()
    })

    return {
      playing,
      enabled,
      progress,
      seek,
      pic,
      chorus,
      backRate,
      playbackRate,
      pitch,
      repeatMode,
      title,
      shuffle,
      lyricOffset,
      globalLyricOffset,
      volume,
      volumeBeforeMuted,
      _list,
      _shuffleList,
      _shuffle,
      _playNextList,
      list,
      currentTrack,
      isPersonalFM,
      source,
      currentTrackIndex,
      currentIndex,
      currentLyric,
      currentTrackDuration,
      outputDevice,
      biquadParams,
      biquadUser,
      convolverParams,
      isLiked,
      isLocalList,
      lyrics,
      noLyric,
      personalFMTrack,
      personalFMNextTrack,
      playlistSource,
      fadeDuration,
      syncCurrentNeteaseListenCheckpoint,
      setConvolver,
      setGlobalLyricOffset,
      replacePlaylist,
      playPrev,
      _playNextTrack,
      clearPlayNextList,
      updateLocalID2OnlineID,
      playOrPause,
      resetPlayer,
      setDevice,
      switchRepeatMode,
      addTrackToPlayNext,
      appendTracksToPlaylist,
      playPersonalFM,
      playNextFMTrack,
      moveToFMTrash
    }
  },
  {
    persist: {
      omit: ['pic', 'title', 'outputDevice', 'globalLyricOffset']
    }
  }
)
