import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('music insights rendering stability', () => {
  test('keeps the insights page out of virtual-scroll lifecycle churn', () => {
    const router = readSource('src/renderer/router/index.ts')
    const view = readSource('src/renderer/views/MusicInsightsStable.vue')

    expect(router).toContain("import('../views/MusicInsightsStable.vue')")
    expect(view).toContain("import InsightsTrackList from '../components/InsightsTrackList.vue'")
    expect(view).not.toContain('VirtualTrackList')
    expect(view).not.toContain('VirtualCoverRow')
    expect(view).not.toContain('clearStyleResources')
    expect(view).toContain("{ id: 'footprint' as const, label: t('insights.tabs.footprint') }")
    expect(view).toContain("{ id: 'cloud' as const, label: t('insights.tabs.cloud') }")
    expect(view).not.toContain("{ id: 'playlist', label: '歌单管理' }")
    expect(view).not.toContain("{ id: 'insight', label: '歌曲洞察' }")
    expect(view).not.toContain("activeTab === 'playlist'")
    expect(view).not.toContain("activeTab === 'insight'")
  })

  test('keeps pending local listen time visible until NetEase statistics catch up', () => {
    const view = readSource('src/renderer/views/MusicInsightsStable.vue')
    const ledger = readSource('src/renderer/utils/neteaseListenLedger.ts')

    expect(view).toContain('getNeteaseListenLedgerTotals')
    expect(view).toContain('reconcileNeteaseListenReport({')
    expect(view).toContain('formatDisplayListenDuration(displayWeekSeconds)')
    expect(view).toContain('formatDisplayListenDuration(displayMonthSeconds)')
    expect(view).toContain('formatDisplayListenDuration(displayTotalSeconds)')
    expect(view).toContain('formatPendingListenDuration(pendingUnsubmittedSeconds)')
    expect(view).toContain('formatPendingListenDuration(submittedNeteaseListenSeconds)')
    expect(ledger).toContain("STORAGE_KEY = 'vutronmusic-netease-listen-ledger-v3'")
    expect(ledger).toContain('accountId')
    expect(ledger).toContain('dateKey')
    expect(ledger).toContain('sessionId')
    expect(ledger).toContain('confirmedSeconds')
    expect(view).toContain('const PENDING_SYNC_INTERVAL_MS = 10_000')
    expect(view).toContain("safeRequest(listenTotal(), '确认累计听歌时长同步')")
    expect(view).toContain('startPendingSyncPolling()')
    expect(view).toContain('stopPendingSyncPolling()')
    expect(view).toContain('visiblePendingNeteaseListenSeconds.value <= 0')
    expect(view).toContain('const backgroundPendingNeteaseListenSeconds = computed')
    expect(view).toContain('backgroundPendingNeteaseListenSeconds.value <= 0')
    expect(view).not.toContain(
      'monthLedger.value.accepted,\n    totalLedger.value.accepted'
    )
    expect(view).toContain('if (footprintRequestInFlight) return')
    const service = readSource('src/renderer/services/neteaseModern.ts')
    expect(service).toContain('item.period')
    expect(service).toContain('extractCalendarWeekListenSeconds')
    expect(service).toContain('const daysSinceMonday = (weekStart.getDay() + 6) % 7')
    expect(view).toContain('extractTodayListenSeconds(month) ?? extractTodayListenSeconds(week)')
    expect(view).toContain('extractCalendarWeekListenSeconds(month)')
    expect(view).toContain('todayDataConflict')
    expect(view).toContain('class="sync-status"')
    expect(view).toContain('class="sync-status-panel"')
    expect(view).toContain('class="sync-status-stack"')
    expect(view).toContain(':class="{ inactive: pendingUnsubmittedSeconds <= 0 }"')
    expect(view).toContain(':class="{ inactive: submittedNeteaseListenSeconds <= 0 }"')
    expect(view).toContain('class="sync-status-help"')
    expect(view.indexOf('class="sync-status-help"')).toBeLessThan(
      view.indexOf('class="sync-status-panel"')
    )
    expect(view).toContain('font-variant-numeric: tabular-nums')
    expect(view).toContain('grid-template-columns: minmax(0, 7fr) minmax(280px, 3fr)')
  })

  test('keeps report confirmation isolated for every displayed period', () => {
    const view = readSource('src/renderer/views/MusicInsightsStable.vue')
    const ledger = readSource('src/renderer/utils/neteaseListenLedger.ts')

    expect(view).toContain('todayPeriodKey.value')
    expect(view).toContain('weekPeriodKey.value')
    expect(view).toContain('monthPeriodKey.value')
    expect(view).toContain('totalPeriodKey')
    expect(ledger).toContain('confirmedByPeriod')
    expect(ledger).toContain('[options.periodKey]')
  })
})
