/* ======== newADD start====== */
const STYLE_ID = 'osd-color-settings-layout-style'

/**
 * 优化桌面歌词颜色选择区域的响应式布局。
 *
 * 原布局复用了通用 item 的 flex 规则，窗口整体缩放后容易出现色块错位、
 * 不等距和大面积空白。这里仅匹配直接包含颜色选择器的设置项。
 */
export const initializeOsdColorSettingsLayout = () => {
  document.getElementById(STYLE_ID)?.remove()

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #app .system-settings .item:has(> .color) {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(140px, 1fr));
      gap: 22px 28px;
      align-items: start;
      justify-items: center;
      width: min(100%, 560px);
      margin: 14px auto 20px;
      padding: 18px 20px 22px;
      box-sizing: border-box;
      border-radius: 14px;
      background: color-mix(
        in srgb,
        var(--color-secondary-bg),
        transparent 35%
      );
    }

    #app .system-settings .item:has(> .color) > .color {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      width: 100%;
      min-width: 0;
      margin: 0 !important;
      text-align: center;
    }

    #app .system-settings .item:has(> .color) > .color .text {
      width: 100%;
      margin: 0 !important;
      line-height: 1.35;
      white-space: normal;
      text-align: center;
      opacity: 0.82;
    }

    #app .system-settings .item:has(> .color) > .color > *:first-child {
      flex: 0 0 auto;
    }

    @media (max-width: 720px) {
      #app .system-settings .item:has(> .color) {
        grid-template-columns: minmax(140px, 1fr);
        width: min(100%, 320px);
        gap: 18px;
        padding: 16px;
      }
    }
  `
  document.head.appendChild(style)

  return () => {
    document.getElementById(STYLE_ID)?.remove()
  }
}
/* =========== newADD end ======== */
