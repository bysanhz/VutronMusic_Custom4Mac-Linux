import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import zh from '../locales/zh-hans.json'
import zht from '../locales/zh-hant.json'
import { windowScaleMessages } from '../locales/windowScale'
// ======== newADD start======
// 设置页面挂载后自动注入紧凑桌面歌词左侧封面与控制按钮开关。
import '../utils/osdCoverControlsSettings'
// 加载桌面歌词预设、设置备份恢复与睡眠定时器。
import '../utils/v327Features'
// =========== newADD end ========
// import { getCurrentLocale } from '../utils'

const settings = JSON.parse(localStorage.getItem('settings') || '{}')
const language = settings?.general?.language || 'zh'

const mergeWindowScaleMessages = <T extends { settings: Record<string, unknown> }>(
  messages: T,
  windowScale: Record<string, string>
) => ({
  ...messages,
  settings: {
    ...messages.settings,
    windowScale
  }
})

// getCurrentLocale()
export default createI18n({
  legacy: false,
  locale: language,
  fallbackLocale: 'en',
  globalInjection: true,
  messages: {
    en: mergeWindowScaleMessages(en, windowScaleMessages.en),
    zh: mergeWindowScaleMessages(zh, windowScaleMessages.zh),
    zht: mergeWindowScaleMessages(zht, windowScaleMessages.zht)
  }
})
