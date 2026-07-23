/* ======== newADD start====== */
export type WindowScaleTarget = 'main' | 'osd-small' | 'osd-normal'

export type WindowScaleBaseline = {
  minWidth: number
  minHeight: number
  baseFontSize: number
}

export const DEFAULT_WINDOW_SCALE_BASELINES: Record<
  WindowScaleTarget,
  WindowScaleBaseline
> = {
  main: {
    minWidth: 810,
    minHeight: 540,
    baseFontSize: 12
  },
  'osd-small': {
    minWidth: 420,
    minHeight: 50,
    baseFontSize: 12
  },
  'osd-normal': {
    minWidth: 360,
    minHeight: 400,
    baseFontSize: 12
  }
}

const TARGET_LIMITS: Record<
  WindowScaleTarget,
  {
    minWidth: number
    minHeight: number
  }
> = {
  main: {
    minWidth: 480,
    minHeight: 320
  },
  'osd-small': {
    minWidth: 240,
    minHeight: 36
  },
  'osd-normal': {
    minWidth: 280,
    minHeight: 320
  }
}

const MAX_MIN_WIDTH = 3840
const MAX_MIN_HEIGHT = 2160
const MIN_BASE_FONT_SIZE = 8
const MAX_BASE_FONT_SIZE = 48

const clampNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)))
}

export const getDefaultWindowScaleBaseline = (
  target: WindowScaleTarget
): WindowScaleBaseline => {
  return { ...DEFAULT_WINDOW_SCALE_BASELINES[target] }
}

export const sanitizeWindowScaleBaseline = (
  target: WindowScaleTarget,
  value: Partial<WindowScaleBaseline> | null | undefined
): WindowScaleBaseline => {
  const fallback = DEFAULT_WINDOW_SCALE_BASELINES[target]
  const limits = TARGET_LIMITS[target]

  return {
    minWidth: clampNumber(
      value?.minWidth,
      fallback.minWidth,
      limits.minWidth,
      MAX_MIN_WIDTH
    ),
    minHeight: clampNumber(
      value?.minHeight,
      fallback.minHeight,
      limits.minHeight,
      MAX_MIN_HEIGHT
    ),
    baseFontSize: clampNumber(
      value?.baseFontSize,
      fallback.baseFontSize,
      MIN_BASE_FONT_SIZE,
      MAX_BASE_FONT_SIZE
    )
  }
}
/* =========== newADD end ======== */
