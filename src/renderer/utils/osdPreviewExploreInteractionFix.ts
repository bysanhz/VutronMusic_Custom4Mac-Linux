/*
 * Desktop lyric preview and Explore scroll interaction hardening.
 *
 * Usage:
 *   Imported once from `v327Features.ts`; no public API is required.
 *
 * Args:
 *   None. The module reads the existing settings/player localStorage snapshots and
 *   the rendered settings / Explore DOM.
 *
 * Returns:
 *   No value. It keeps the desktop lyric preset preview aligned with the real OSD
 *   layout and forwards wheel/scroll-bottom gestures into the nested virtual list.
 */

const OSD_STORAGE_KEY = 'osdLyric'
const PLAYER_STORAGE_KEY = 'player'
const PRESETS_STORAGE_KEY = 'vutronmusic-osd-presets'
const BUILTIN_OVERRIDES_STORAGE_KEY = 'vutronmusic-osd-builtin-preset-overrides'
const COVER_CONTROLS_STORAGE_KEY = 'vutronmusic-osd-cover-controls-visible'
const PRESET_CONTROL_ID = 'vutronmusic-osd-preset-setting'
const PREVIEW_FIX_STYLE_ID = 'vutronmusic-osd-preview-explore-fix-style'
const PRESET_COMMITTED_EVENT = 'vutronmusic-osd-preset-committed'

const BUILTIN_LYRIC_BACKGROUND = 'rgba(0, 0, 0, 0)'
const BUILTIN_LYRIC_PLAYED = 'rgba(7, 185, 187, 1)'
const BUILTIN_LYRIC_UNPLAYED = 'rgba(239, 152, 207, 1)'
const BUILTIN_LYRIC_SHADOW = 'rgba(0, 0, 0, 0)'

type PresetSettings = {
  type: 'small' | 'normal'
  mode: 'oneLine' | 'twoLines'
  isWordByWord: boolean
  translationMode: 'none' | 'tlyric' | 'rlyric'
  backgroundColor: string
  playedLrcColor: string
  unplayLrcColor: string
  textShadow: string
  font: string
  align: 'left' | 'center' | 'right'
  showButtonWhenLock: boolean
  coverControlsVisible: boolean
}

type StoredPreset = {
  id: string
  name: string
  settings: PresetSettings
}

const readJsonRecord = (key: string): Record<string, any> => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

const normalizeSettings = (value: unknown): PresetSettings => {
  const settings = value && typeof value === 'object' ? (value as Partial<PresetSettings>) : {}
  return {
    type: settings.type === 'normal' ? 'normal' : 'small',
    mode: settings.mode === 'oneLine' ? 'oneLine' : 'twoLines',
    isWordByWord: settings.isWordByWord !== false,
    translationMode: ['none', 'tlyric', 'rlyric'].includes(String(settings.translationMode))
      ? (settings.translationMode as PresetSettings['translationMode'])
      : 'tlyric',
    backgroundColor: String(settings.backgroundColor || BUILTIN_LYRIC_BACKGROUND).slice(0, 100),
    playedLrcColor: String(settings.playedLrcColor || BUILTIN_LYRIC_PLAYED).slice(0, 100),
    unplayLrcColor: String(settings.unplayLrcColor || BUILTIN_LYRIC_UNPLAYED).slice(0, 100),
    textShadow: String(settings.textShadow || BUILTIN_LYRIC_SHADOW).slice(0, 100),
    font: String(settings.font || 'system-ui').slice(0, 200),
    align: ['left', 'center', 'right'].includes(String(settings.align))
      ? (settings.align as PresetSettings['align'])
      : 'center',
    showButtonWhenLock: settings.showButtonWhenLock !== false,
    coverControlsVisible: settings.coverControlsVisible !== false
  }
}

const commonBuiltInSettings = {
  isWordByWord: true,
  backgroundColor: BUILTIN_LYRIC_BACKGROUND,
  playedLrcColor: BUILTIN_LYRIC_PLAYED,
  unplayLrcColor: BUILTIN_LYRIC_UNPLAYED,
  textShadow: BUILTIN_LYRIC_SHADOW,
  font: 'system-ui',
  showButtonWhenLock: true
} as const

