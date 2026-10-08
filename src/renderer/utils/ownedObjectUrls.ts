/** Releases blob URLs when the resource that owns them is replaced or disposed. */
export class OwnedObjectUrls {
  private urls = new Set<string>()

  replace(urls: Iterable<string>): void {
    const next = new Set(Array.from(urls).filter((url) => url.startsWith('blob:')))
    for (const url of this.urls) {
      if (!next.has(url)) URL.revokeObjectURL(url)
    }
    this.urls = next
  }

  clear(): void {
    this.replace([])
  }
}
