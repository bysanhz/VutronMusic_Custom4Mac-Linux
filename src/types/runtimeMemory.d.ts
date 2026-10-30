/** Numeric-only lightweight sample. Working-set sums may count shared pages more than once. */
export type RuntimeMemorySample = {
  sampledAt: number
  platform: string
  mainPid: number
  mainWorkingSetMiB: number | null
  mainPrivateMiB: number | null
  desktopLyricsCount: number
  desktopLyricsWorkingSetMiB: number | null
  appWorkingSetMiB: number | null
  processCount: number
}