const BUILTIN_PRESETS: Record<string, PresetSettings> = {
  'builtin-minimal': {
    ...commonBuiltInSettings,
    type: 'small',
    mode: 'twoLines',
    translationMode: 'tlyric',
    align: 'center',
    coverControlsVisible: false
  },
  'builtin-centered': {
    ...commonBuiltInSettings,
    type: 'normal',
    mode: 'twoLines',
    translationMode: 'tlyric',
    align: 'center',
    coverControlsVisible: false
  },
  'builtin-left': {
    ...commonBuiltInSettings,
    type: 'small',
    mode: 'oneLine',
    translationMode: 'none',
    align: 'left',
    coverControlsVisible: false
  },
  'builtin-cover': {
    ...commonBuiltInSettings,
    type: 'small',
    mode: 'twoLines',
    translationMode: 'tlyric',
    align: 'center',
    coverControlsVisible: true
  }
}

const readPresetArray = (key: string): StoredPreset[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    if (!Array.isArray(value)) return []
    return value
      .map((item): StoredPreset | null => {
        if (!item || typeof item !== 'object') return null
        const id = String(item.id || '')
        const name = String(item.name || '')
        if (!id || !name) return null
        return { id, name, settings: normalizeSettings(item.settings) }
      })
      .filter((item): item is StoredPreset => item !== null)
  } catch {
    return []
  }
}

const resolveSelectedPreset = (presetId: string): PresetSettings | null => {
  if (!presetId) return null

  if (presetId.startsWith('user-')) {
    return readPresetArray(PRESETS_STORAGE_KEY).find((item) => item.id === presetId)?.settings || null
  }

  const override = readPresetArray(BUILTIN_OVERRIDES_STORAGE_KEY).find(
    (item) => item.id === presetId
  )
  if (override) return override.settings

  return BUILTIN_PRESETS[presetId] ? { ...BUILTIN_PRESETS[presetId] } : null
}

const readCurrentSettings = (): PresetSettings =>
  normalizeSettings({
    ...readJsonRecord(OSD_STORAGE_KEY),
    coverControlsVisible: localStorage.getItem(COVER_CONTROLS_STORAGE_KEY) !== 'false'
  })

const sameVisualSettings = (left: PresetSettings, right: PresetSettings): boolean =>
  left.type === right.type &&
  left.mode === right.mode &&
  left.backgroundColor === right.backgroundColor &&
  left.playedLrcColor === right.playedLrcColor &&
  left.unplayLrcColor === right.unplayLrcColor &&
  left.textShadow === right.textShadow &&
  left.font === right.font &&
  left.align === right.align &&
  left.coverControlsVisible === right.coverControlsVisible

const resolvePreviewSettings = (select: HTMLSelectElement | null): PresetSettings => {
  const current = readCurrentSettings()
  const selected = resolveSelectedPreset(select?.value || '')

  // A modified live OSD must win over the selected saved preset. This is the exact
  // case that previously made the real lyric colors change while the preview stayed stale.
  if (!selected || !sameVisualSettings(current, selected)) return current
  return selected
}

const resolveCurrentCoverUrl = (): string => {
  const player = readJsonRecord(PLAYER_STORAGE_KEY)
  const track = player.currentTrack ?? {}
  const album = track.album ?? track.al ?? {}
  return String(player.pic || album.picUrl || track.picUrl || '')
}

const isTransparentColor = (color: string): boolean => {
  const match = color.match(/rgba?\(([^)]+)\)/i)
  if (!match) return false
  const parts = match[1].split(',').map((part) => Number(part.trim()))
  return parts.length >= 4 ? Number.isFinite(parts[3]) && parts[3] <= 0.01 : false
}

