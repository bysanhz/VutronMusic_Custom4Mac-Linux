import { defineStore } from 'pinia'
import { nextTick, reactive, ref, watch } from 'vue'
import { type UpdateCheckResult } from 'electron-updater'
import { type IFontInfo } from 'font-list'
import type { TrackSourceType } from '@/types/music'
import type { LayoutMode } from '@/types/theme'

type ScrollState = {
  scrollTop: number
  containerHeight: number
  listHeight: number
}

// ======== newADD start======
type FontSelectOption = {
  label: string
  value: string
  /** Chromium 实际使用的字体族回退链。 */
  fontFamily: string
  /** 字体名称、字体族和 PostScript 名称组成的搜索文本。 */
  searchText: string
}
// =========== newADD end ========

// ======== newADD start======
export type ExtendedUpdateCheckResult = UpdateCheckResult & {
  manualDownload?: boolean
  releaseUrl?: string
  installFormat?: string
}
// =========== newADD end ========

export const useNormalStateStore = defineStore('state', () => {
  const enableScrolling = ref(true)
  const virtualScrolling = ref(false)
  const showLyrics = ref(false)
  const searchTab = ref('track')
  const exploreTab = ref('playlist')
  const setConvolverModal = ref(false)
  const setPlaybackRateModal = ref(false)
  const setPitchModal = ref(false)
  const setThemeModal = ref(false)
  const setFontModal = ref(false)
  const setSaveThemeModal = ref(false)
  // ======== newADD start======
  const systemDefaultFontOption: FontSelectOption = {
    label: '系统默认',
    value: 'system-ui',
    fontFamily: 'system-ui',
    searchText: '系统默认 system-ui'
  }
  const fontList = ref<FontSelectOption[]>([systemDefaultFontOption])
  // =========== newADD end ========
  const extensionCheckResult = ref(false)
  const modalOpen = ref(false)
  const addTrackToPlaylistModal = ref({
    show: false,
    selectedTrackID: [0] as (number | string)[],
    type: 'online' as TrackSourceType | 'all'
  })
  const newPlaylistModal = ref({
    show: false,
    type: 'online' as TrackSourceType,
    afterCreateAddTrackID: [0] as (number | string)[]
  })
  const accurateMatchModal = ref({
    show: false,
    selectedTrackID: 0
  })
  const backgroundModal = ref({
    show: false,
    type: 'Classic' as LayoutMode
  })
  const editPlaylistModal = ref({
    show: false,
    type: 'online' as TrackSourceType,
    playlistID: 0,
    info: { title: '', description: '', tags: [] }
  })
  const selectDirModal = ref(false)

  const toast = reactive({
    show: false,
    text: '',
    timer: null as any
  })
  const dailyTracks = ref<any[]>([])

  const scrollbar = reactive({
    instances: {} as Record<string, ScrollState>,
    active: null as string | null
  })

  const updateStatus = ref(false)
  const isDownloading = ref(false)
  const latestVersion = ref<ExtendedUpdateCheckResult | null>(null)
  // ======== newADD start======
  const updateError = ref('')
  // =========== newADD end ========

  const amuseServerRunning = ref(false)
  const amuseServerErrorMsg = ref<string | null>(null)

  const registerInstance = (tabId: string) => {
    if (!scrollbar.instances[tabId]) {
      scrollbar.instances[tabId] = {
        scrollTop: 0,
        containerHeight: 0,
        listHeight: 0
      }
    }
    scrollbar.active = tabId
  }

  const unregisterInstance = (tabId: string) => {
    if (scrollbar.active === tabId) {
      scrollbar.active = null
    }
    if (Object.prototype.hasOwnProperty.call(scrollbar.instances, tabId)) {
      delete scrollbar.instances[tabId]
    }
  }

  // ======== newADD start======
  /**
   * 将系统字体名称转换为安全的 CSS font-family 项。
   *
   * Args:
   *   value: 字体族、完整字体名或 PostScript 名称。
   *
   * Returns:
   *   可直接拼接进 font-family 的字符串。
   *
   * Raises:
   *   不抛出异常。
   */
  const quoteFontFamily = (value: string): string => {
    if (value === 'system-ui') return value
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }

  /**
   * 把 font-list 返回值转换为支持真实字体预览与搜索的选项。
   *
   * Args:
   *   font: font-list 返回的单个系统字体信息。
   *
   * Returns:
   *   可用的字体选项；缺少名称时返回 null。
   *
   * Raises:
   *   不抛出异常。
   */
  const createFontOption = (font: IFontInfo): FontSelectOption | null => {
    const label = font.name || font.familyName || font.postScriptName
    const value = font.postScriptName || font.name || font.familyName

    if (!label || !value) return null

    const familyCandidates = [font.familyName, font.name, font.postScriptName].filter(
      (item): item is string => Boolean(item)
    )
    const uniqueFamilies = [...new Set(familyCandidates)]

    return {
      label,
      value,
      fontFamily: [...uniqueFamilies.map(quoteFontFamily), 'system-ui'].join(', '),
      searchText: uniqueFamilies.join(' ')
    }
  }
  // =========== newADD end ========

  const getFontList = () => {
    window.mainApi?.invoke('getFontList').then((fonts: IFontInfo[]) => {
      // ======== newADD start======
      const normalizedFonts = Array.isArray(fonts)
        ? fonts.filter((font): font is IFontInfo => Boolean(font && typeof font === 'object'))
        : []

      const fontOptions = normalizedFonts
        .filter((font) => font.familyName !== 'system-ui')
        .map(createFontOption)
        .filter((option): option is FontSelectOption => option !== null)

      const uniqueOptions = [...new Map(fontOptions.map((option) => [option.value, option])).values()]
      fontList.value = [systemDefaultFontOption, ...uniqueOptions]
      // =========== newADD end ========
    })
  }

  const updateScroll = (tabId: string, payload: Partial<ScrollState>) => {
    if (scrollbar.instances[tabId]) {
      scrollbar.instances[tabId] = { ...scrollbar.instances[tabId], ...payload }
    }
  }

  const showToast = (text: string) => {
    if (toast.timer !== null) {
      clearTimeout(toast.timer)
    }
    toast.show = true
    toast.text = text
    toast.timer = setTimeout(() => {
      toast.show = false
      toast.text = ''
      toast.timer = null
    }, 3200)
  }

  // ======== newADD start======
  const checkUpdate = async () => {
    if (updateStatus.value) return

    updateStatus.value = true
    updateError.value = ''

    try {
      const result = (await window.mainApi?.invoke('check-update')) as
        | ExtendedUpdateCheckResult
        | null
        | undefined

      if (result) {
        latestVersion.value = result
      } else {
        throw new Error('更新服务未返回版本信息')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      updateError.value = message
      showToast(`检查更新失败：${message}`)
    } finally {
      updateStatus.value = false
    }
  }
  // =========== newADD end ========

  watch(
    enableScrolling,
    (value) => {
      nextTick(() => {
        document.getElementById('main')!.style.overflowY = value ? 'auto' : 'hidden'
      })
    },
    { immediate: true }
  )

  window.mainApi?.on(
    'updateAmuseServerStatus',
    (event: any, running: boolean, err: string | null) => {
      amuseServerRunning.value = running
      amuseServerErrorMsg.value = err
    }
  )

  return {
    enableScrolling,
    virtualScrolling,
    showLyrics,
    searchTab,
    exploreTab,
    setConvolverModal,
    setPlaybackRateModal,
    setPitchModal,
    setThemeModal,
    setFontModal,
    selectDirModal,
    setSaveThemeModal,
    fontList,
    extensionCheckResult,
    addTrackToPlaylistModal,
    editPlaylistModal,
    newPlaylistModal,
    accurateMatchModal,
    backgroundModal,
    dailyTracks,
    toast,
    modalOpen,
    scrollbar,
    updateStatus,
    latestVersion,
    isDownloading,
    updateError,
    amuseServerRunning,
    amuseServerErrorMsg,
    showToast,
    getFontList,
    registerInstance,
    unregisterInstance,
    updateScroll,
    checkUpdate
  }
})
