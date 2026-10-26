import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getPersistableMainWindowGeometry,
  resolveMainWindowGeometry
} from '../src/main/mainWindowGeometry'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
const min = { minWidth: 870, minHeight: 660 }

test('restores last normal size instead of resetting to the calibrated minimum', () => {
  expect(resolveMainWindowGeometry(
    { x: 100, y: 110, width: 1230, height: 810 },
    min, workArea
  )).toEqual({
    x: 100, y: 110, width: 1230, height: 810, minWidth: 870, minHeight: 660
  })
})

test('enforces the user minimum and preserves valid zero monitor coordinates', () => {
  expect(resolveMainWindowGeometry(
    { x: 0, y: 0, width: 120, height: 90 }, min, workArea
  )).toEqual({
    x: 0, y: 0, width: 870, height: 660, minWidth: 870, minHeight: 660
  })
})

test('clamps off-screen position and oversized saved window to current display', () => {
  expect(resolveMainWindowGeometry(
    { x: 2400, y: 2000, width: 2900, height: 1600 }, min, workArea
  )).toEqual({
    x: 0, y: 0, width: 1920, height: 1040, minWidth: 870, minHeight: 660
  })
  expect(resolveMainWindowGeometry(
    { x: -2000, y: -200, width: 1000, height: 720 }, min, workArea
  )).toEqual({
    x: 0, y: 0, width: 1000, height: 720, minWidth: 870, minHeight: 660
  })
})

test('supports multi-monitor negative origins and displays smaller than custom baseline', () => {
  expect(resolveMainWindowGeometry(
    { x: -1600, y: 0, width: 1300, height: 760 },
    min,
    { x: -1600, y: 0, width: 1600, height: 900 }
  )).toEqual({
    x: -1600, y: 0, width: 1300, height: 760, minWidth: 870, minHeight: 660
  })
  expect(resolveMainWindowGeometry(
    { width: 1100, height: 950 }, { minWidth: 1100, minHeight: 900 },
    { x: 100, y: 50, width: 800, height: 600 }
  )).toEqual({ width: 800, height: 600, minWidth: 800, minHeight: 600 })
})

test('rejects invalid or missing saved sizes instead of accepting tiny / NaN sizes', () => {
  expect(resolveMainWindowGeometry(
    { width: 0, height: Number.NaN }, min, workArea
  )).toEqual({ width: 870, height: 660, minWidth: 870, minHeight: 660 })
})

test('persists normal window bounds rather than maximized, minimized or fullscreen bounds', () => {
  const normal = { x: 200, y: 190, width: 1250, height: 800 }
  const maximized = { x: 0, y: 0, width: 1920, height: 1040 }
  const mock = (flags: { maximized?: boolean; minimized?: boolean; fullscreen?: boolean }) => ({
    isDestroyed: () => false,
    isMaximized: () => Boolean(flags.maximized),
    isMinimized: () => Boolean(flags.minimized),
    isFullScreen: () => Boolean(flags.fullscreen),
    getBounds: () => maximized,
    getNormalBounds: () => normal
  })
  expect(getPersistableMainWindowGeometry(mock({ maximized: true }))).toEqual({
    ...normal, maximized: true
  })
  expect(getPersistableMainWindowGeometry(mock({ minimized: true }))).toEqual({
    ...normal, maximized: false
  })
  expect(getPersistableMainWindowGeometry(mock({ fullscreen: true }))).toEqual({
    ...normal, maximized: false
  })
  expect(getPersistableMainWindowGeometry(mock({}))).toEqual({
    ...maximized, maximized: false
  })
  expect(getPersistableMainWindowGeometry({
    ...mock({}), isDestroyed: () => true
  })).toBeNull()
})

test('main window sets baseline limits in its constructor and saves on immediate exit', () => {
  const main = source('src/main/index.ts')
  const stores = source('src/main/store.ts')
  const ipc = source('src/main/IPCs.ts')
  const calibration = source('src/main/windowScaleBaseline.ts')

  expect(main).toContain('resolveMainWindowGeometry(')
  expect(main).toContain('...geometry,')
  expect(main).toContain('installMainWindowMinimumSizeGuard(this.win)')
  expect(stores).toContain('export const installMainWindowMinimumSizeGuard =')
  expect(stores).toContain('const [minWidth, minHeight] = window.getMinimumSize()')
  expect(main).toContain('useContentSize: false')
  expect(main).not.toContain('minWidth: 10,')
  expect(main).not.toContain('minHeight: 10,')
  expect(main).toContain('this.win.on(\'close\', (e) => {\n      persistMainWindowGeometry(this.win)')
  expect(main).toContain('this.win.on(\'hide\', persistWindowBounds)')
  expect(main).toContain('this.win.on(\'maximize\', persistWindowBounds)')
  expect(main).toContain('this.win.on(\'unmaximize\', persistWindowBounds)')
  expect(main).toContain('persistMainWindowGeometry(this.win)')
  expect(main).toContain("store.get('window.maximized')")
  expect(stores).toContain("isWindowScaleCalibrationActive('main', window)")
  expect(stores).toContain('getPersistableMainWindowGeometry(window)')
  expect(stores).toContain('window.setMinimumSize(minWidth, minHeight)')
  expect(ipc).toContain("persistMainWindowGeometry(win)")
  expect(calibration).toContain('window.setResizable(session?.resizable ?? true)\n      window.setMinimumSize(')
})
