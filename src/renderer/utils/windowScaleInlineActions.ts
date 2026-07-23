/* ======== newADD start====== */
const STYLE_ID = 'window-scale-inline-actions-style'

/**
 * 为窗口缩放校准提供非阻塞的内联确认/取消操作条。
 *
 * 操作条仅在对应设置组进入校准状态时显示，始终位于当前参数组底部，
 * 不创建遮罩层，也不会覆盖或阻止继续调整参数。
 */
export const initializeWindowScaleInlineActions = () => {
  document.getElementById(STYLE_ID)?.remove()

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .window-scale-calibration-actions {
      display: none !important;
      grid-column: 1 / -1;
      width: 100%;
      box-sizing: border-box;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      pointer-events: none;
    }

    [data-window-scale-calibrating='true']
      > .window-scale-calibration-actions {
      display: flex !important;
      justify-content: flex-end;
      align-items: center;
      margin-top: 6px !important;
      padding-top: 8px !important;
      border-top: 1px solid
        color-mix(in srgb, var(--color-text), transparent 88%) !important;
      pointer-events: auto;
      -webkit-app-region: no-drag;
    }

    .window-scale-calibration-hint {
      display: none !important;
    }

    .window-scale-calibration-buttons {
      display: flex !important;
      justify-content: flex-end !important;
      align-items: center;
      gap: 8px;
      width: auto;
      pointer-events: auto;
    }

    .window-scale-calibration-button {
      min-width: 70px;
      height: 32px;
      padding: 0 14px;
      border: 1px solid
        color-mix(in srgb, var(--color-text), transparent 88%);
      border-radius: 8px;
      color: var(--color-text);
      background: color-mix(in srgb, var(--color-text), transparent 94%);
      cursor: pointer;
      font-weight: 700;
      line-height: 1;
      pointer-events: auto;
      user-select: none;
      -webkit-app-region: no-drag;
    }

    .window-scale-calibration-button:hover {
      background: color-mix(in srgb, var(--color-text), transparent 88%);
    }

    .window-scale-calibration-button:active {
      transform: scale(0.96);
    }

    .window-scale-calibration-button[data-calibration-action='confirm'] {
      border-color: transparent;
      color: #fff;
      background: var(--color-primary, #335eea);
    }

    .window-scale-calibration-button[data-calibration-action='confirm']:hover {
      filter: brightness(0.96);
    }
  `
  document.head.appendChild(style)

  return () => {
    document.getElementById(STYLE_ID)?.remove()
  }
}
/* =========== newADD end ======== */
