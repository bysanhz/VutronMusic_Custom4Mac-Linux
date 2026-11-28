/** Report visible overflow while allowing deliberate ellipsis and local scroll regions. */
export const inspectFontLayout = () => {
  const main = document.querySelector<HTMLElement>('#main')!
  const issues: Array<{ element: string; text: string; reason: string; pixels: number }> = []
  const identify = (el: HTMLElement) => `${el.tagName.toLowerCase()}.${el.className}`
  const candidates = [
    ...main.querySelectorAll<HTMLElement>(
      'h1,h2,h3,p,dt,dd,button,strong,small,label,.tab,.text,.title,.subtitle,.content-info > div,.section-one,.tabs-row,.sync-status-panel,.sync-status-help,.hero,.window-scale-font-label'
    ),
    ...document.querySelectorAll<HTMLElement>('.player button,.player strong,.player .text')
  ]
  for (const el of candidates) {
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    if (!box.width || !box.height || style.visibility === 'hidden' || !el.getClientRects().length)
      continue
    if (['absolute', 'fixed'].includes(style.position) || el.closest('.sync-screen-reader-only'))
      continue
    // Artwork controls can intentionally protrude; they contain no translated text.
    if (el.tagName === 'BUTTON' && !el.textContent?.trim()) continue
    if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) continue
    const overflow = el.clientWidth ? el.scrollWidth - el.clientWidth : 0
    const verticalOverflow = el.clientHeight ? el.scrollHeight - el.clientHeight : 0
    if (overflow > 2)
      issues.push({
        element: identify(el),
        text: el.textContent?.trim().slice(0, 80) || '',
        reason: 'content overflow',
        pixels: overflow
      })
    const parent = el.parentElement
    if (!parent) continue
    const parentStyle = getComputedStyle(parent)
    const parentBox = parent.getBoundingClientRect()
    // Font ascenders may extend beyond a line box without clipping or overlap.
    if (
      verticalOverflow > 2 &&
      ['hidden', 'clip'].includes(parentStyle.overflowY) &&
      box.bottom + verticalOverflow > parentBox.bottom + 2
    )
      issues.push({
        element: identify(el),
        text: el.textContent?.trim().slice(0, 80) || '',
        reason: 'text clipped vertically',
        pixels: verticalOverflow
      })
    if (
      !['flex', 'grid'].includes(parentStyle.display) ||
      ['auto', 'scroll', 'hidden', 'clip'].includes(parentStyle.overflowX)
    )
      continue
    if (box.right > parentBox.right + 2)
      issues.push({
        element: identify(el),
        text: el.textContent?.trim().slice(0, 80) || '',
        reason: 'outside parent',
        pixels: Math.round(box.right - parentBox.right)
      })
  }
  for (const row of main.querySelectorAll('.sync-status-help > div')) {
    const label = row.querySelector('dt')!.getBoundingClientRect()
    const description = row.querySelector('dd')!.getBoundingClientRect()
    if (
      label.y < description.bottom &&
      description.y < label.bottom &&
      label.right > description.x + 1
    ) {
      issues.push({
        element: 'sync-status-help',
        text: row.textContent || '',
        reason: 'overlapping columns',
        pixels: Math.round(label.right - description.x)
      })
    }
  }
  for (const row of main.querySelectorAll('.window-scale-font-row')) {
    const label = row.querySelector<HTMLElement>('.window-scale-font-label')!
    const button = row.querySelector<HTMLElement>('button')!
    const labelBox = label.getBoundingClientRect()
    const buttonBox = button.getBoundingClientRect()
    if (!labelBox.width || !buttonBox.width) continue
    if (label.scrollWidth - label.clientWidth > 1 || labelBox.right > buttonBox.x + 1) {
      issues.push({
        element: 'window-scale-font-row',
        text: label.textContent || '',
        reason: 'label overlaps controls',
        pixels: Math.max(
          label.scrollWidth - label.clientWidth,
          Math.round(labelBox.right - buttonBox.x)
        )
      })
    }
  }
  const nav = document.querySelector('nav')!
  const tabs = nav.querySelector<HTMLElement>('.search-tabs')
  const firstTab = tabs?.querySelector<HTMLElement>('.item')
  if (tabs && firstTab && tabs.scrollLeft === 0) {
    const contentLeft =
      main.getBoundingClientRect().left + parseFloat(getComputedStyle(main).paddingLeft)
    const offset = Math.abs(firstTab.getBoundingClientRect().left - contentLeft)
    if (offset > 1)
      issues.push({
        element: 'nav .search-tabs',
        text: firstTab.textContent || '',
        reason: 'tabs misaligned with content',
        pixels: offset
      })
    const controls = nav.querySelector('.right-part')!.getBoundingClientRect()
    if (tabs.getBoundingClientRect().right > controls.left + 1)
      issues.push({
        element: 'nav .search-tabs',
        text: '',
        reason: 'tabs overlap account controls',
        pixels: tabs.getBoundingClientRect().right - controls.left
      })
  }
  const player = document.querySelector('.player')!
  return {
    playerOverflow: player.scrollWidth - player.clientWidth,
    mainOverflow: main.scrollWidth - main.clientWidth,
    navOverflow: nav.scrollWidth - nav.clientWidth,
    issues: issues.slice(0, 25)
  }
}
