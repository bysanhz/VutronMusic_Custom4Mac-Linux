/* ======== newADD start====== */
import router from '../router'
import { initializeBaselineWindowScale } from './baselineWindowScale'
import { initializeDesktopLyricScaleLabels } from './desktopLyricScaleLabels'
import { initializeMiniOsdScaleSettings } from './miniOsdScaleSettings'
import { initializeWindowScaleCalibration } from './windowScaleCalibration'
import { initializeWindowScaleCalibrationModal } from './windowScaleCalibrationModal'

export const initializeSmoothWindowScale = () => {
  const cleanupCalibration = initializeWindowScaleCalibration(router)
  const cleanupCalibrationModal =
    initializeWindowScaleCalibrationModal(router)
  const cleanupMiniOsdSettings = initializeMiniOsdScaleSettings(router)
  const cleanupDesktopLyricLabels =
    initializeDesktopLyricScaleLabels(router)
  const cleanupScale = initializeBaselineWindowScale()

  return () => {
    cleanupScale?.()
    cleanupDesktopLyricLabels?.()
    cleanupMiniOsdSettings?.()
    cleanupCalibrationModal?.()
    cleanupCalibration?.()
  }
}
/* =========== newADD end ======== */
