/** Only the range containing currentTime can keep the current playback uninterrupted. */
export const getBufferedAheadSeconds = (
  audio: Pick<HTMLMediaElement, 'buffered' | 'currentTime'> | null
): number => {
  if (!audio) return 0
  for (let index = 0; index < audio.buffered.length; index += 1) {
    if (
      audio.buffered.start(index) <= audio.currentTime &&
      audio.currentTime <= audio.buffered.end(index)
    ) {
      return Math.max(0, audio.buffered.end(index) - audio.currentTime)
    }
  }
  return 0
}
