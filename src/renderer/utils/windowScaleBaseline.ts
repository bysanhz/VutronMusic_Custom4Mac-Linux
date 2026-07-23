/* ======== newADD start====== */
/**
 * 主窗口与桌面歌词窗口共用的缩放基准模型。
 *
 * 当窗口等于设定的最小宽高时，界面使用设定的基准字号；窗口继续增大时，
 * Electron webFrame 按窗口相对基准面积的平方根统一缩放全部元素。
 *
 * 迷你桌面歌词额外使用 miniControlBaseSize。它只控制左侧封面与控制按钮
 * 相对右侧歌词的比例，不参与 Electron 窗口缩放倍数计算。
 */

export type WindowScaleTarget = 'main' | 'osd-small' | 'osd-normal'

export type WindowScaleBaseline = {
  minWidth: number
  minHeight: number
  baseFontSize: number
  miniControlBaseSize: number
}

export type WindowScaleBaselineField =
  | 'minWidth'
  | 'minHeight'
  | 'baseFontSize'

export type WindowScaleCalibrationField =
  | WindowScaleBaselineField
  | 'miniControlBaseSize'

export type WindowScaleFieldRange = {
  min: number
  max: number
  step: number
}

export const WINDOW_SCALE_REFERENCE_FONT_SIZE = 16
export const WINDOW_SCALE_BASELINE_CHANGE_EVENT =
  'window-scale-baseline-change'

export const WINDOW_SCALE_BASELINE_KEYS: Record<
  WindowScaleTarget,
  {
    minWidth: string
    minHeight: string
    baseFontSize: string
  }
> = {
  main: {
    minWidth: 'mainWindowScaleMinWidth',
    minHeight: 'mainWindowScaleMinHeight',
    baseFontSize: 'mainWindowScaleBaseFontSize'
  },
  'osd-small': {
    minWidth: 'osdSmallWindowScaleMinWidth',
    minHeight: 'osdSmallWindowScaleMinHeight',
    baseFontSize: 'osdSmallWindowScaleBaseFontSize'
  },
  'osd-normal': {
    minWidth: 'osdNormalWindowScaleMinWidth',
    minHeight: 'osdNormalWindowScaleMinHeight',
    baseFontSize: 'osdNormalWindowScaleBaseFontSize'
  }
}

export const DEFAULT_WINDOW_SCALE_BASELINES: Record<
  WindowScaleTarget,
  WindowScaleBaseline
> = {
  main: {
    minWidth: 810,
    minHeight: 540,
    baseFontSize: 12,
    miniControlBaseSize: 12
  },
  'osd-small': {
    minWidth: 420,
    minHeight: 50,
    baseFontSize: 12,
    miniControlBaseSize: 12
  },
  'osd-normal': {
    minWidth: 360,
    minHeight: 400,
    baseFontSize: 12,
    miniControlBaseSize: 12
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

export const getDefaultWindowScaleBaseline = (
  target: WindowScaleTarget
): WindowScaleBaseline => {
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

  return {
    min: -100,
    max: 100,
    step:
      field === 'baseFontSize' || field === 'miniControlBaseSize'
        ? 0.1
        : 1
  }
}

export const sanitizeWindowScaleBaseline = (
  target: WindowScaleTarget,
  value: Partial<WindowScaleBaseline> | null | undefined
): WindowScaleBaseline => {
  const fallback = DEFAULT_WINDOW_SCALE_BASELINES[target]
  const baseFontSize = normalizeScaleValue(
    value?.baseFontSize,
    fallback.baseFontSize
  )

  return {
    minWidth: normalizeDimension(value?.minWidth, fallback.minWidth),
    minHeight: normalizeDimension(value?.minHeight, fallback.minHeight),
    baseFontSize,
    miniControlBaseSize: normalizeScaleValue(
      value?.miniControlBaseSize,
      baseFontSize
    )
  }
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

export const calculateWindowZoomFactor = (
  contentWidth: number,
  contentHeight: number,
  baseline: WindowScaleBaseline
) => {
  const geometryScale = calculateWindowGeometryScale(
    contentWidth,
    contentHeight,
    baseline
  )
  const baselineZoom =
    baseline.baseFontSize / WINDOW_SCALE_REFERENCE_FONT_SIZE

  return baselineZoom * geometryScale
}
/* =========== newADD end ======== */
