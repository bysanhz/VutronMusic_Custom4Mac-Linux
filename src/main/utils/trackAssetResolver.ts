/** A missing or broken metadata source must not prevent the next source from being used. */
export const resolveTrackAsset = async <T>(
  order: readonly string[],
  loaders: Record<string, () => Promise<unknown>>,
  isUsable: (value: unknown) => value is T,
  onError: (source: string) => void
): Promise<T | null> => {
  for (const source of order) {
    const load = loaders[source]
    if (!load) continue
    try {
      const value = await load()
      if (isUsable(value)) return value
    } catch {
      onError(source)
    }
  }
  return null
}
