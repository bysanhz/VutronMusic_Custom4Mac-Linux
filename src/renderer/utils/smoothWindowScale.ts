/* ======== newADD start====== */
import router from '../router'
import { initializeBaselineWindowScale } from './baselineWindowScale'
import { initializeWindowScaleCalibration } from './windowScaleCalibration'

export const initializeSmoothWindowScale = () => {
  const cleanupScale = initializeBaselineWindowScale()
  const cleanupCalibration = initializeWindowScaleCalibration(router)

  return () => {
    cleanupCalibration?.()
    cleanupScale?.()
  }
}
/* =========== newADD end ======== */
