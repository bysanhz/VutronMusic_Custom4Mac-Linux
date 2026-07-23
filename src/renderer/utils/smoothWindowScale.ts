/* ======== newADD start====== */
import router from '../router'
import { initializeBaselineWindowScale } from './baselineWindowScale'
import { initializeDesktopLyricScaleLabels } from './desktopLyricScaleLabels'
import { initializeMiniOsdScaleSettings } from './miniOsdScaleSettings'
import { initializeWindowScaleCalibration } from './windowScaleCalibration'

export const initializeSmoothWindowScale = () => {
  const cleanupCalibration = initializeWindowScaleCalibration(router)
  const cleanupMiniOsdSettings = initializeMiniOsdScaleSettings(router)
  const cleanupDesktopLyricLabels =
    initializeDesktopLyricScaleLabels(router)
  const cleanupScale = initializeBaselineWindowScale()

  return () => {
    cleanupScale?.()
    cleanupDesktopLyricLabels?.()
    cleanupMiniOsdSettings?.()
    cleanupCalibration?.()
  }
}
/* =========== newADD end ======== */
