const OSD_COVER_CONTROLS_VISIBILITY_KEY = 'vutronmusic-osd-cover-controls-visible'
const OSD_COVER_CONTROLS_HIDDEN_CLASS = 'osd-cover-controls-hidden'

/**
 * 读取紧凑桌面歌词左侧封面与控制按钮是否显示。
 *
 * Returns:
 *   未保存过设置时默认返回 true；否则返回持久化的布尔值。
 *
 * Raises:
 *   localStorage 不可用时返回默认值，不向外抛出异常。
 */
export const readOsdCoverControlsVisibility = (): boolean => {
  try {
    const savedValue = localStorage.getItem(OSD_COVER_CONTROLS_VISIBILITY_KEY)
    return savedValue === null ? true : savedValue === 'true'
  } catch (error) {
    console.warn('[OsdCoverControls] 读取封面控件可见性失败：', error)
    return true
  }
}

/**
 * 保存紧凑桌面歌词左侧封面与控制按钮可见性。
 *
 * Args:
 *   visible: 是否显示左侧封面与控制按钮。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   localStorage 不可用时仅输出警告，不向外抛出异常。
 */
export const saveOsdCoverControlsVisibility = (visible: boolean): void => {
  try {
    localStorage.setItem(OSD_COVER_CONTROLS_VISIBILITY_KEY, String(visible))
  } catch (error) {
    console.warn('[OsdCoverControls] 保存封面控件可见性失败：', error)
  }
}

/**
 * 将当前设置映射到桌面歌词页面根节点的 CSS 类。
 *
 * Args:
 *   visible: 是否显示左侧封面与控制按钮。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   不抛出异常。
 */
const applyOsdCoverControlsVisibility = (visible: boolean): void => {
  document.documentElement.classList.toggle(OSD_COVER_CONTROLS_HIDDEN_CLASS, !visible)
}

/**
 * 初始化桌面歌词窗口中的封面控件可见性同步。
 *
 * 详细说明：
 * 主窗口和桌面歌词窗口使用同一 origin 的 localStorage。设置页面修改后，
 * 桌面歌词窗口通过 storage 事件即时更新；首次加载时直接应用持久化值。
 * 该设置只决定可见性，不依赖桌面歌词是否处于锁定状态。
 *
 * Returns:
 *   移除 storage 监听器的清理函数。
 *
 * Raises:
 *   不抛出异常。
 */
export const initializeOsdCoverControlsVisibility = (): (() => void) => {
  applyOsdCoverControlsVisibility(readOsdCoverControlsVisibility())

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== OSD_COVER_CONTROLS_VISIBILITY_KEY) return
    applyOsdCoverControlsVisibility(event.newValue === null ? true : event.newValue === 'true')
  }

  window.addEventListener('storage', handleStorage)

  return () => {
    window.removeEventListener('storage', handleStorage)
  }
}
