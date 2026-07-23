/* ======== newADD start====== */
import router from '../router'
import { initializeBaselineWindowScale } from './baselineWindowScale'
import { initializeDesktopLyricScaleLabels } from './desktopLyricScaleLabels'
import { initializeMiniOsdScaleSettings } from './miniOsdScaleSettings'
import { initializeOsdColorSettingsLayout } from './osdColorSettingsLayout'
import { initializeWindowScaleCalibrationV2 } from './windowScaleCalibrationV2'

export const initializeSmoothWindowScale = () => {
  const cleanupCalibration = initializeWindowScaleCalibrationV2(router)
  const cleanupMiniOsdSettings = initializeMiniOsdScaleSettings(router)
  const cleanupColorLayout = initializeOsdColorSettingsLayout()
  const cleanupDesktopLyricLabels =
    initializeDesktopLyricScaleLabels(router)
  const cleanupScale = initializeBaselineWindowScale()

  return () => {
    cleanupScale?.()
    cleanupDesktopLyricLabels?.()
    cleanupColorLayout?.()
    cleanupMiniOsdSettings?.()
    cleanupCalibration?.()
  }
}
/* =========== newADD end ======== */
