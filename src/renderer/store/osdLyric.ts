import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { Type, Mode, TranslationMode } from '@/types/music'

const LEGACY_FIXED_LYRIC_FONT_SIZE = 26
const BUILTIN_LYRIC_PALETTE_VERSION = '1'
const BUILTIN_LYRIC_PALETTE_VERSION_KEY = 'vutronmusic-osd-lyric-palette-version'
const BUILTIN_LYRIC_BACKGROUND = 'rgba(0, 0, 0, 0)'
const BUILTIN_LYRIC_PLAYED = 'rgba(7, 185, 187, 1)'
const BUILTIN_LYRIC_UNPLAYED = 'rgba(239, 152, 207, 1)'
const BUILTIN_LYRIC_SHADOW = 'rgba(0, 0, 0, 0)'

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
    const backgroundColor = ref(BUILTIN_LYRIC_BACKGROUND)
    const playedLrcColor = ref(BUILTIN_LYRIC_PLAYED)
    const unplayLrcColor = ref(BUILTIN_LYRIC_UNPLAYED)
    const textShadow = ref(BUILTIN_LYRIC_SHADOW)
    const font = ref('system-ui')
    // ======== newADD start======
    // 桌面歌词文本对齐方式：left / center / right。
    const align = ref<'left' | 'center' | 'right'>('center')
    // =========== newADD end ========

    /**
     * 将本次内置歌词配色写入已经存在的持久化配置。
     *
     * Pinia persistedstate 会恢复用户之前保存的 osdLyric 状态，因此仅修改 ref 默认值
     * 不能影响已经安装过的用户。这里使用独立版本标记，在 hydration 完成后的下一轮事件循环
     * 执行一次迁移；之后用户仍可自由修改颜色，不会在每次启动时被强制覆盖。
     */
    const migrateBuiltinLyricPalette = () => {
      if (window.localStorage.getItem(BUILTIN_LYRIC_PALETTE_VERSION_KEY) === BUILTIN_LYRIC_PALETTE_VERSION) {
        return
      }

      backgroundColor.value = BUILTIN_LYRIC_BACKGROUND
      playedLrcColor.value = BUILTIN_LYRIC_PLAYED
      unplayLrcColor.value = BUILTIN_LYRIC_UNPLAYED
      textShadow.value = BUILTIN_LYRIC_SHADOW
      window.localStorage.setItem(
        BUILTIN_LYRIC_PALETTE_VERSION_KEY,
        BUILTIN_LYRIC_PALETTE_VERSION
      )
    }

    window.setTimeout(migrateBuiltinLyricPalette, 0)

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
