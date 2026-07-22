import { ref } from 'vue'

// ======== newADD start======
/**
 * 全局歌词时间偏移。
 *
 * 详细说明：
 * 1. 播放器使用 `当前播放时间 + offset` 计算歌词进度，因此正值表示歌词提前；
 * 2. 负值表示歌词延后；
 * 3. 设置保存在 localStorage 中，重启应用和切换歌曲后继续生效；
 * 4. 偏移范围限制在 -30s 到 30s，避免误操作产生异常值。
 */
const GLOBAL_LYRIC_OFFSET_KEY = 'globalLyricOffset'
const MIN_GLOBAL_LYRIC_OFFSET = -30
const MAX_GLOBAL_LYRIC_OFFSET = 30

const normalizeGlobalLyricOffset = (value: number) => {
  if (!Number.isFinite(value)) return 0

  const clamped = Math.min(MAX_GLOBAL_LYRIC_OFFSET, Math.max(MIN_GLOBAL_LYRIC_OFFSET, value))
  return Math.round(clamped * 10) / 10
}

const readGlobalLyricOffset = () => {
  try {
    return normalizeGlobalLyricOffset(Number(localStorage.getItem(GLOBAL_LYRIC_OFFSET_KEY)))
  } catch (error) {
    console.warn('[GlobalLyricOffset] 读取全局歌词偏移失败：', error)
    return 0
  }
}

export const globalLyricOffset = ref(readGlobalLyricOffset())

/**
 * 保存全局歌词偏移。
 *
 * Args:
 *   value: 新的歌词偏移秒数。
 *
 * Returns:
 *   规范化并实际保存的歌词偏移秒数。
 */
export const setGlobalLyricOffset = (value: number) => {
  const normalized = normalizeGlobalLyricOffset(value)
  globalLyricOffset.value = normalized

  try {
    localStorage.setItem(GLOBAL_LYRIC_OFFSET_KEY, normalized.toString())
  } catch (error) {
    console.warn('[GlobalLyricOffset] 保存全局歌词偏移失败：', error)
  }

  return normalized
}
// =========== newADD end ========
