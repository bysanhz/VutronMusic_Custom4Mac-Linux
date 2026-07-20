/* ======== newADD start====== */
/**
 * 主窗口全界面连续缩放。
 *
 * 概述：
 * 使用 Electron webFrame 的页面缩放能力，让主窗口中的字体、SVG 图标、图片、
 * 按钮、边距、圆角和所有路由页面使用同一个连续缩放比例。这样可以避免依赖
 * 多组 CSS 媒体查询后，在临界宽度处切换布局模型所产生的跳变。
 *
 * 详细说明：
 * 1. 以 1080 × 720 为设计基准，此尺寸下缩放比例为 1；
 * 2. 使用窗口面积比例的平方根，使横向、纵向和对角拖动都会连续改变元素尺寸；
 * 3. 保证缩放后的逻辑视口不小于 768 × 480，避免原始桌面布局被挤压或裁切；
 * 4. resize 事件通过 requestAnimationFrame 合并，避免一次拖动触发大量重复渲染；
 * 5. 根据当前 zoomFactor 还原窗口真实内容尺寸，防止缩放后 innerWidth/innerHeight
 *    变化造成反馈振荡；
 * 6. 该逻辑只运行在主窗口 renderer，不影响独立的桌面歌词 BrowserWindow。
 */

const DESIGN_WIDTH = 1080
const DESIGN_HEIGHT = 720
const MIN_LAYOUT_WIDTH = 768
const MIN_LAYOUT_HEIGHT = 480
const MIN_ZOOM_FACTOR = 0.25
const MAX_ZOOM_FACTOR = 2
const ZOOM_EPSILON = 0.001

type RuntimeWindow = Window & {
  __vutronSmoothWindowScaleCleanup__?: () => void
}

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value))
}

/**
 * 初始化主窗口连续缩放监听。
 *
 * Returns:
 * 用于移除 resize 监听并取消待执行动画帧的清理函数。
 */
export const initializeSmoothWindowScale = () => {
  const runtimeWindow = window as RuntimeWindow

  // Vite 热更新时先清理上一轮监听，避免重复注册。
  runtimeWindow.__vutronSmoothWindowScaleCleanup__?.()

  if (!window.mainApi?.setZoomFactor || !window.mainApi?.getZoomFactor) {
    return () => undefined
  }

  let animationFrameId: number | null = null

  const updateZoomFactor = () => {
    animationFrameId = null

    const currentZoomFactor = window.mainApi?.getZoomFactor() || 1

    // 页面缩放会改变 innerWidth/innerHeight。乘回当前比例后，得到 BrowserWindow
    // 实际的内容区尺寸，从而避免缩放比例在 resize 过程中来回振荡。
    const contentWidth = Math.max(1, window.innerWidth * currentZoomFactor)
    const contentHeight = Math.max(1, window.innerHeight * currentZoomFactor)

    const widthScale = contentWidth / DESIGN_WIDTH
    const heightScale = contentHeight / DESIGN_HEIGHT

    // 面积比例的平方根可以让只改变宽度或只改变高度时，全部元素仍然同步缩放。
    const areaScale = Math.sqrt(widthScale * heightScale)

    // 限制最大可用缩放比例，确保页面缩放后的逻辑视口不会小于原项目可稳定
    // 显示的桌面布局尺寸。这里是连续约束，不会像媒体查询一样突然换布局。
    const widthFitScale = contentWidth / MIN_LAYOUT_WIDTH
    const heightFitScale = contentHeight / MIN_LAYOUT_HEIGHT

    const nextZoomFactor = clamp(
      Math.min(areaScale, widthFitScale, heightFitScale),
      MIN_ZOOM_FACTOR,
      MAX_ZOOM_FACTOR
    )

    document.documentElement.style.setProperty(
      '--main-window-zoom-factor',
      nextZoomFactor.toFixed(4)
    )

    if (Math.abs(nextZoomFactor - currentZoomFactor) < ZOOM_EPSILON) return

    window.mainApi?.setZoomFactor(nextZoomFactor)
  }

  const scheduleZoomUpdate = () => {
    if (animationFrameId !== null) return
    animationFrameId = window.requestAnimationFrame(updateZoomFactor)
  }

  // 在 Vue 挂载前先设置一次，尽量避免窗口打开时先显示未缩放布局再跳到目标尺寸。
  updateZoomFactor()
  window.addEventListener('resize', scheduleZoomUpdate, { passive: true })

  const cleanup = () => {
    window.removeEventListener('resize', scheduleZoomUpdate)
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    delete runtimeWindow.__vutronSmoothWindowScaleCleanup__
  }

  runtimeWindow.__vutronSmoothWindowScaleCleanup__ = cleanup
  return cleanup
}
/* =========== newADD end ======== */
