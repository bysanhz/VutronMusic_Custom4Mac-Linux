import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import zh from '../locales/zh-hans.json'
import zht from '../locales/zh-hant.json'
import { windowScaleMessages } from '../locales/windowScale'
// import { getCurrentLocale } from '../utils'

const settings = JSON.parse(localStorage.getItem('settings') || '{}')
const language = settings?.general?.language || 'zh'

const mergeWindowScaleMessages = <
  T extends { settings: Record<string, unknown> }
>(
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
