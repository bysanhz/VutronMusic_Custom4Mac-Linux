import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import 'virtual:svg-icons-register'
import '../../../src/renderer/assets/css/global.scss'
import DailyTracksCard from '../../../src/renderer/components/DailyTracksCard.vue'
import LinuxTitleBar from '../../../src/renderer/components/LinuxTitleBar.vue'
import SvgIcon from '../../../src/renderer/components/SvgIcon.vue'
import appIcon from '../../../src/renderer/assets/branding/app-icon.png'
import { useNormalStateStore } from '../../../src/renderer/store/state'

const pinia = createPinia()
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => null } }]
})
const app = createApp({
  render: () =>
    h('div', [
      h(LinuxTitleBar),
      h('section', { style: 'padding:72px 36px 30px;max-width:1100px' }, [
        h('h1', 'VutronMusic · 已接入资源'),
        h('div', { style: 'display:flex;align-items:center;gap:30px;margin:24px 0' }, [
          h('img', { id: 'app-icon', src: appIcon, width: 110, height: 110 }),
          h(SvgIcon, { iconClass: 'brand-logo', style: 'width:64px;height:64px' }),
          ...['color', 'white', 'black'].map((kind) =>
            h(
              'div',
              {
                style:
                  'background:' +
                  (kind === 'white' ? '#202839' : '#eef0f7') +
                  ';padding:20px;border-radius:10px'
              },
              [
                h('img', {
                  src: '/images/tray/vutronmusic-' + kind + '.png',
                  width: 48,
                  height: 48
                })
              ]
            )
          )
        ]),
        h('div', { style: 'width:560px' }, [h(DailyTracksCard)])
      ])
    ])
})
app
  .use(pinia)
  .use(router)
  .use(
    createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: { dailyCard: { title: 'Daily songs', coverAlt: 'Daily cover', play: 'Play' } }
      }
    })
  )
app.mount('#app')
;(window as any).brandingProbe = {
  setCover(picUrl: string) {
    useNormalStateStore().dailyTracks = [{ id: 1, al: { picUrl } }] as any
  }
}
