import type { Ref } from 'vue'
import { watch } from 'vue'

type FontInfo = {
  name?: string
  familyName?: string
  postScriptName?: string
}

const OSD_FONT_FAMILY_VARIABLE = '--osd-font-family'

/**
 * 清理字体名称两侧可能存在的引号。
 *
 * Args:
 *   value: 设置中保存的字体名称。
 *
 * Returns:
 *   可用于字体匹配的原始名称。
 *
 * Raises:
 *   不抛出异常。
 */
const normalizeFontName = (value: string): string => {
  return value.trim().replace(/^['"]+|['"]+$/g, '')
}

/**
 * 将字体名称转换为安全的 CSS font-family 项。
 *
 * Args:
 *   value: 字体名称。
 *
 * Returns:
 *   system-ui 保持关键字形式，其余名称使用双引号包裹。
 *
 * Raises:
 *   不抛出异常。
 */
const quoteCssFontFamily = (value: string): string => {
  if (value === 'system-ui') return value

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * 根据持久化字体标识解析浏览器可稳定识别的字体族回退链。
 *
 * 详细说明：
 * 旧实现把 font-list 返回的 PostScript 名称直接写入 font-family。
 * GTK/Pango 可以按字体族与字重选择真实字形，但 Chromium 在 Linux 下
 * 对 PostScript 名称的 font-family 匹配并不稳定，匹配失败时会回退到系统字体。
 * 这里优先使用 familyName，同时保留旧 PostScript 名称作为兼容回退。
 *
 * Args:
 *   selectedFont: 设置中保存的字体名称或 PostScript 名称。
 *   fonts: 主进程返回的系统字体详细信息。
 *
 * Returns:
 *   可直接写入 CSS 自定义属性的字体族列表。
 *
 * Raises:
 *   不抛出异常。
 */
const buildFontFamilyStack = (selectedFont: string, fonts: FontInfo[]): string => {
  const normalizedSelected = normalizeFontName(selectedFont || 'system-ui')

  const matchedFont = fonts.find((font) => {
    return [font.familyName, font.name, font.postScriptName]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeFontName(value) === normalizedSelected)
  })

  const candidates = [
    matchedFont?.familyName,
    matchedFont?.name,
    matchedFont?.postScriptName,
    normalizedSelected,
    'system-ui'
  ].filter((value): value is string => Boolean(value))

  const uniqueCandidates = [...new Set(candidates.map(normalizeFontName))]
  return uniqueCandidates.map(quoteCssFontFamily).join(', ')
}

/**
 * 初始化桌面歌词字体解析与实时同步。
 *
 * Args:
 *   font: Pinia 中的桌面歌词字体响应式引用。
 *
 * Returns:
 *   Vue watch 的停止函数。
 *
 * Raises:
 *   获取字体列表失败时退回当前设置值和 system-ui，不向外抛出异常。
 */
export const initializeOsdFontRendering = (font: Ref<string>): (() => void) => {
  let requestSequence = 0

  return watch(
    font,
    async (selectedFont) => {
      const currentSequence = ++requestSequence
      let fonts: FontInfo[] = []

      try {
        const result = await window.mainApi?.invoke('getFontList')
        if (Array.isArray(result)) {
          fonts = result.filter(
            (item): item is FontInfo => Boolean(item && typeof item === 'object')
          )
        }
      } catch (error) {
        console.warn('[OsdFontRendering] 获取系统字体信息失败：', error)
      }

      if (currentSequence !== requestSequence) return

      const fontFamilyStack = buildFontFamilyStack(selectedFont, fonts)
      document.documentElement.style.setProperty(OSD_FONT_FAMILY_VARIABLE, fontFamilyStack)
    },
    { immediate: true }
  )
}
