import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Type, Mode, TranslationMode } from '@/types/music'

export const useOsdLyricStore = defineStore(
  'osdLyric',
  () => {
    const show = ref(false)
    const type = ref<Type>('small')
    const mode = ref<Mode>('twoLines')
    const isLock = ref(false)
    const alwaysOnTop = ref(false)
    const fontSize = ref(26)
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
        fontSize.value = newState.fontSize ?? fontSize.value
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
