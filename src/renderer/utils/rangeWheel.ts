const wheelStates = new WeakMap<EventTarget, { delta: number; time: number }>()

export const wheelDirection = (event: WheelEvent): -1 | 0 | 1 => {
  const target = event.currentTarget
  if (!target || event.deltaY === 0) return 0
  if (target instanceof HTMLInputElement && target.disabled) return 0
  event.preventDefault()

  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1)
  const previous = wheelStates.get(target)
  const carried =
    previous &&
    event.timeStamp - previous.time <= 500 &&
    Math.sign(previous.delta) === Math.sign(delta)
      ? previous.delta
      : 0
  const total = carried + delta
  wheelStates.set(target, { delta: Math.abs(total) < 32 ? total : 0, time: event.timeStamp })
  if (Math.abs(total) < 32) return 0
  return delta < 0 ? 1 : -1
}

export const steppedRangeValue = (
  value: number,
  minimum: number,
  maximum: number,
  step: number,
  direction: -1 | 1
): number => {
  const decimals = (String(step).split('.')[1] ?? '').length
  const next = Math.min(maximum, Math.max(minimum, value + step * direction))
  return Number(next.toFixed(decimals))
}
