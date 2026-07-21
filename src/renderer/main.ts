import { createApp } from 'vue'
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
import { intelligencePlaylist } from './api/playlist'
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

/**
 * 接收独立桌面歌词窗口发送的真正心动模式请求。
 *
 * 详细说明：
 * 1. 调用网易云 `/playmode/intelligence/list`，不调用私人 FM `/personal/fm`，
 *    也不调用每日推荐 `/recommend/songs`；
 * 2. 当前来源是网易云歌单时，使用当前歌单作为算法上下文；
 * 3. 专辑、搜索、本地匹配歌曲等其他来源，使用用户“我喜欢的音乐”歌单作为上下文；
 * 4. 当前歌曲作为 seed song，保持当前播放位置不变，仅替换后续播放顺序；
 * 5. 关闭随机播放、单曲循环和私人 FM 状态，严格按照智能接口返回顺序播放。
 */
const playerStore = usePlayerStore(pinia)
const dataStore = useDataStore(pinia)
const stateStore = useNormalStateStore(pinia)
let heartModeLoading = false

/**
 * 解析心动模式使用的网易云歌单上下文。
 *
 * Returns:
 * 当前播放列表是网易云歌单时返回其 ID；否则返回“我喜欢的音乐”歌单 ID。
 */
const resolveHeartModePlaylistID = () => {
  const sourceType = String(playerStore.playlistSource?.type || '').toLowerCase()
  const sourceID = Number(playerStore.playlistSource?.id)
  const isNeteasePlaylist =
    sourceID > 0 && (sourceType === 'playlist' || sourceType === 'intelligence')

  if (isNeteasePlaylist) return sourceID
  return Number(dataStore.likedSongPlaylistID) || 0
}

/**
 * 请求并启用真正的网易云心动模式。
 */
const startHeartMode = async () => {
  if (heartModeLoading) return

  const seedTrack = playerStore.currentTrack
  const seedTrackID = Number(seedTrack?.id)
  const isUnsupportedStreamTrack = seedTrack?.type === 'stream'
  const isUnmatchedLocalTrack = seedTrack?.type === 'local' && seedTrack?.matched === false

  if (
    !Number.isFinite(seedTrackID) ||
    seedTrackID <= 0 ||
    isUnsupportedStreamTrack ||
    isUnmatchedLocalTrack
  ) {
    stateStore.showToast('当前歌曲不是可用于心动模式的网易云歌曲')
    return
  }

  if (!dataStore.user?.userId) {
    stateStore.showToast('心动模式需要先登录网易云音乐')
    return
  }

  const playlistID = resolveHeartModePlaylistID()
  if (!playlistID) {
    stateStore.showToast('未找到可用于心动模式的网易云歌单')
    return
  }

  heartModeLoading = true
  try {
    const result = await intelligencePlaylist({
      id: seedTrackID,
      pid: playlistID
    })

    const responseItems = Array.isArray(result?.data) ? result.data : []
    const recommendedTrackIDs = Array.from(
      new Set<number>(
        responseItems
          .map((item: any) => Number(item?.id ?? item?.songInfo?.id))
          .filter(
            (id: number) => Number.isFinite(id) && id > 0 && id !== seedTrackID
          )
      )
    )

    if (!recommendedTrackIDs.length) {
      stateStore.showToast('未获取到心动模式推荐歌曲')
      return
    }

    // 保持当前歌曲与进度不变，只把智能推荐序列放到当前歌曲之后。
    playerStore.clearPlayNextList()
    playerStore.shuffle = false
    playerStore.repeatMode = 'off'
    playerStore.isPersonalFM = false
    playerStore.list = [seedTrackID, ...recommendedTrackIDs]
    playerStore.currentTrackIndex = 0
    playerStore.playlistSource = {
      type: 'intelligence',
      id: playlistID
    }

    stateStore.showToast(`已进入心动模式，加载 ${recommendedTrackIDs.length} 首智能推荐`)
  } catch (error) {
    console.error('[HeartMode] 获取智能播放列表失败：', error)
    stateStore.showToast('心动模式加载失败，请稍后重试')
  } finally {
    heartModeLoading = false
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type !== 'osd-heart-mode') return
  startHeartMode()
})
// =========== newADD end ========

dailyTask()
