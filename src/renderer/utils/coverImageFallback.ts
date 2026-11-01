import type { ObjectDirective } from 'vue'
import { buildNeteaseImageProxyUrl, isNeteaseAssetUrl } from '../../shared/neteaseAssetUrl'

const states = new WeakMap<HTMLImageElement, { source: string; stage: number; error: () => void }>()
const fallback = 'atom://get-default-pic'

/** One same-resource proxy fallback, then a local placeholder; no timers or retained old images. */
export const vCoverFallback: ObjectDirective<HTMLImageElement, string> = {
  mounted(image, binding) {
    const state = { source: binding.value || '', stage: 0, error: () => {} }
    state.error = () => {
      if (state.stage >= 2) return
      const proxy =
        state.stage === 0 && isNeteaseAssetUrl(state.source)
          ? buildNeteaseImageProxyUrl(state.source)
          : ''
      state.stage = proxy ? 1 : 2
      image.src = proxy || fallback
    }
    states.set(image, state)
    image.setAttribute('data-vutron-cover', '')
    image.addEventListener('error', state.error)
    if (image.getAttribute('src') && image.complete && image.naturalWidth === 0) state.error()
  },
  updated(image, binding) {
    const state = states.get(image)
    if (state && binding.value !== state.source) {
      state.source = binding.value || ''
      state.stage = 0
      // Vue may leave src untouched if a render repeats the original binding after DOM fallback.
      if (image.getAttribute('src') !== state.source) image.src = state.source
    }
  },
  beforeUnmount(image) {
    const state = states.get(image)
    if (state) image.removeEventListener('error', state.error)
    states.delete(image)
  }
}
