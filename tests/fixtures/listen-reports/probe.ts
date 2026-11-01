import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import Insights from '../../../src/renderer/views/MusicInsightsStable.vue'
import zh from '../../../src/renderer/locales/zh-hans.json'
import {
  getNeteaseListenSyncDiagnostics,
  neteaseListenEntries,
  recordNeteaseListenSegment,
  markNeteaseListenEntryAccepted
} from '../../../src/renderer/utils/neteaseListenLedger'

// Seed an acknowledged receipt in this isolated profile, without submitting it.
const [entry] = recordNeteaseListenSegment({
  accountId: 'fixture',
  sessionId: 'fixture-session',
  startedAt: Date.now() - 600_000,
  endedAt: Date.now() - 300_000,
  seconds: 300,
  params: { id: 1, sourceid: 2, total: 240, name: 'Fixture', artist: 'Fixture' }
})
markNeteaseListenEntryAccepted(entry.id)

const app = createApp({ render: () => h(Insights) })
app.use(createPinia()).use(createI18n({ legacy: false, locale: 'zh', messages: { zh } }))
app.provide('scrollMainTo', () => {})
;(window as any).listenProbe = {
  entries: () => neteaseListenEntries.value,
  diagnostics: () => getNeteaseListenSyncDiagnostics('fixture'),
  unmount: () => app.unmount()
}
app.mount('#app')
