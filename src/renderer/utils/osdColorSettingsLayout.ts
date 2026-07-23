/* ======== newADD start====== */
const STYLE_ID = 'osd-color-settings-layout-style'
const GRID_CLASS = 'osd-color-settings-grid'
const SETTINGS_SELECTOR = '#app .system-settings'

let observer: MutationObserver | null = null
let decorateFrame: number | null = null

const injectStyle = () => {
  document.getElementById(STYLE_ID)?.remove()

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #app .system-settings .item.${GRID_CLASS} {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      grid-template-rows: repeat(2, auto) !important;
      grid-auto-flow: row !important;
      gap: 20px 28px;
      align-items: start;
      justify-items: center;
      width: min(100%, 520px);
      margin: 14px auto 22px;
      padding: 18px 20px 22px;
      box-sizing: border-box;
      border-radius: 14px;
      background: color-mix(
        in srgb,
        var(--color-secondary-bg),
        transparent 35%
      );
    }

    #app .system-settings .item.${GRID_CLASS} > .color {
      display: flex !important;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      place-self: start center !important;
      grid-column: auto !important;
      grid-row: auto !important;
      gap: 8px;
      width: 100%;
      min-width: 0;
      margin: 0 !important;
      text-align: center;
    }

    #app .system-settings .item.${GRID_CLASS} > .color:nth-child(1) {
      grid-column: 1 !important;
      grid-row: 1 !important;
    }

    #app .system-settings .item.${GRID_CLASS} > .color:nth-child(2) {
      grid-column: 2 !important;
      grid-row: 1 !important;
    }

    #app .system-settings .item.${GRID_CLASS} > .color:nth-child(3) {
      grid-column: 1 !important;
      grid-row: 2 !important;
    }

    #app .system-settings .item.${GRID_CLASS} > .color:nth-child(4) {
      grid-column: 2 !important;
      grid-row: 2 !important;
    }

    #app .system-settings .item.${GRID_CLASS} > .color .text {
      width: 100%;
      margin: 0 !important;
      line-height: 1.35;
      white-space: normal;
      text-align: center;
      opacity: 0.82;
    }

    #app .system-settings .item.${GRID_CLASS} > .color > *:first-child {
      flex: 0 0 auto;
    }

    @media (max-width: 640px) {
      #app .system-settings .item.${GRID_CLASS} {
        grid-template-columns: minmax(0, 1fr) !important;
        grid-template-rows: repeat(4, auto) !important;
        width: min(100%, 300px);
        gap: 18px;
        padding: 16px;
      }

      #app .system-settings .item.${GRID_CLASS} > .color:nth-child(n) {
        grid-column: 1 !important;
        grid-row: auto !important;
      }
    }
  `
  document.head.appendChild(style)
}

const findColorGridItems = () => {
  const settings = document.querySelector<HTMLElement>(SETTINGS_SELECTOR)
  if (!settings) return []

  return Array.from(settings.querySelectorAll<HTMLElement>('.item')).filter(
    (item) => {
      const directColors = Array.from(item.children).filter((child) =>
        child.classList.contains('color')
      )
      return directColors.length === 4
    }
  )
}

const decorateColorGrid = () => {
  decorateFrame = null
  observer?.disconnect()

  document
    .querySelectorAll<HTMLElement>(`.${GRID_CLASS}`)
    .forEach((item) => item.classList.remove(GRID_CLASS))

  findColorGridItems().forEach((item) => item.classList.add(GRID_CLASS))

  const settings = document.querySelector<HTMLElement>(SETTINGS_SELECTOR)
  observer?.observe(settings ?? document.documentElement, {
    childList: true,
    subtree: true
  })
}

const scheduleDecorate = () => {
  if (decorateFrame !== null) return
  decorateFrame = window.requestAnimationFrame(decorateColorGrid)
}

export const initializeOsdColorSettingsLayout = () => {
  injectStyle()
  observer = new MutationObserver(scheduleDecorate)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
  scheduleDecorate()

  return () => {
    observer?.disconnect()
    observer = null
    document
      .querySelectorAll<HTMLElement>(`.${GRID_CLASS}`)
      .forEach((item) => item.classList.remove(GRID_CLASS))
    document.getElementById(STYLE_ID)?.remove()

    if (decorateFrame !== null) {
      window.cancelAnimationFrame(decorateFrame)
      decorateFrame = null
    }
  }
}
/* =========== newADD end ======== */