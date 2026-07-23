/* ======== newADD start====== */
import router from '../router'
import { initializeBaselineWindowScale } from './baselineWindowScale'
import { initializeDesktopLyricScaleLabels } from './desktopLyricScaleLabels'
import { initializeMiniOsdScaleSettings } from './miniOsdScaleSettings'
import { initializeOsdColorSettingsLayout } from './osdColorSettingsLayout'
import { initializeWindowScaleCalibration } from './windowScaleCalibration'
import { initializeWindowScaleInlineActions } from './windowScaleInlineActions'

export const initializeSmoothWindowScale = () => {
  const cleanupCalibration = initializeWindowScaleCalibration(router)
  const cleanupMiniOsdSettings = initializeMiniOsdScaleSettings(router)
  const cleanupInlineActions = initializeWindowScaleInlineActions()
  const cleanupColorLayout = initializeOsdColorSettingsLayout()
  const cleanupDesktopLyricLabels =
    initializeDesktopLyricScaleLabels(router)
  const cleanupScale = initializeBaselineWindowScale()

  return () => {
    cleanupScale?.()
    cleanupDesktopLyricLabels?.()
    cleanupColorLayout?.()
    cleanupInlineActions?.()
    cleanupMiniOsdSettings?.()
    cleanupCalibration?.()
  }
}
/* =========== newADD end ======== */
