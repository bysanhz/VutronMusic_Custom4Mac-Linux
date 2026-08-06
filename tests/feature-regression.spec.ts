import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
      expect(shouldResetPlaybackPosition(item.previous, item.next, item.reason)).toBe(
        item.expected
      )
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

test.describe('desktop feature integration', () => {
  test('keeps strict CSP while enabling Vue I18n JIT AST compilation', () => {
    const csp = readSource('src/main/security/contentSecurityPolicy.ts')
    const vite = readSource('vite.config.ts')

    expect(csp).toContain('"script-src \'self\'"')
    expect(csp).not.toContain("'unsafe-eval'")
    expect(vite).toContain('__INTLIFY_JIT_COMPILATION__: true')
    expect(vite).toContain('__INTLIFY_DROP_MESSAGE_COMPILER__: false')
  })

  test('includes queue-end sleep actions and preset draft recovery', () => {
    const sleepTimer = readSource('src/renderer/utils/sleepTimerSettings.ts')
    const presetDraft = readSource('src/renderer/utils/osdPresetDraftState.ts')

    expect(sleepTimer).toContain("'queueEnd'")
    expect(sleepTimer).toContain("SleepTimerAction = 'pause' | 'quit'")
    expect(sleepTimer).toContain('completeSleepTimerAtQueueEnd')
    expect(presetDraft).toContain('未保存修改')
    expect(presetDraft).toContain('撤销本次修改')
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
