/* ======== newADD start====== */
import router from '../router'
import { initializeBaselineWindowScale } from './baselineWindowScale'
import { initializeWindowScaleCalibration } from './windowScaleCalibration'

export const initializeSmoothWindowScale = () => {
  const cleanupCalibration = initializeWindowScaleCalibration(router)
  const cleanupScale = initializeBaselineWindowScale()

  return () => {
    cleanupScale?.()
    cleanupCalibration?.()
  }
}
/* =========== newADD end ======== */
