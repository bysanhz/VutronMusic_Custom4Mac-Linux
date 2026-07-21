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
import { usePlayerStore } from './store/player'
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
/**
 * 接收独立桌面歌词窗口通过 MessagePort 发送的紧凑播放器控制消息。
 *
 * 目前“心动模式”复用项目现有的个性推荐/私人 FM 播放链路，避免在桌面歌词
 * renderer 中重复创建播放器状态。主窗口即使隐藏，播放器 store 仍然可以正常响应。
 */
const playerStore = usePlayerStore(pinia)
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type !== 'osd-heart-mode') return
  playerStore.playPersonalFM()
})
// =========== newADD end ========

dailyTask()
