/* ======== newADD start====== */
import { initializeBaselineOsdWindowScale } from './baselineOsdWindowScale'
import { initializeMiniOsdPanelScale } from './miniOsdPanelScale'

export const initializeSmoothOsdWindowScale = () => {
  const cleanupBaselineScale = initializeBaselineOsdWindowScale()
  const cleanupMiniPanelScale = initializeMiniOsdPanelScale()

  return () => {
    cleanupMiniPanelScale?.()
    cleanupBaselineScale?.()
  }
}
/* =========== newADD end ======== */
