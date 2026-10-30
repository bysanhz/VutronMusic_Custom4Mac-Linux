import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import SideNav from '../../../src/renderer/components/SideNav.vue'
import zh from '../../../src/renderer/locales/zh-hans.json'
import en from '../../../src/renderer/locales/en.json'
import zht from '../../../src/renderer/locales/zh-hant.json'
import '../../../src/renderer/assets/css/global.scss'
import '../../../src/renderer/assets/css/rainbow-theme.scss'
import '../../../src/renderer/assets/css/monochrome-theme.scss'

const app = createApp({ render: () => h(SideNav, { networkIssue: null }) })
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => null } }]
})
const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en, zht } })
app.use(createPinia()).use(i18n).use(router)
;(window as any).runtimeProbe = {
  unmount: () => app.unmount(),
  language: (value: string) => {
    i18n.global.locale.value = value as 'zh'
  }
}
router.isReady().then(() => app.mount('#app'))
