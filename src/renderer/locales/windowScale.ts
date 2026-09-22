export const windowScaleMessages = {
  en: {
    mainTitle: 'Main Window Scale Baseline',
    mainDescription:
      'The baseline controls minimum window geometry and preferred scale. If that combination would crop the interface, the actual zoom is automatically reduced to keep the full layout visible.',
    desktopTitle: 'Desktop Lyrics Scale Baseline',
    desktopDescription:
      'Desktop lyrics use the selected baseline values, with automatic fit protection when needed. Mini mode keeps separate lyric and cover/control baselines, with one shared corner radius.',
    compactDesktop: 'Mini Desktop Lyrics',
    normalDesktop: 'Normal Desktop Lyrics',
    minWidth: 'Minimum Width',
    minHeight: 'Minimum Height',
    baseFontSize: 'Baseline Font Size',
    lyricBaseFontSize: 'Lyrics Baseline Font Size',
    miniControlBaseSize: 'Cover & Controls Baseline',
    cornerRadius: 'Corner Radius',
    decrease: 'Decrease {field}',
    increase: 'Increase {field}',
    coarseDecrease: 'Coarse decrease {field} by {step}',
    coarseIncrease: 'Coarse increase {field} by {step}',
    fineDecrease: 'Fine decrease {field} by {step}',
    fineIncrease: 'Fine increase {field} by {step}',
    enterToApply: 'Enter a value and press Enter to preview',
    dragToAdjust: 'Drag to adjust {field}',
    calibrationHint:
      'Changes are previewed at the baseline window size. Confirm to save and release the window for normal resizing. Press Esc to cancel or Ctrl/Command + Enter to confirm.',
    restoreDefault: 'Restore Default',
    restoreDefaultHint: 'Restore this window scale baseline to the built-in defaults',
    confirm: 'Confirm',
    cancel: 'Cancel'
  },
  zh: {
    mainTitle: '主窗口缩放基准',
    mainDescription:
      '最小宽高决定窗口下限，基准字号决定期望缩放；若两者组合会导致界面裁切，实际缩放会自动降低到可完整显示的范围。',
    desktopTitle: '桌面歌词缩放基准',
    desktopDescription:
      '桌面歌词按设定基准缩放，并在需要时自动限制到完整显示范围；迷你模式可分别调整歌词与封面控件基准，圆角统一控制。',
    compactDesktop: '迷你桌面歌词',
    normalDesktop: '普通桌面歌词',
    minWidth: '最小宽度',
    minHeight: '最小高度',
    baseFontSize: '基准字号',
    lyricBaseFontSize: '歌词基准字号',
    miniControlBaseSize: '封面与控件基准',
    cornerRadius: '圆角大小',
    decrease: '减小{field}',
    increase: '增大{field}',
    coarseDecrease: '粗调减小{field}（−{step}）',
    coarseIncrease: '粗调增大{field}（+{step}）',
    fineDecrease: '精调减小{field}（−{step}）',
    fineIncrease: '精调增大{field}（+{step}）',
    enterToApply: '输入数值后按 Enter 预览',
    dragToAdjust: '拖动调节{field}',
    calibrationHint:
      '调整时窗口会实时进入基准尺寸预览；点击确认后保存，并释放窗口供正常拖拽缩放。按 Esc 取消，按 Ctrl/Command + Enter 确认。',
    restoreDefault: '恢复默认',
    restoreDefaultHint: '将当前窗口缩放基准恢复为应用内置默认值',
    confirm: '确认',
    cancel: '取消'
  },
  zht: {
    mainTitle: '主視窗縮放基準',
    mainDescription:
      '最小寬高決定視窗下限，基準字號決定期望縮放；若兩者組合會造成介面裁切，實際縮放會自動降低到可完整顯示的範圍。',
    desktopTitle: '桌面歌詞縮放基準',
    desktopDescription:
      '桌面歌詞依設定基準縮放，並在需要時自動限制到完整顯示範圍；迷你模式可分別調整歌詞與封面控制基準，圓角統一控制。',
    compactDesktop: '迷你桌面歌詞',
    normalDesktop: '普通桌面歌詞',
    minWidth: '最小寬度',
    minHeight: '最小高度',
    baseFontSize: '基準字號',
    lyricBaseFontSize: '歌詞基準字號',
    miniControlBaseSize: '封面與控制基準',
    cornerRadius: '圓角大小',
    decrease: '減小{field}',
    increase: '增大{field}',
    coarseDecrease: '粗調減小{field}（−{step}）',
    coarseIncrease: '粗調增大{field}（+{step}）',
    fineDecrease: '精調減小{field}（−{step}）',
    fineIncrease: '精調增大{field}（+{step}）',
    enterToApply: '輸入數值後按 Enter 預覽',
    dragToAdjust: '拖曳調整{field}',
    calibrationHint:
      '調整時視窗會即時進入基準尺寸預覽；按下確認後儲存，並釋放視窗供正常拖曳縮放。按 Esc 取消，按 Ctrl/Command + Enter 確認。',
    restoreDefault: '恢復預設',
    restoreDefaultHint: '將目前視窗縮放基準恢復為應用程式內建預設值',
    confirm: '確認',
    cancel: '取消'
  }
} as const
