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
    expect(view).toContain(
      "import InsightsResourceGrid from '../components/InsightsResourceGrid.vue'"
    )
    expect(view).not.toContain('VirtualTrackList')
    expect(view).not.toContain('VirtualCoverRow')
    expect(view).not.toContain('clearStyleResources')
    expect(view).toContain("{ id: 'footprint', label: '听歌足迹' }")
    expect(view).toContain("{ id: 'style', label: '曲风漫游' }")
    expect(view).toContain("{ id: 'cloud', label: '云盘 Pro' }")
    expect(view).not.toContain("{ id: 'playlist', label: '歌单管理' }")
    expect(view).not.toContain("{ id: 'insight', label: '歌曲洞察' }")
    expect(view).not.toContain("activeTab === 'playlist'")
    expect(view).not.toContain("activeTab === 'insight'")
  })

  test('keeps pending local listen time visible until NetEase statistics catch up', () => {
    const view = readSource('src/renderer/views/MusicInsightsStable.vue')
    const pending = readSource('src/renderer/utils/neteaseListenPending.ts')

    expect(view).toContain('pendingNeteaseListenSeconds')
    expect(view).toContain('reconcileNeteaseRemoteDurations({')
    expect(view).toContain('formatListenDuration(displayWeekSeconds)')
    expect(view).toContain('formatListenDuration(displayMonthSeconds)')
    expect(view).toContain('formatListenDuration(displayTotalSeconds)')
    expect(view).toContain('pendingNeteaseListenByScope.week.value')
    expect(view).toContain('pendingNeteaseListenByScope.month.value')
    expect(view).toContain('pendingNeteaseListenByScope.total.value')
    expect(view).toContain('本机 +')
    expect(pending).toContain("STORAGE_KEY = 'vutronmusic-netease-listen-pending-v2'")
    expect(pending).toContain('pendingNeteaseListenByScope.week.value += value')
    expect(pending).toContain("reconcileScope('today', durations.today)")
    expect(pending).toContain("reconcileScope('week', durations.week)")
    expect(pending).toContain("reconcileScope('month', durations.month)")
    expect(pending).toContain("reconcileScope('total', durations.total)")
    expect(view).toContain('const PENDING_SYNC_INTERVAL_MS = 30_000')
    expect(view).toContain('startPendingSyncPolling()')
    expect(view).toContain('stopPendingSyncPolling()')
    expect(view).toContain('pendingNeteaseListenSeconds.value <= 0')
    expect(view).toContain('if (footprintRequestInFlight) return')
  })

  test('does not empty style results before the replacement request resolves', () => {
    const view = readSource('src/renderer/views/MusicInsightsStable.vue')

    expect(view).toContain('const revision = ++styleRequestRevision')
    expect(view).toContain('applyStyleResult(result, reset)')
    expect(view).toContain('revision !== styleRequestRevision')
    expect(view).not.toContain('styleTracks.value = []')
    expect(view).not.toContain('styleAlbums.value = []')
    expect(view).not.toContain('styleArtists.value = []')
    expect(view).not.toContain('stylePlaylists.value = []')
  })

  test('uses display toggles instead of repeatedly mounting result components', () => {
    const view = readSource('src/renderer/views/MusicInsightsStable.vue')

    expect(view).toContain('v-show="styleResourceType === \'song\'"')
    expect(view).toContain('v-show="styleResourceType === \'album\'"')
    expect(view).toContain('v-show="styleResourceType === \'artist\'"')
    expect(view).toContain('v-show="styleResourceType === \'playlist\'"')
  })
})
