export type ScreenPoint = {
  x: number
  y: number
}

export type ScreenRectangle = {
  x: number
  y: number
  width: number
  height: number
}

export const isPointInsideRectangle = (
  point: ScreenPoint,
  rectangle: ScreenRectangle,
  padding = 0
): boolean => {
  const safePadding = Number.isFinite(padding) ? Math.max(0, padding) : 0
  const left = rectangle.x - safePadding
  const top = rectangle.y - safePadding
  const right = rectangle.x + Math.max(0, rectangle.width) + safePadding
  const bottom = rectangle.y + Math.max(0, rectangle.height) + safePadding

  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
}
