import { createApp } from 'vue'
import OSDLyric from './views/OSDLyric.vue'
import 'virtual:svg-icons-register'
import { createPinia, storeToRefs } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import './assets/css/osdlyric.scss'
// ======== newADD start======
import { initializeSmoothOsdWindowScale } from './utils/smoothOsdWindowScale'
import { initializeOsdFontRendering } from './utils/osdFontRendering'
import { initializeOsdCoverControlsVisibility } from './utils/osdCoverControlsVisibility'
import { initializeOsdLyricSyncGuard } from './utils/osdLyricSyncGuard'
import { useOsdLyricStore } from './store/osdLyric'
// =========== newADD end ========

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
  }
}

// ======== newADD start======
// 在 Vue 挂载前应用首帧缩放，避免桌面歌词窗口出现后再突然改变大小。
initializeSmoothOsdWindowScale()
// 封面控件可见性独立于锁定状态，并在设置修改后实时同步。
initializeOsdCoverControlsVisibility()
// 桌面歌词使用独立播放时钟兜底，并周期性向主播放器校正真实播放进度。
initializeOsdLyricSyncGuard()
// =========== newADD end ========

const app = createApp(OSDLyric)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

// ======== newADD start======
// 将持久化的 PostScript 字体标识解析为 Chromium 可稳定匹配的系统字体族。
const osdLyricStore = useOsdLyricStore(pinia)
const { font } = storeToRefs(osdLyricStore)
initializeOsdFontRendering(font)
// =========== newADD end ========

app.mount('#lyric')