const injectFixStyle = (): void => {
  if (document.getElementById(PREVIEW_FIX_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = PREVIEW_FIX_STYLE_ID
  style.textContent = `
    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate {
      box-sizing: border-box !important;
      min-height: 44px !important;
      padding: 4px !important;
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: center !important;
      gap: 0 !important;
    }

    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate.vutronmusic-preview-compact.has-cover {
      grid-template-columns: 45px minmax(0, 1fr) !important;
      column-gap: 2px !important;
    }

    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate .vutronmusic-osd-preset-preview-cover {
      width: 45px !important;
      height: 35px !important;
      border-radius: 5px !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
      background-size: cover !important;
      box-shadow: none !important;
    }

    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate .vutronmusic-osd-preset-preview-lyrics {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      gap: 0 !important;
      min-width: 0 !important;
      height: 35px !important;
      padding: 0 2px !important;
      box-sizing: border-box !important;
      line-height: 1 !important;
    }

    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate .vutronmusic-osd-preset-preview-lyrics strong,
    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate .vutronmusic-osd-preset-preview-lyrics small {
      display: block !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      line-height: 1 !important;
    }

    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate .vutronmusic-osd-preset-preview-lyrics strong {
      font-size: 13px !important;
      font-weight: 600 !important;
    }

    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate .vutronmusic-osd-preset-preview-lyrics small {
      font-size: 11px !important;
      font-weight: 600 !important;
    }

    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate.single-line {
      min-height: 44px !important;
    }

    .vutronmusic-osd-preset-preview.vutronmusic-preview-accurate.single-line .vutronmusic-osd-preset-preview-lyrics small {
      display: none !important;
    }
  `
  document.head.appendChild(style)
}

const renderAccuratePreview = (): void => {
  const control = document.getElementById(PRESET_CONTROL_ID)
  const preview = control?.querySelector<HTMLElement>('.vutronmusic-osd-preset-preview')
  const cover = control?.querySelector<HTMLElement>('.vutronmusic-osd-preset-preview-cover')
  const lyrics = control?.querySelector<HTMLElement>('.vutronmusic-osd-preset-preview-lyrics')
  const playedLine = lyrics?.querySelector<HTMLElement>('strong')
  const waitingLine = lyrics?.querySelector<HTMLElement>('small')
  const select = control?.querySelector<HTMLSelectElement>('.vutronmusic-v327-controls select') ?? null
  if (!preview || !cover || !lyrics || !playedLine || !waitingLine) return

  const settings = resolvePreviewSettings(select)
  const compact = settings.type === 'small'
  const showCover = compact && settings.coverControlsVisible

  preview.classList.add('vutronmusic-preview-accurate')
  preview.classList.toggle('vutronmusic-preview-compact', compact)
  preview.classList.toggle('has-cover', showCover)
  preview.classList.toggle('single-line', settings.mode === 'oneLine')

  preview.style.backgroundColor = settings.backgroundColor
  preview.style.backgroundImage = isTransparentColor(settings.backgroundColor) ? '' : 'none'
  preview.style.fontFamily = settings.font
  preview.style.textAlign = settings.align
  preview.style.textShadow = `0 0 2px ${settings.textShadow}`

  cover.hidden = !showCover
  const coverUrl = resolveCurrentCoverUrl()
  cover.style.backgroundImage = coverUrl
    ? `url(${JSON.stringify(coverUrl)})`
    : 'linear-gradient(135deg, var(--color-primary), rgba(40, 40, 40, 0.82))'

  lyrics.style.textAlign = settings.align
  playedLine.style.color = settings.playedLrcColor
  waitingLine.style.color = settings.unplayLrcColor
  waitingLine.hidden = settings.mode === 'oneLine'
}

let previewRenderFrame: number | null = null
const scheduleAccuratePreview = (): void => {
  if (previewRenderFrame !== null) return
  previewRenderFrame = window.requestAnimationFrame(() => {
    previewRenderFrame = null
    renderAccuratePreview()
  })
}

const findMainScroller = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('#app #main')

const isMainAtBottom = (main: HTMLElement): boolean =>
  main.scrollTop + main.clientHeight >= main.scrollHeight - 8

const findExploreVirtualScroller = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('.explore-page .infinite-list-container')
}

const dispatchVirtualScrollCheck = (scroller: HTMLElement): void => {
  scroller.dispatchEvent(new Event('scroll'))
}

/**
 * The Explore page uses a parent page scroller plus a nested virtual scroller. When
 * the parent reaches its bottom, Electron/Chromium does not always chain the next
 * wheel gesture into the nested element (especially while the virtual list observer
 * still has overflow hidden). Programmatically moving scrollTop works even for an
 * overflow-hidden element and still emits the component's normal scroll path.
 */
const handleExploreWheel = (event: WheelEvent): void => {
  const scroller = findExploreVirtualScroller(event.target)
  const main = findMainScroller()
  if (!scroller || !main || !Number.isFinite(event.deltaY) || event.deltaY === 0) return

  const maxInnerScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight)

  if (event.deltaY > 0) {
    if (!isMainAtBottom(main)) return

    if (maxInnerScroll <= 1) {
      // A short first page can have no internal scroll range yet. Triggering the
      // component's existing bottom check requests the next page immediately.
      dispatchVirtualScrollCheck(scroller)
      event.preventDefault()
      return
    }

    const before = scroller.scrollTop
    scroller.scrollTop = Math.min(maxInnerScroll, before + event.deltaY)
    if (scroller.scrollTop === before || scroller.scrollTop >= maxInnerScroll - 1) {
      dispatchVirtualScrollCheck(scroller)
    }
    event.preventDefault()
    return
  }

  if (scroller.scrollTop <= 0) return
  scroller.scrollTop = Math.max(0, scroller.scrollTop + event.deltaY)
  event.preventDefault()
}

