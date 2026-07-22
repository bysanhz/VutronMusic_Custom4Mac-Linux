import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
// import vuetify from './plugins/vuetify'
import i18n from './plugins/i18n'
import 'virtual:svg-icons-register'
import './assets/css/global.scss'
// ======== newADD start======
// 所有页面元素先由 Electron 使用同一 zoomFactor 整体缩放；fluid-window 负责通用
// 容器换行，settings-fluid-layout 直接适配 SystemSettings.vue 原生结构，
// resize-performance 在拖动期间暂停高成本视觉效果。
import './assets/css/fluid-window.scss'
import './assets/css/settings-fluid-layout.scss'
import './assets/css/resize-performance.scss'
// =========== newADD end ========
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import DOMPurify from 'dompurify'
import { dailyTask } from './utils'
import vue3lottie from 'vue3-lottie'
// ======== newADD start======
// 使用 Electron 页面级连续缩放代替多个 CSS 临界点切换。
// responsive-window.scss 与 responsive-window-fixes.scss 保留在仓库中用于历史对照，
// 但不再加载，避免 700/520/460/390px 等断点造成布局模型突然变化。
import { initializeSmoothWindowScale } from './utils/smoothWindowScale'
import { initializeOsdWindowScaleSettings } from './utils/osdWindowScaleSettings'
import { usePlayerStore } from './store/player'
import { useDataStore } from './store/data'
import { useNormalStateStore } from './store/state'
import { getPlaylistDetail, intelligencePlaylist } from './api/playlist'
// =========== newADD end ========

// Add API key defined in contextBridge to window object type
declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    mainApi?: {
      send: (channel: string, ...data: any[]) => void
      on: (channel: string, func: (...data: any[]) => void) => void
      once: (channel: string, func: (...data: any[]) => void) => void
      off: (channel: string, func: (...data: any[]) => void) => void
      invoke: (channel: string, ...data: any[]) => Promise<any>
      sendMessage: (message: Record<string, any>) => void
      closeMessagePort: () => void
      // ======== newADD start======
      setZoomFactor: (factor: number) => void
      getZoomFactor: () => number
      // =========== newADD end ========
    }
    env?: {
      isElectron: boolean
      isEnableTitlebar: boolean
      isLinux: boolean
      isMac: boolean
      isWindows: boolean
      isDev: boolean
    }
    vutronmusic?: {
      progress: number
      playing: boolean
      volume: number
      currentTrack: Record<string, any>
      isLiked: boolean
      repeatMode: string
      lyric: { lrc: string; tlyric: string; romalrc: string }
    }
    LottieAnimation: (typeof import('vue3-lottie'))['Vue3Lottie']
  }
}

// ======== newADD start======
// 在 Vue 挂载前设置首帧缩放，减少窗口打开或恢复尺寸时的视觉跳动。
initializeSmoothWindowScale()
// =========== newADD end ========

const app = createApp(App)

app.directive('focus', {
  mounted(el) {
    el.focus()
  }
})
app.directive('same-html', (el, binding) => {
  el.innerHTML = DOMPurify.sanitize(binding.value)
})

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app
  // .use(vuetify)
  .use(vue3lottie)
  .use(i18n)
  .use(router)
  .use(pinia)

app.mount('#app')

// ======== newADD start======
// 在桌面歌词设置面板中安装独立的最小/最大缩放参考字号控件。
initializeOsdWindowScaleSettings(router)

const HEART_MODE_CHANNEL = 'vutronmusic-heart-mode-control'
const playerStore = usePlayerStore(pinia)
const dataStore = useDataStore(pinia)
const stateStore = useNormalStateStore(pinia)
let heartModeLoading = false
const heartModeChannel = new BroadcastChannel(HEART_MODE_CHANNEL)

/**
 * 获取“我喜欢的音乐”歌单 ID。
 *
 * Returns:
 * 已登录账号的喜欢歌单 ID；无法获取时返回 0。
 */
const resolveLikedPlaylistID = async () => {
  let playlistID = Number(dataStore.likedSongPlaylistID) || 0
  if (playlistID > 0) return playlistID

  await dataStore.fetchLikedPlaylist()
  playlistID = Number(dataStore.likedSongPlaylistID) || 0
  return playlistID
}

/**
 * 从“我喜欢的音乐”中选择本次心动模式的种子歌曲。
 *
 * Args:
 *   playlistID: 用户“我喜欢的音乐”歌单 ID。
 *
 * Returns:
 *   种子歌曲 ID 以及完整的喜欢歌曲 ID 列表。
 *
 * Raises:
 *   当歌单详情不可用或歌单为空时抛出错误。
 */
const selectHeartModeSeedFromLikes = async (playlistID: number) => {
  const detail = await getPlaylistDetail(playlistID, true)
  const likedTrackIDs = (detail?.playlist?.trackIds || [])
    .map((item: any) => Number(item?.id ?? item))
    .filter((id: number) => Number.isFinite(id) && id > 0)

  if (!likedTrackIDs.length) {
    throw new Error('LIKED_PLAYLIST_EMPTY')
  }

  const seedIndex = Math.floor(Math.random() * likedTrackIDs.length)
  return {
    seedTrackID: likedTrackIDs[seedIndex],
    likedTrackIDs
  }
}

