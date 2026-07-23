import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { Type, Mode, TranslationMode } from '@/types/music'

const LEGACY_FIXED_LYRIC_FONT_SIZE = 26

export const useOsdLyricStore = defineStore(
  'osdLyric',
  () => {
    const show = ref(false)
    const type = ref<Type>('small')
    const mode = ref<Mode>('twoLines')
    const isLock = ref(false)
    const alwaysOnTop = ref(false)
    // ======== newADD start======
    // 旧版独立歌词字号仅为兼容历史持久化数据保留。
    // 新版统一由窗口最小尺寸和基准字号控制整体缩放。
    const fontSize = ref(LEGACY_FIXED_LYRIC_FONT_SIZE)
    watch(
      fontSize,
      (value) => {
        if (value !== LEGACY_FIXED_LYRIC_FONT_SIZE) {
          fontSize.value = LEGACY_FIXED_LYRIC_FONT_SIZE
        }
      },
      { immediate: true, flush: 'sync' }
    )
    // =========== newADD end ========
    const staticTime = ref(1500)
    const showButtonWhenLock = ref(true)
    const isWordByWord = ref(true)
    const translationMode = ref<TranslationMode>('tlyric')
    const backgroundColor = ref('rgba(0, 0, 0, 0)')
    const playedLrcColor = ref('#37cf88')
    const unplayLrcColor = ref('rgba(210, 210, 210, 1)')
    const textShadow = ref('rgba(0, 0, 0, 0.2)')
    const font = ref('system-ui')
    // ======== newADD start======
    // 桌面歌词文本对齐方式：left / center / right。
    const align = ref<'left' | 'center' | 'right'>('center')
    // =========== newADD end ========

    window.addEventListener('storage', (event) => {
      if (event.key !== 'osdLyric') return

      try {
        const newState = JSON.parse(event.newValue || '{}')
        if (!newState || typeof newState !== 'object' || !Object.keys(newState).length) return

        show.value = newState.show ?? show.value
        type.value = newState.type ?? type.value
        mode.value = newState.mode ?? mode.value
        isLock.value = newState.isLock ?? isLock.value
        alwaysOnTop.value = newState.alwaysOnTop ?? alwaysOnTop.value
        staticTime.value = newState.staticTime ?? staticTime.value
        showButtonWhenLock.value = newState.showButtonWhenLock ?? showButtonWhenLock.value
        isWordByWord.value = newState.isWordByWord ?? isWordByWord.value
        backgroundColor.value = newState.backgroundColor ?? backgroundColor.value
        playedLrcColor.value = newState.playedLrcColor ?? playedLrcColor.value
        unplayLrcColor.value = newState.unplayLrcColor ?? unplayLrcColor.value
        textShadow.value = newState.textShadow ?? textShadow.value
        translationMode.value = newState.translationMode ?? translationMode.value
        font.value = newState.font ?? font.value
        align.value = ['left', 'center', 'right'].includes(newState.align)
          ? newState.align
          : align.value
      } catch (error) {
        console.warn('[OsdLyricStore] 同步桌面歌词设置失败：', error)
      }
    })

    return {
      show,
      type,
      mode,
      isLock,
      alwaysOnTop,
      fontSize,
      staticTime,
      isWordByWord,
      backgroundColor,
      playedLrcColor,
      unplayLrcColor,
      textShadow,
      translationMode,
      showButtonWhenLock,
      font,
      align
    }
  },
  {
    persist: true
  }
)