let lastMainBottomCheck = 0
const handleCapturedScroll = (event: Event): void => {
  const main = findMainScroller()
  if (!main || event.target !== main || !isMainAtBottom(main)) return

  const now = Date.now()
  if (now - lastMainBottomCheck < 120) return
  lastMainBottomCheck = now

  const scrollers = [...document.querySelectorAll<HTMLElement>('.explore-page .infinite-list-container')]
  const activeScroller = scrollers.find((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
  if (activeScroller) dispatchVirtualScrollCheck(activeScroller)
}

const handleStorage = (event: StorageEvent): void => {
  if (
    event.key === OSD_STORAGE_KEY ||
    event.key === PLAYER_STORAGE_KEY ||
    event.key === PRESETS_STORAGE_KEY ||
    event.key === BUILTIN_OVERRIDES_STORAGE_KEY ||
    event.key === COVER_CONTROLS_STORAGE_KEY
  ) {
    scheduleAccuratePreview()
  }
}

injectFixStyle()

document.addEventListener('wheel', handleExploreWheel, { passive: false, capture: true })
document.addEventListener('scroll', handleCapturedScroll, true)
document.addEventListener('change', scheduleAccuratePreview, true)
document.addEventListener('click', scheduleAccuratePreview, true)
window.addEventListener('storage', handleStorage)
window.addEventListener(PRESET_COMMITTED_EVENT, scheduleAccuratePreview)

const previewObserver = new MutationObserver(scheduleAccuratePreview)
previewObserver.observe(document.documentElement, { childList: true, subtree: true })

const previewPollTimer = window.setInterval(() => {
  if (document.getElementById(PRESET_CONTROL_ID)) scheduleAccuratePreview()
}, 500)

;[0, 100, 300, 800].forEach((delay) => window.setTimeout(scheduleAccuratePreview, delay))

window.addEventListener(
  'beforeunload',
  () => {
    if (previewRenderFrame !== null) window.cancelAnimationFrame(previewRenderFrame)
    window.clearInterval(previewPollTimer)
    previewObserver.disconnect()
    document.removeEventListener('wheel', handleExploreWheel, true)
    document.removeEventListener('scroll', handleCapturedScroll, true)
    document.removeEventListener('change', scheduleAccuratePreview, true)
    document.removeEventListener('click', scheduleAccuratePreview, true)
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(PRESET_COMMITTED_EVENT, scheduleAccuratePreview)
  },
  { once: true }
)
