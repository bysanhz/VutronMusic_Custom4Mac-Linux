/* ======== newADD start====== */
/**
 * 主窗口与桌面歌词窗口共用的缩放基准模型。
 *
 * 当窗口等于设定的最小宽高时，界面使用设定的基准字号；窗口继续增大时，
 * Electron webFrame 按窗口相对基准面积的平方根统一缩放全部元素。
 *
 * 迷你桌面歌词额外使用 miniControlBaseSize。它只控制左侧封面与控制按钮
 * 相对右侧歌词的比例，不参与 Electron 窗口缩放倍数计算。
 *
 * cornerRadius 是桌面歌词统一圆角基准。它不参与 zoomFactor 计算，而是作为
 * CSS 基准值统一驱动窗口、封面控制区、歌词行、锁定按钮与拖动条等圆角。
 */

export type WindowScaleTarget = 'main' | 'osd-small' | 'osd-normal'

export type WindowScaleBaseline = {
  minWidth: number
  minHeight: number
  baseFontSize: number
  miniControlBaseSize: number
  cornerRadius: number
}

export type WindowScaleBaselineField = 'minWidth' | 'minHeight' | 'baseFontSize'

export type WindowScaleCalibrationField =
  | WindowScaleBaselineField
  | 'miniControlBaseSize'
  | 'cornerRadius'

export type WindowScaleFieldRange = {
  min: number
  max: number
  step: number
}

export type WindowScaleStepMode = 'coarse' | 'fine'

export const WINDOW_SCALE_REFERENCE_FONT_SIZE = 16
export const WINDOW_SCALE_BASELINE_CHANGE_EVENT = 'window-scale-baseline-change'

export const WINDOW_SCALE_BASELINE_KEYS: Record<
  WindowScaleTarget,
  {
    minWidth: string
    minHeight: string
    baseFontSize: string
    cornerRadius: string
  }
> = {
  main: {
    minWidth: 'mainWindowScaleMinWidth',
    minHeight: 'mainWindowScaleMinHeight',
    baseFontSize: 'mainWindowScaleBaseFontSize',
    cornerRadius: 'mainWindowScaleCornerRadius'
  },
  'osd-small': {
    minWidth: 'osdSmallWindowScaleMinWidth',
    minHeight: 'osdSmallWindowScaleMinHeight',
    baseFontSize: 'osdSmallWindowScaleBaseFontSize',
    cornerRadius: 'osdSmallWindowScaleCornerRadius'
  },
  'osd-normal': {
    minWidth: 'osdNormalWindowScaleMinWidth',
    minHeight: 'osdNormalWindowScaleMinHeight',
    baseFontSize: 'osdNormalWindowScaleBaseFontSize',
    cornerRadius: 'osdNormalWindowScaleCornerRadius'
  }
}

export const DEFAULT_WINDOW_SCALE_BASELINES: Record<WindowScaleTarget, WindowScaleBaseline> = {
  main: {
    minWidth: 810,
    minHeight: 540,
    baseFontSize: 12,
    miniControlBaseSize: 12,
    cornerRadius: 8
  },
  'osd-small': {
    minWidth: 420,
    minHeight: 50,
    baseFontSize: 12,
    miniControlBaseSize: 12,
    cornerRadius: 12
  },
  'osd-normal': {
    minWidth: 360,
    minHeight: 400,
    baseFontSize: 12,
    miniControlBaseSize: 12,
    cornerRadius: 4
  }
}

const normalizeDimension = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(1, Math.round(parsed))
}

const normalizeScaleValue = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.round(parsed * 100) / 100
}

const normalizeNonNegativeValue = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.round(parsed * 100) / 100
}

export const getDefaultWindowScaleBaseline = (target: WindowScaleTarget): WindowScaleBaseline => {
  return { ...DEFAULT_WINDOW_SCALE_BASELINES[target] }
}

/**
 * 旧设置控件创建阶段仍需要一个临时 range 定义。
 * 实际交互由相对增量滑块接管，最终基准值没有固定上下限。
 */
export const getWindowScaleFieldRange = (
  target: WindowScaleTarget,
  field: WindowScaleCalibrationField
): WindowScaleFieldRange => {
  void target

  if (field === 'cornerRadius') {
    return {
      min: 0,
      max: 100,
      step: 1
    }
  }

  return {
    min: -100,
    max: 100,
    step: field === 'baseFontSize' || field === 'miniControlBaseSize' ? 0.1 : 1
  }
}

export const sanitizeWindowScaleBaseline = (
  target: WindowScaleTarget,
  value: Partial<WindowScaleBaseline> | null | undefined
): WindowScaleBaseline => {
  const fallback = DEFAULT_WINDOW_SCALE_BASELINES[target]
  const baseFontSize = normalizeScaleValue(value?.baseFontSize, fallback.baseFontSize)

  return {
    minWidth: normalizeDimension(value?.minWidth, fallback.minWidth),
    minHeight: normalizeDimension(value?.minHeight, fallback.minHeight),
    baseFontSize,
    miniControlBaseSize: normalizeScaleValue(value?.miniControlBaseSize, baseFontSize),
    cornerRadius: normalizeNonNegativeValue(value?.cornerRadius, fallback.cornerRadius)
  }
}

export const getWindowScaleAdjustmentStep = (
  field: WindowScaleCalibrationField,
  mode: WindowScaleStepMode
) => {
  if (field === 'minWidth' || field === 'minHeight') {
    return mode === 'coarse' ? 10 : 1
  }
  if (field === 'cornerRadius') {
    return mode === 'coarse' ? 2 : 0.5
  }
  return mode === 'coarse' ? 0.5 : 0.1
}

export const calculateWindowGeometryScale = (
  contentWidth: number,
  contentHeight: number,
  baseline: WindowScaleBaseline
) => {
  const widthScale = Math.max(1, contentWidth / baseline.minWidth)
  const heightScale = Math.max(1, contentHeight / baseline.minHeight)
  return Math.sqrt(widthScale * heightScale)
}

const getSafeLayoutReferenceSize = (target: WindowScaleTarget) => {
  const defaults = DEFAULT_WINDOW_SCALE_BASELINES[target]
  const defaultZoom = defaults.baseFontSize / WINDOW_SCALE_REFERENCE_FONT_SIZE

  return {
    width: defaults.minWidth / defaultZoom,
    height: defaults.minHeight / defaultZoom
  }
}

/**
 * 计算页面 zoom，同时保证缩放后的 CSS viewport 不会小于该窗口模式的内置安全布局尺寸。
 *
 * 用户可以把最小宽高调得比默认值更小；此时如果仍严格按基准字号放大页面，
 * webFrame zoom 会反向压缩 CSS viewport，造成右侧卡片/顶部区域被裁切。
 * fitZoomLimit 只在这种“基准组合与完整布局冲突”的情况下接管，否则保留原缩放结果。
 */
export const calculateWindowZoomFactor = (
  contentWidth: number,
  contentHeight: number,
  baseline: WindowScaleBaseline,
  target: WindowScaleTarget = 'main'
) => {
  const geometryScale = calculateWindowGeometryScale(contentWidth, contentHeight, baseline)
  const baselineZoom = baseline.baseFontSize / WINDOW_SCALE_REFERENCE_FONT_SIZE
  const requestedZoom = baselineZoom * geometryScale
  const safeLayout = getSafeLayoutReferenceSize(target)
  const fitZoomLimit = Math.max(
    0.05,
    Math.min(contentWidth / safeLayout.width, contentHeight / safeLayout.height)
  )

  return Math.min(requestedZoom, fitZoomLimit)
}
/* =========== newADD end ======== */
