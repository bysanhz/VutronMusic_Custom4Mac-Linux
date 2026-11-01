import { createApp, h, ref, withDirectives } from 'vue'
import { createI18n } from 'vue-i18n'
import {
  installI18nTimingCleanup,
  getI18nTimingDiagnostics
} from '../../../src/renderer/utils/i18nPerformance'
import { vCoverFallback } from '../../../src/renderer/utils/coverImageFallback'
import { getCoverLoadDiagnostics } from '../../../src/renderer/utils/coverNetworkDiagnostics'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { hello: 'Hello {name}' } }
})
const source = ref('')
const app = createApp({
  render: () =>
    source.value
      ? withDirectives(h('img', { src: source.value }), [[vCoverFallback, source.value]])
      : null
})
app.mount('#fixture')
;(window as any).resourceProbe = {
  cleanup: installI18nTimingCleanup,
  timingDiagnostics: getI18nTimingDiagnostics,
  diagnostics: getCoverLoadDiagnostics,
  image: (url: string) => {
    source.value = url
  },
  unmount: () => app.unmount(),
  translate: async (count: number) => {
    let result = ''
    for (let i = 0; i < count; i++) {
      result = i18n.global.t('hello', { name: 'fixture' })
      if (i % 1000 === 999) await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return result
  },
  measures: () =>
    ['intlify message resolve', 'intlify message compilation', 'intlify message evaluation'].map(
      (name) => performance.getEntriesByName(name, 'measure').length
    )
}
