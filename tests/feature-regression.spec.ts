import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isPointInsideRectangle } from '../src/main/osdHitRegion'
import {
  shouldResetPlaybackPosition,
  type PlaybackStartReason
} from '../src/renderer/utils/playbackStartGuard'
import { normalizeTrackLyricOffset } from '../src/renderer/utils/trackLyricOffset'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('playback start policy', () => {
  const resetCases: Array<{
    previous: number | null
    next: number
    reason: PlaybackStartReason
    expected: boolean
  }> = [
    { previous: 1, next: 2, reason: 'manual-playlist', expected: true },
    { previous: 1, next: 1, reason: 'heart-mode', expected: true },
    { previous: 1, next: 2, reason: 'previous', expected: true },
    { previous: 1, next: 2, reason: 'next', expected: true },
    { previous: 1, next: 2, reason: 'session-restore', expected: false },
    { previous: 1, next: 1, reason: 'automatic-track-change', expected: false }
  ]

  for (const item of resetCases) {
    test(`${item.reason}: ${item.previous} -> ${item.next}`, () => {
      expect(shouldResetPlaybackPosition(item.previous, item.next, item.reason)).toBe(item.expected)
    })
  }
})

test.describe('track lyric timing', () => {
  test('rounds to one decimal place and clamps to the supported range', () => {
    expect(normalizeTrackLyricOffset(1.26)).toBe(1.3)
    expect(normalizeTrackLyricOffset(-1.24)).toBe(-1.2)
    expect(normalizeTrackLyricOffset(99)).toBe(30)
    expect(normalizeTrackLyricOffset(-99)).toBe(-30)
    expect(normalizeTrackLyricOffset(Number.NaN)).toBe(0)
  })
})

test.describe('desktop lyric partial passthrough', () => {
  const region = { x: 100, y: 50, width: 45, height: 35 }

  test('keeps the cover-control region interactive', () => {
    expect(isPointInsideRectangle({ x: 110, y: 60 }, region, 2)).toBe(true)
    expect(isPointInsideRectangle({ x: 98, y: 48 }, region, 2)).toBe(true)
  })

  test('keeps the lyric region outside the interactive hit target', () => {
    expect(isPointInsideRectangle({ x: 200, y: 60 }, region, 2)).toBe(false)
    expect(isPointInsideRectangle({ x: 110, y: 100 }, region, 2)).toBe(false)
  })
})

test.describe('desktop feature integration', () => {
  test('keeps strict CSP while enabling Vue I18n JIT AST compilation', () => {
    const csp = readSource('src/main/security/contentSecurityPolicy.ts')
    const vite = readSource('vite.config.ts')

    expect(csp).toContain('"script-src \'self\'"')
    expect(csp).not.toContain("'unsafe-eval'")
    expect(vite).toContain('__INTLIFY_JIT_COMPILATION__: true')
    expect(vite).toContain('__INTLIFY_DROP_MESSAGE_COMPILER__: false')
  })

  test('includes queue-end sleep actions and preset editing tools', () => {
    const sleepTimer = readSource('src/renderer/utils/sleepTimerSettings.ts')
    const presetDraft = readSource('src/renderer/utils/osdPresetDraftState.ts')
    const presetTransfer = readSource('src/renderer/utils/osdPresetTransferPreview.ts')

    expect(sleepTimer).toContain("'queueEnd'")
    expect(sleepTimer).toContain("SleepTimerAction = 'pause' | 'quit'")
    expect(sleepTimer).toContain('completeSleepTimerAtQueueEnd')
    expect(presetDraft).toContain('未保存修改')
    expect(presetDraft).toContain('撤销本次修改')
    expect(presetTransfer).toContain('vutronmusic-osd-preset')
    expect(presetTransfer).toContain('导出当前')
    expect(presetTransfer).toContain('导入预设')
    expect(presetTransfer).toContain("select.addEventListener('change', showSelectedPresetPreview)")
    expect(presetTransfer).toContain('resolveSelectedSettings(select.value)')
    expect(presetTransfer).toContain(
      'event.key === PRESETS_STORAGE_KEY || event.key === BUILTIN_OVERRIDES_STORAGE_KEY'
    )
    expect(presetTransfer).toContain(
      "button.addEventListener('click', refreshPreviewAfterPresetAction)"
    )
  })

  test('registers diagnostics and playback-history integrations', () => {
    const constants = readSource('src/main/utils/Constants.ts')
    const main = readSource('src/renderer/main.ts')
    const playPage = readSource('src/renderer/views/PlayPage.vue')

    expect(constants).toContain("import '../runtimeDiagnostics'")
    expect(main).toContain('initializePlaybackHistory(playerStore)')
    expect(main).toContain('initializeTrackLyricOffset(playerStore)')
    expect(playPage).toContain('<PlaybackHistoryModal />')
    expect(playPage).toContain('<TrackLyricOffsetModal />')
  })
})
