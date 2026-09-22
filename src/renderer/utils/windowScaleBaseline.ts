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

  // 字号不设固定最小值/最大值。仅拒绝非有限值与 <= 0，
  // 因为 Electron zoomFactor 必须保持为正数，否则 renderer 会进入无效缩放状态。
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

/**
 * 计算页面 zoom。
 *
 * 不再使用 fit-safe 上限夹住用户设置的字号。只要 baseFontSize 是有效正数，
 * 用户输入/步进得到的字号会直接参与 zoomFactor 计算，不存在固定上限或下限。
 *
 * target 参数保留在函数签名中，避免调用侧兼容性变化；当前不再用于限制字号。
 */
export const calculateWindowZoomFactor = (
  contentWidth: number,
  contentHeight: number,
  baseline: WindowScaleBaseline,
  target: WindowScaleTarget = 'main'
) => {
  void target

  const geometryScale = calculateWindowGeometryScale(contentWidth, contentHeight, baseline)
  const baselineZoom = baseline.baseFontSize / WINDOW_SCALE_REFERENCE_FONT_SIZE

  return baselineZoom * geometryScale
}
/* =========== newADD end ======== */
