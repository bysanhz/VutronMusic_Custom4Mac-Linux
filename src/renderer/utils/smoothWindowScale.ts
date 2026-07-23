/* ======== newADD start====== */
import router from '../router'
import { initializeBaselineWindowScale } from './baselineWindowScale'
import { initializeMiniOsdScaleSettings } from './miniOsdScaleSettings'
import { initializeWindowScaleCalibration } from './windowScaleCalibration'

export const initializeSmoothWindowScale = () => {
  const cleanupCalibration = initializeWindowScaleCalibration(router)
  const cleanupMiniOsdSettings = initializeMiniOsdScaleSettings(router)
  const cleanupScale = initializeBaselineWindowScale()

  return () => {
    cleanupScale?.()
    cleanupMiniOsdSettings?.()
    cleanupCalibration?.()
  }
}
/* =========== newADD end ======== */
