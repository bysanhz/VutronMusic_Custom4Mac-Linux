import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('network interruption handling', () => {
  test('shows a persistent status and refreshes online data after reconnection', () => {
    const app = readSource('src/renderer/App.vue')

    expect(app).toContain('v-if="networkIssue"')
    expect(app).toContain("window.addEventListener('offline', handleOffline)")
    expect(app).toContain("window.addEventListener('online', handleOnline)")
    expect(app).toContain("t('toast.networkOffline')")
    expect(app).toContain("t('toast.neteaseUnavailable')")
    expect(app).toContain("t('toast.networkRestored')")
    expect(app).toContain('if (navigator.onLine) fetchData()')
    expect(app).toContain('const handleOnline = (): void =>')
  })

  test('turns upstream 5xx failures into a user-visible connectivity signal', () => {
    const request = readSource('src/renderer/utils/request.ts')

    expect(request).toContain("error.code === 'ERR_NETWORK'")
    expect(request).toContain('status >= 500')
    expect(request).toContain("new CustomEvent('vutronmusic-netease-unavailable'")
    expect(request).toContain("new CustomEvent('vutronmusic-netease-available'")
  })

  test('does not dereference an empty personal FM response while offline', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain('const tracks = Array.isArray(result?.data) ? result.data : []')
    expect(player).toContain('if (!tracks.length) return')
    expect(player).toContain('if (!Array.isArray(result?.data) || !result.data.length)')
    expect(player).toContain('if (!_personalFMNextTrack.value?.id)')
  })
})