/**
 * 根据“我喜欢的音乐”开始一次新的网易云心动模式播放。
 *
 * 详细说明：
 * 1. 不依赖当前正在播放的歌曲；
 * 2. 从喜欢歌单中随机选择一首歌曲作为 seed song；
 * 3. 调用 `/playmode/intelligence/list`，不调用私人 FM 或每日推荐；
 * 4. 以种子歌曲为第一首，立即替换当前播放队列并开始播放；
 * 5. 后续歌曲严格采用智能播放接口返回的推荐顺序。
 */
const publishHeartModeResult = (
  requestId: string,
  status: 'loading' | 'success' | 'error',
  message: string
) => {
  heartModeChannel.postMessage({
    type: 'heart-mode-result',
    requestId,
    status,
    message,
    timestamp: Date.now()
  })
}

const startHeartModeFromLikes = async (requestId = '') => {
  if (heartModeLoading) {
    publishHeartModeResult(requestId, 'error', '心动模式正在加载，请稍候')
    return
  }

  if (!dataStore.user?.userId) {
    const message = '心动模式需要先登录网易云音乐'
    stateStore.showToast(message)
    publishHeartModeResult(requestId, 'error', message)
    return
  }

  heartModeLoading = true
  stateStore.showToast('正在根据我喜欢的音乐生成心动模式…')
  publishHeartModeResult(requestId, 'loading', '正在生成心动模式…')

  try {
    const playlistID = await resolveLikedPlaylistID()
    if (!playlistID) {
      const message = '未找到“我喜欢的音乐”歌单'
      stateStore.showToast(message)
      publishHeartModeResult(requestId, 'error', message)
      return
    }

    const { seedTrackID } = await selectHeartModeSeedFromLikes(playlistID)
    let result = await intelligencePlaylist({
      id: seedTrackID,
      pid: playlistID,
      sid: seedTrackID
    })

    let responseItems = Array.isArray(result?.data) ? result.data : []
    if (!responseItems.length) {
      console.warn('[HeartMode] 带 sid 的请求未返回歌曲，使用兼容参数重试：', {
        code: result?.code,
        message: result?.message
      })
      result = await intelligencePlaylist({ id: seedTrackID, pid: playlistID })
      responseItems = Array.isArray(result?.data) ? result.data : []
    }

    const recommendedTrackIDs = responseItems
      .map((item: any) => Number(item?.id ?? item?.songInfo?.id))
      .filter((id: number) => Number.isFinite(id) && id > 0)

    const heartModeTrackIDs = Array.from(new Set<number>([seedTrackID, ...recommendedTrackIDs]))

    if (heartModeTrackIDs.length <= 1) {
      const message = '未获取到心动模式推荐歌曲'
      stateStore.showToast(message)
      publishHeartModeResult(requestId, 'error', message)
      return
    }

    playerStore.clearPlayNextList()
    playerStore.shuffle = false
    playerStore.repeatMode = 'off'

    await playerStore.replacePlaylist('intelligence', playlistID, heartModeTrackIDs, 0)

    const message = `已开启心动模式，共 ${heartModeTrackIDs.length} 首`
    stateStore.showToast(message)
    publishHeartModeResult(requestId, 'success', message)
  } catch (error: any) {
    console.error('[HeartMode] 根据喜欢歌单启动失败：', error)
    const message =
      error?.message === 'LIKED_PLAYLIST_EMPTY'
        ? '“我喜欢的音乐”歌单为空'
        : '心动模式加载失败，请稍后重试'
    stateStore.showToast(message)
    publishHeartModeResult(requestId, 'error', message)
  } finally {
    heartModeLoading = false
  }
}

/**
 * 使用 BroadcastChannel 接收桌面歌词窗口的心动模式请求。
 *
 * 该通道不依赖桌面歌词 MessagePort 的初始化时序，因此窗口重建、热更新或主窗口
 * 隐藏时仍能稳定触发。
 */
const publishPlayerSnapshot = () => {
  heartModeChannel.postMessage({
    type: 'player-snapshot',
    data: {
      trackID: playerStore.currentTrack?.id ?? 0,
      trackName: playerStore.currentTrack?.name ?? '',
      playing: playerStore.playing,
      isLiked: playerStore.isLiked,
      pic: playerStore.pic,
      repeatMode: playerStore.repeatMode,
      shuffle: playerStore.shuffle,
      lyricOffset: playerStore.lyricOffset
    },
    timestamp: Date.now()
  })
}

heartModeChannel.onmessage = (event: MessageEvent) => {
  if (event.data?.type === 'start-heart-mode-from-likes') {
    startHeartModeFromLikes(String(event.data?.requestId ?? ''))
    return
  }

  if (event.data?.type === 'request-player-snapshot') {
    publishPlayerSnapshot()
  }
}

watch(
  () => [
    playerStore.currentTrack?.id,
    playerStore.playing,
    playerStore.isLiked,
    playerStore.pic,
    playerStore.repeatMode,
    playerStore.shuffle,
    playerStore.lyricOffset
  ],
  publishPlayerSnapshot,
  { immediate: true }
)

// 保留旧 MessagePort 消息兼容，避免旧桌面歌词窗口尚未重建时完全失效。
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type !== 'osd-heart-mode') return
  startHeartModeFromLikes()
})

window.addEventListener('beforeunload', () => {
  heartModeChannel.close()
})
// =========== newADD end ========

dailyTask()
