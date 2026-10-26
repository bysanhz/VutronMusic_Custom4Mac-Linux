/**
 * Restore and persist normal main-window geometry across launches.
 *
 * Input: electron-store window bounds, the user's calibrated minimum size,
 * and the active display's workArea (all in Electron device-independent px).
 * Output: safe startup bounds and minimum limits; or the last normal bounds.
 *
 * Always save outer BrowserWindow bounds, since the main window is created
 * with useContentSize: false. Keeping both units consistent avoids the gradual
 * size drift that happens when getBounds() is restored as content size.
 */
export type WindowRect = { x: number; y: number; width: number; height: number }

export type SavedMainWindowGeometry = Partial<WindowRect> & { maximized?: boolean }

export type MainWindowMinimum = { minWidth: number; minHeight: number }

const integerOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback

const clamp = (value: number, lower: number, upper: number): number =>
  Math.max(lower, Math.min(value, upper))

export const resolveMainWindowGeometry = (
  stored: SavedMainWindowGeometry | null | undefined,
  minimum: MainWindowMinimum,
  workArea: WindowRect
): { width: number; height: number; minWidth: number; minHeight: number; x?: number; y?: number } => {
  const availableWidth = integerOr(workArea.width, 560)
  const availableHeight = integerOr(workArea.height, 380)
  // If a custom baseline exceeds the current display, the display is the
  // physical limit. Otherwise the user's chosen baseline is authoritative.
  const minWidth = Math.min(integerOr(minimum.minWidth, 560), availableWidth)
  const minHeight = Math.min(integerOr(minimum.minHeight, 380), availableHeight)
  const width = clamp(integerOr(stored?.width, minWidth), minWidth, availableWidth)
  const height = clamp(integerOr(stored?.height, minHeight), minHeight, availableHeight)

  const result: {
    width: number
    height: number
    minWidth: number
    minHeight: number
    x?: number
    y?: number
  } = { width, height, minWidth, minHeight }

  // Zero and negative monitor coordinates are valid; don't use truthiness.
  if (Number.isFinite(stored?.x) && Number.isFinite(stored?.y)) {
    result.x = clamp(
      Math.round(stored!.x!),
      workArea.x,
      workArea.x + availableWidth - width
    )
    result.y = clamp(
      Math.round(stored!.y!),
      workArea.y,
      workArea.y + availableHeight - height
    )
  }
  return result
}

export type MainWindowGeometrySource = {
  isDestroyed(): boolean
  isMaximized(): boolean
  isFullScreen(): boolean
  isMinimized(): boolean
  getBounds(): WindowRect
  getNormalBounds(): WindowRect
}

export const getPersistableMainWindowGeometry = (
  window: MainWindowGeometrySource
): (WindowRect & { maximized: boolean }) | null => {
  if (window.isDestroyed()) return null
  const maximized = window.isMaximized()
  // Maximized, fullscreen and minimized geometry is not the user's normal
  // size. Electron maintains getNormalBounds() for exactly these states.
  const bounds =
    maximized || window.isFullScreen() || window.isMinimized()
      ? window.getNormalBounds()
      : window.getBounds()
  if (
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null
  }
  return { ...bounds, maximized }
}
